import { ensureSchema, jsonError, ownerFrom, runtime } from "../../../_shared";

function extractText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const body = await request.json() as { targetCourse?: string };
  const courses = ["1º de Primaria", "2º de Primaria", "3º de Primaria", "4º de Primaria", "5º de Primaria", "6º de Primaria", "1º de ESO", "2º de ESO"];
  if (!body.targetCourse || !courses.includes(body.targetCourse)) return jsonError("Selecciona un nivel educativo válido.");
  const { DB, OPENAI_API_KEY, OPENAI_MODEL } = runtime();
  if (!OPENAI_API_KEY) return jsonError("El administrador debe configurar OPENAI_API_KEY.", 503);
  const source = await DB.prepare("SELECT title, current_course, academic_year, teacher_name, result FROM jobs WHERE id = ? AND owner_email = ? AND kind = 'project' AND status = 'completed'").bind(id, owner).first<{ title: string; current_course: string; academic_year?: string; teacher_name?: string; result: string }>();
  if (!source?.result) return jsonError("Primero debes generar el proyecto interdisciplinar.", 404);
  const setting = await DB.prepare("SELECT model FROM user_settings WHERE owner_email = ?").bind(owner).first<{ model: string }>();
  const prompt = `Adapta el PROYECTO INTERDISCIPLINAR incluido al nivel educativo ${body.targetCourse}. El proyecto original corresponde a ${source.current_course}. Conserva exactamente su reto, narrativa, producto final, fases, conexión entre áreas y participación familiar: no lo conviertas en un libro por unidades ni reutilices contenido de una adaptación curricular individual. Ajusta únicamente el acceso y la participación: lenguaje, andamiaje, autonomía, tiempos, agrupamientos, materiales, roles, evidencias y evaluación. Mantén altas expectativas y una contribución auténtica al mismo producto colectivo.\n\nIncluye: 1) versión accesible del reto; 2) barreras previsibles; 3) apoyos por fase y área; 4) adaptación de cada sesión; 5) roles posibles; 6) materiales visuales/manipulativos; 7) producto final compartido y forma concreta de contribuir; 8) evaluación adaptada con evidencias observables y rúbrica; 9) participación familiar accesible.\n\nPROYECTO ORIGINAL:\n${source.result}`;
  let data: any = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: setting?.model || OPENAI_MODEL || "gpt-5-mini", input: prompt, max_output_tokens: 7500 }) });
    data = await response.json() as any; if (response.ok) break;
    if (response.status !== 429 || attempt === 4) return jsonError(data?.error?.message || "No se pudo adaptar el proyecto.", response.status === 429 ? 429 : 500);
    const seconds = Number(response.headers.get("retry-after")) || Number(data?.error?.message?.match(/try again in ([\d.]+)s/i)?.[1]) || 15;
    await new Promise((resolve) => setTimeout(resolve, Math.min(60000, Math.max(10000, Math.ceil(seconds * 1000) + 2000))));
  }
  const result = extractText(data); if (!result) return jsonError("La IA no devolvió una adaptación utilizable.", 500);
  const newId = crypto.randomUUID(); const now = Date.now(); const title = `${source.title} · Adaptado a ${body.targetCourse}`;
  await DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, current_course, target_course, subject, academic_year, teacher_name, status, result, created_at, updated_at) VALUES (?, ?, 'project_adaptation', ?, ?, ?, 'Interdisciplinar', ?, ?, 'completed', ?, ?, ?)").bind(newId, owner, title, source.current_course, body.targetCourse, source.academic_year || null, source.teacher_name || null, result, now, now).run();
  return Response.json({ jobId: newId, result, title });
}
