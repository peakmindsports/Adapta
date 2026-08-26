import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export function runtime() { return env as unknown as RuntimeEnv; }

export function ownerFrom(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return email || null;
}

export const SITE_ADMIN_EMAIL = "manugalan102@gmail.com";
export const GLOBAL_MODEL_OWNER = "global-model-setting";
export function isSiteAdmin(request: Request) { return ownerFrom(request) === SITE_ADMIN_EMAIL; }

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
export function authenticationError() {
  return jsonError("Inicia sesión con ChatGPT para utilizar esta herramienta.", 401);
}

export async function activeOwnerFrom(request: Request) {
  const owner = ownerFrom(request);
  if (!owner) return null;
  await ensureSchema();
  if (owner === SITE_ADMIN_EMAIL) return owner;
  const user = await runtime().DB.prepare("SELECT blocked, deleted FROM app_users WHERE email = ?").bind(owner).first<{ blocked: number; deleted: number }>();
  return user?.blocked || user?.deleted ? null : owner;
}

export function estimateApiCost(model: string, inputTokens: number, outputTokens: number) {
  const normalized = model.toLowerCase();
  let rates: [number, number] | null = null;
  if (normalized.includes("5.6-luna")) rates = [0.2, 1.2];
  else if (normalized.includes("5.6-terra")) rates = [2, 12];
  else if (normalized.includes("5.6-sol")) rates = [4, 20];
  else if (normalized.includes("5.4-mini")) rates = [0.75, 4.5];
  else if (normalized.includes("5.4-nano")) rates = [0.2, 1.25];
  else if (normalized.includes("5.4")) rates = [2.5, 15];
  else if (normalized.includes("5-mini")) rates = [0.25, 2];
  else if (normalized.includes("5-nano")) rates = [0.05, 0.4];
  else if (/gpt-5(?:-|$)/.test(normalized)) rates = [1.25, 10];
  if (!rates) return null;
  return (inputTokens * rates[0] + outputTokens * rates[1]) / 1_000_000;
}

export async function recordApiUsage(owner: string, operation: string, model: string, data: any) {
  const inputTokens = Number(data?.usage?.input_tokens || 0);
  const outputTokens = Number(data?.usage?.output_tokens || 0);
  const cost = estimateApiCost(model, inputTokens, outputTokens);
  await runtime().DB.prepare("INSERT INTO api_usage (id, owner_email, operation, model, input_tokens, output_tokens, estimated_cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), owner, operation, model, inputTokens, outputTokens, cost, Date.now()).run();
}

export async function consumeDailyQuota(owner: string, bucket: "generation" | "recommendation", limit: number) {
  if (owner === SITE_ADMIN_EMAIL) return { allowed: true, remaining: null };
  const day = new Date().toISOString().slice(0, 10);
  const result = await runtime().DB.prepare("INSERT INTO daily_usage (owner_email, usage_date, bucket, used, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(owner_email, usage_date, bucket) DO UPDATE SET used = used + 1, updated_at = excluded.updated_at WHERE used < ?").bind(owner, day, bucket, Date.now(), limit).run();
  const usage = await runtime().DB.prepare("SELECT used FROM daily_usage WHERE owner_email = ? AND usage_date = ? AND bucket = ?").bind(owner, day, bucket).first<{ used: number }>();
  const used = usage?.used || 0;
  return { allowed: Boolean(result.meta.changes), remaining: Math.max(0, limit - used) };
}

export function safeFilename(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "archivo";
}

export async function ensureSchema() {
  const { DB } = runtime();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, student_name TEXT, current_course TEXT, target_course TEXT, status TEXT DEFAULT 'draft' NOT NULL, result TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS job_files (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, owner_email TEXT NOT NULL, category TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL, storage_key TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (job_id) REFERENCES jobs(id) ON UPDATE no action ON DELETE cascade)`),
    DB.prepare("CREATE INDEX IF NOT EXISTS jobs_owner_created_idx ON jobs(owner_email, created_at DESC)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS job_files_job_idx ON job_files(job_id)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS user_settings (owner_email TEXT PRIMARY KEY NOT NULL, model TEXT DEFAULT 'gpt-5-mini' NOT NULL, updated_at INTEGER NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS context_phrases (id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, category TEXT NOT NULL, phrase TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS context_phrases_owner_idx ON context_phrases(owner_email, category)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS shared_project_reads (owner_email TEXT NOT NULL, project_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (owner_email, project_id))"),
    DB.prepare("CREATE INDEX IF NOT EXISTS shared_project_reads_owner_idx ON shared_project_reads(owner_email, read_at)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS daily_usage (owner_email TEXT NOT NULL, usage_date TEXT NOT NULL, bucket TEXT NOT NULL, used INTEGER DEFAULT 0 NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (owner_email, usage_date, bucket))"),
    DB.prepare("CREATE TABLE IF NOT EXISTS app_users (email TEXT PRIMARY KEY NOT NULL, display_name TEXT, blocked INTEGER DEFAULT 0 NOT NULL, deleted INTEGER DEFAULT 0 NOT NULL, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS api_usage (id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, operation TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER DEFAULT 0 NOT NULL, output_tokens INTEGER DEFAULT 0 NOT NULL, estimated_cost_usd REAL, created_at INTEGER NOT NULL)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS api_usage_owner_created_idx ON api_usage(owner_email, created_at DESC)"),
  ]);
  const columns = await DB.prepare("PRAGMA table_info(jobs)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["subject", "ALTER TABLE jobs ADD COLUMN subject TEXT"],
    ["academic_year", "ALTER TABLE jobs ADD COLUMN academic_year TEXT"],
    ["teacher_name", "ALTER TABLE jobs ADD COLUMN teacher_name TEXT"],
    ["shared_at", "ALTER TABLE jobs ADD COLUMN shared_at INTEGER"],
  ] as const;
  for (const [name, sql] of additions) if (!names.has(name)) await DB.prepare(sql).run();
}
