import { activeOwnerFrom, authenticationError, consumeDailyQuota, ensureSchema, GLOBAL_MODEL_OWNER, jsonError, recordApiUsage, runtime } from "../_shared";

const extractText = (data: any) => data?.output_text || data?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text || "";

export async function POST(request: Request) {
  await ensureSchema();
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const body = await request.json() as { course?: string; subject?: string };
  if (!body.course || !body.subject) return jsonError("Selecciona curso y asignatura.");
  const quota = await consumeDailyQuota(owner, "recommendation", 20); if (!quota.allowed) return jsonError("Has alcanzado el límite diario de consultas curriculares.", 429);
  const setting = await runtime().DB.prepare("SELECT model FROM user_settings WHERE owner_email IN (?, ?) ORDER BY CASE owner_email WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(owner, GLOBAL_MODEL_OWNER, owner).first<{ model: string }>();
  const model = setting?.model || runtime().OPENAI_MODEL || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${runtime().OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, tools: [{ type: "web_search_preview", search_context_size: "high" }], input: `Consulta exclusivamente fuentes oficiales de la Junta de Andalucía/BOJA y devuelve las competencias específicas vigentes de ${body.subject}, ${body.course}, Andalucía. Referencias principales: Orden de 30 de mayo de 2023 de Primaria (BOJA 104, disposición 39) u Orden de 30 de mayo de 2023 de ESO (BOJA 104, disposición 36), según corresponda, incluidos sus anexos y modificaciones vigentes. Responde SOLO con JSON válido, sin markdown: {"sourceTitle":"...","sourceUrl":"URL oficial directa","competencies":[{"code":"CE1","text":"redacción oficial completa"}]}. No resumas, no inventes y no uses blogs ni editoriales.`, max_output_tokens: 5000 }) });
  const data = await response.json() as any; if (!response.ok) return jsonError(data?.error?.message || "No se pudo consultar el currículo oficial.", 502);
  await recordApiUsage(owner, "curriculum", model, data);
  try { const raw = extractText(data).replace(/^```json\s*|\s*```$/g, ""); const parsed = JSON.parse(raw); const source = new URL(String(parsed.sourceUrl || "")); if (!source.hostname.endsWith("juntadeandalucia.es") || !Array.isArray(parsed.competencies) || !parsed.competencies.length || parsed.competencies.some((item: any) => typeof item?.code !== "string" || typeof item?.text !== "string")) throw new Error(); return Response.json(parsed); }
  catch { return jsonError("No se pudo interpretar la respuesta curricular. Inténtalo de nuevo.", 502); }
}
