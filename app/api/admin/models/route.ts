import { ensureSchema, jsonError, ownerFrom, runtime } from "../../_shared";

type ModelItem = { id: string; label: string; cost: string; rank: number };
function describe(id: string): ModelItem {
  if (/nano/i.test(id)) return { id, label: id, cost: "Más económico", rank: 1 };
  if (/mini/i.test(id)) return { id, label: id, cost: "Económico · recomendado", rank: 2 };
  if (/pro/i.test(id)) return { id, label: id, cost: "Coste superior · máxima capacidad", rank: 5 };
  return { id, label: id, cost: "Estándar / avanzado", rank: 3 };
}

export async function GET(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request); const { DB, OPENAI_API_KEY, OPENAI_MODEL } = runtime();
  if (!OPENAI_API_KEY) return jsonError("La clave de OpenAI no está configurada.", 503);
  const [modelsResponse, setting] = await Promise.all([
    fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }),
    DB.prepare("SELECT model FROM user_settings WHERE owner_email = ?").bind(owner).first<{ model: string }>(),
  ]);
  const payload = await modelsResponse.json() as any;
  if (!modelsResponse.ok) return jsonError(payload?.error?.message || "No se pudieron consultar los modelos.", 502);
  const models = (payload.data || []).map((item: any) => item.id as string).filter((id: string) => /^gpt-/i.test(id) && !/(audio|realtime|transcribe|tts|image|search|codex)/i.test(id) && !/\d{4}-\d{2}-\d{2}$/.test(id)).map(describe).sort((a: ModelItem, b: ModelItem) => a.rank - b.rank || a.id.localeCompare(b.id));
  return Response.json({ models, selected: setting?.model || OPENAI_MODEL || "gpt-5-mini", note: "La lista procede de los modelos disponibles para tu clave. Luna es un modelo de Codex y no aparece si no está disponible mediante la API." });
}

export async function POST(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request); const { DB, OPENAI_API_KEY } = runtime(); const body = await request.json() as { model?: string };
  if (!body.model || !/^gpt-[a-zA-Z0-9._-]+$/.test(body.model)) return jsonError("Modelo no válido.");
  const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }); const payload = await response.json() as any;
  if (!response.ok || !(payload.data || []).some((item: any) => item.id === body.model)) return jsonError("Ese modelo no está disponible para tu clave.");
  await DB.prepare("INSERT INTO user_settings (owner_email, model, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_email) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at").bind(owner, body.model, Date.now()).run();
  return Response.json({ selected: body.model });
}
