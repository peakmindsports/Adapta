import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export function runtime() { return env as unknown as RuntimeEnv; }

export function ownerFrom(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? "private-owner";
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
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
  ]);
}
