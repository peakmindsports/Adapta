import { ensureSchema, jsonError, ownerFrom, runtime } from "../../../_shared";

function outputText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request); const { DB, FILES, OPENAI_API_KEY, OPENAI_MODEL } = runtime();
  if (!OPENAI_API_KEY) return jsonError("La clave de OpenAI no está configurada.", 503);
  const job = await DB.prepare("SELECT student_name, current_course FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ student_name: string; current_course: string }>();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  const rows = await DB.prepare("SELECT filename, content_type, storage_key FROM job_files WHERE job_id = ? AND owner_email = ? AND category = 'dictamen' ORDER BY created_at").bind(id, owner).all<Record<string, string>>();
  if (!rows.results.length) return jsonError("Añade al menos un informe o dictamen.");
  const uploadedIds: string[] = [];
  try {
    for (const row of rows.results.slice(0, 8)) {
      const parts: ArrayBuffer[] = [];
      if (row.storage_key.startsWith("chunks:")) { const listed = await FILES.list({ prefix: row.storage_key.slice(7) }); for (const entry of [...listed.objects].sort((a, b) => a.key.localeCompare(b.key))) { const part = await FILES.get(entry.key); if (part) parts.push(await part.arrayBuffer()); } }
      else { const object = await FILES.get(row.storage_key); if (object) parts.push(await object.arrayBuffer()); }
      if (!parts.length) continue;
      const form = new FormData(); form.append("purpose", "user_data"); form.append("file", new File(parts, row.filename, { type: row.content_type }));
      const response = await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form }); const data = await response.json() as any;
      if (!response.ok || !data.id) throw new Error(data?.error?.message || `No se pudo analizar “${row.filename}”.`); uploadedIds.push(data.id);
    }
    const setting = await DB.prepare("SELECT model FROM user_settings WHERE owner_email = ?").bind(owner).first<{ model: string }>();
    const prompt = `Actúa como orientador educativo. Analiza los informes de ${job.student_name}, actualmente matriculado/a en ${job.current_course}, y propone el curso de Primaria o ESO que mejor representa su nivel competencial global para adaptar materiales. Basa la recomendación únicamente en evidencias funcionales de los documentos (lectura, escritura, matemáticas, comprensión, autonomía y apoyos). No realices diagnósticos. Si hay perfiles muy desiguales, elige un nivel global prudente y explica las diferencias por áreas. Devuelve SOLO JSON válido con esta forma exacta: {"recommendedCourse":"2º de Primaria","explanation":"explicación breve basada en evidencias","confidence":"alta|media|baja","caveat":"limitación o cautela"}. Los cursos válidos son 1º-6º de Primaria y 1º-4º de ESO.`;
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: setting?.model || OPENAI_MODEL || "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...uploadedIds.map((fileId) => ({ type: "input_file", file_id: fileId }))] }], max_output_tokens: 1200 }) });
    const data = await response.json() as any; if (!response.ok) throw new Error(data?.error?.message || "No se pudo estimar el nivel.");
    const raw = outputText(data); const match = raw.match(/\{[\s\S]*\}/); if (!match) throw new Error("La IA no devolvió una recomendación estructurada.");
    const recommendation = JSON.parse(match[0]);
    return Response.json({ recommendation });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "No se pudo estimar el nivel.", 500); }
  finally { await Promise.allSettled(uploadedIds.map((fileId) => fetch(`https://api.openai.com/v1/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }))); }
}
