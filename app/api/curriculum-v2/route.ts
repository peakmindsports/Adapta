import { activeOwnerFrom, authenticationError, consumeDailyQuota, ensureSchema, GLOBAL_MODEL_OWNER, jsonError, recordApiUsage, runtime } from "../_shared";

const extractText = (data: any) => data?.output_text || data?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || "";
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validCurriculum(value: any) {
  try {
    const source = new URL(String(value?.sourceUrl || ""));
    return source.hostname.endsWith("juntadeandalucia.es") && Array.isArray(value?.competencies) && value.competencies.length > 0 && value.competencies.every((item: any) => typeof item?.code === "string" && typeof item?.text === "string");
  } catch { return false; }
}

export async function POST(request: Request) {
  await ensureSchema();
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const body = await request.json() as { course?: string; subject?: string };
  if (!body.course || !body.subject) return jsonError("Selecciona curso y asignatura.");
  const { DB, OPENAI_API_KEY, OPENAI_MODEL } = runtime();
  const cacheKey = `curriculum:${body.course}:${body.subject}`.slice(0, 240);
  const cached = await DB.prepare("SELECT model FROM user_settings WHERE owner_email = ?").bind(cacheKey).first<{ model: string }>();
  if (cached?.model) {
    try { const parsed = JSON.parse(cached.model); if (validCurriculum(parsed)) return Response.json({ ...parsed, cached: true }); } catch { /* Regenerate invalid cache. */ }
  }
  const quota = await consumeDailyQuota(owner, "recommendation", 20); if (!quota.allowed) return jsonError("Has alcanzado el límite diario de consultas curriculares.", 429);
  const setting = await DB.prepare("SELECT model FROM user_settings WHERE owner_email IN (?, ?) ORDER BY CASE owner_email WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(owner, GLOBAL_MODEL_OWNER, owner).first<{ model: string }>();
  const model = setting?.model || OPENAI_MODEL || "gpt-5-mini";
  const payload = JSON.stringify({
    model,
    tools: [{ type: "web_search_preview", search_context_size: "low" }],
    input: `Consulta exclusivamente fuentes oficiales de la Junta de Andalucía/BOJA y devuelve las competencias específicas vigentes de ${body.subject}, ${body.course}, Andalucía. Usa la Orden de 30 de mayo de 2023 de Infantil, Primaria o ESO, según corresponda, sus anexos y modificaciones vigentes. Para Infantil consulta las tres áreas del segundo ciclo y conserva sus competencias específicas oficiales; la edad elegida orienta la evaluación inicial, pero no inventes competencias distintas por edad. Responde SOLO con JSON válido: {"sourceTitle":"...","sourceUrl":"URL oficial directa","competencies":[{"code":"CE1","text":"redacción oficial completa"}]}. No resumas, no inventes y no uses blogs ni editoriales.`,
    max_output_tokens: 4200,
  });
  let response: Response | null = null; let data: any = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: payload });
    data = await response.json() as any;
    if (response.ok) break;
    if (response.status !== 429 || attempt === 4) return jsonError(response.status === 429 ? "El servicio curricular está ocupado. Espera unos segundos y vuelve a intentarlo; no has perdido ninguna selección." : data?.error?.message || "No se pudo consultar el currículo oficial.", response.status === 429 ? 429 : 502);
    const message = String(data?.error?.message || "");
    const milliseconds = Number(message.match(/try again in (\d+)ms/i)?.[1]);
    const seconds = Number(message.match(/try again in ([\d.]+)s/i)?.[1]);
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(Math.min(15000, Math.max(800, milliseconds || seconds * 1000 || retryAfter * 1000 || 1200 * 2 ** attempt)));
  }
  if (!response?.ok) return jsonError("El servicio curricular está ocupado. Inténtalo de nuevo en unos segundos.", 429);
  await recordApiUsage(owner, "curriculum", model, data);
  try {
    const parsed = JSON.parse(extractText(data).replace(/^```json\s*|\s*```$/g, ""));
    if (!validCurriculum(parsed)) throw new Error();
    await DB.prepare("INSERT INTO user_settings (owner_email, model, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_email) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at").bind(cacheKey, JSON.stringify(parsed), Date.now()).run();
    return Response.json(parsed);
  } catch { return jsonError("No se pudo interpretar la respuesta curricular. Inténtalo de nuevo.", 502); }
}
