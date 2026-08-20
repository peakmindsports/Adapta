import { ensureSchema, jsonError, ownerFrom, runtime } from "../../../_shared";

const adaptationPrompt = (job: Record<string, unknown>, notes: string) => `Eres especialista en pedagogía inclusiva y adaptaciones curriculares en España. Crea una adaptación curricular práctica y rigurosa para ${job.student_name}, matriculado/a en ${job.current_course}, con nivel competencial de ${job.target_course}. Conserva los saberes esenciales y el contexto temático del curso actual, pero ajusta complejidad, lenguaje, carga, apoyos y evaluación al nivel indicado. Respeta las orientaciones de los documentos aportados. ${notes ? `Indicaciones del docente: ${notes}` : ""}\n\nEntrega en Markdown con: 1) síntesis pedagógica, 2) objetivos adaptados, 3) saberes y criterios priorizados, 4) secuencia de 6-10 actividades concretas, 5) apoyos y accesibilidad, 6) instrumentos y rúbrica de evaluación, 7) recursos, 8) coordinación con familia y especialistas. No diagnostiques ni inventes información del alumno; señala cualquier supuesto.`;
const projectPrompt = (job: Record<string, unknown>, notes: string, theme: string, duration: string) => `Eres especialista en diseño interdisciplinar de Primaria en España. Diseña un proyecto globalizado para ${job.current_course}, de duración ${duration || "flexible"}, con el reto ${theme || "deducido de las unidades"}. Integra de forma auténtica Matemáticas, Lengua, Conocimiento del Medio e Inglés a partir de los materiales aportados. ${notes ? `Contexto del docente: ${notes}` : ""}\n\nEntrega en Markdown con: título y pregunta guía; justificación; conexiones curriculares por área; producto final auténtico; secuencia por fases y sesiones; dinámicas cooperativas; participación concreta de las familias; atención a la diversidad; recursos; evaluación integrada con rúbrica; y una tabla-resumen de sesiones. Evita conexiones artificiales y distingue claramente las aportaciones de cada área.`;

function extractText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await context.params;
  const owner = ownerFrom(request);
  const body = await request.json() as { notes?: string; theme?: string; duration?: string; studentContext?: { strengths?: string; classroomContext?: string; familyContext?: string; effectiveSupports?: string } };
  const { DB, FILES, OPENAI_API_KEY, OPENAI_MODEL } = runtime();
  if (!OPENAI_API_KEY) return jsonError("El administrador debe configurar OPENAI_API_KEY para activar la generación.", 503);
  const job = await DB.prepare("SELECT * FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<Record<string, unknown>>();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  const fileRows = await DB.prepare("SELECT filename, content_type, storage_key, category FROM job_files WHERE job_id = ? AND owner_email = ? ORDER BY created_at").bind(id, owner).all<Record<string, string>>();
  if (!fileRows.results.length) return jsonError("Añade al menos un documento antes de generar.");
  await DB.prepare("UPDATE jobs SET status = 'generating', error = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), id).run();
  const openAIFileIds: string[] = [];
  const preparedFiles: Array<{ id: string; filename: string; category: string }> = [];
  try {
    const personalContext = body.studentContext ? `\nCONTEXTO APORTADO POR EL DOCENTE:\n- Fortalezas, intereses y motivadores: ${body.studentContext.strengths || "No indicado"}\n- Situaciones observables y necesidades en el aula: ${body.studentContext.classroomContext || "No indicado"}\n- Contexto familiar relevante: ${body.studentContext.familyContext || "No indicado"}\n- Estrategias eficaces y situaciones a evitar: ${body.studentContext.effectiveSupports || "No indicado"}\nUsa este contexto para ajustar actividades, apoyos, regulación, agrupamientos y participación familiar. No conviertas conductas en rasgos personales ni hagas inferencias clínicas.` : "";
    const content: any[] = [{ type: "input_text", text: job.kind === "adaptation" ? adaptationPrompt(job, `${body.notes || ""}${personalContext}`) : projectPrompt(job, body.notes || "", body.theme || "", body.duration || "") }];
    for (const row of fileRows.results.slice(0, 36)) {
      let fileParts: ArrayBuffer[] = [];
      if (row.storage_key.startsWith("chunks:")) {
        const listed = await FILES.list({ prefix: row.storage_key.slice(7) });
        const objects = [...listed.objects].sort((a, b) => a.key.localeCompare(b.key));
        for (const entry of objects) { const part = await FILES.get(entry.key); if (part) fileParts.push(await part.arrayBuffer()); }
      } else { const object = await FILES.get(row.storage_key); if (object) fileParts = [await object.arrayBuffer()]; }
      if (!fileParts.length) continue;
      const uploadForm = new FormData();
      uploadForm.append("purpose", "user_data");
      uploadForm.append("file", new File(fileParts, row.filename, { type: row.content_type }));
      const uploadedResponse = await fetch("https://api.openai.com/v1/files", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: uploadForm });
      const uploaded = await uploadedResponse.json() as any;
      if (!uploadedResponse.ok || !uploaded.id) throw new Error(uploaded?.error?.message || `No se pudo preparar “${row.filename}” para el análisis.`);
      openAIFileIds.push(uploaded.id);
      preparedFiles.push({ id: uploaded.id, filename: row.filename, category: row.category });
      content.push({ type: "input_file", file_id: uploaded.id });
    }
    const setting = await DB.prepare("SELECT model FROM user_settings WHERE owner_email = ?").bind(owner).first<{ model: string }>();
    const model = setting?.model || OPENAI_MODEL || "gpt-5-mini";
    const callModel = async (requestContent: any[], maxOutputTokens: number) => {
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: requestContent }], max_output_tokens: maxOutputTokens }) });
      const data = await response.json() as any;
      if (!response.ok) throw new Error(data?.error?.message || "No se pudo completar una parte del libro.");
      return extractText(data);
    };
    if (job.kind === "adaptation") {
      const units = preparedFiles.filter((file) => file.category === "unidades");
      const contextFiles = preparedFiles.filter((file) => file.category !== "unidades");
      if (!units.length) throw new Error("Añade las unidades didácticas del curso actual para generar el libro adaptado.");
      const contextSummaries: string[] = [];
      for (let index = 0; index < contextFiles.length; index += 8) {
        const batch = contextFiles.slice(index, index + 8);
        contextSummaries.push(await callModel([{ type: "input_text", text: "Analiza estos documentos de contexto. Distingue claramente: (a) dictámenes y medidas de apoyo; (b) programación didáctica anual, extrayendo por cada unidad sus objetivos, contenidos/saberes, competencias específicas y criterios de evaluación; y (c) materiales del nivel competencial de referencia, extrayendo formato, lenguaje, apoyos visuales, actividades y dificultad. Produce un mapa curricular fiel que permita adaptar cada unidad sin perder su intención educativa. No diagnostiques ni inventes datos." }, ...batch.map((file) => ({ type: "input_file", file_id: file.id }))], 4500));
      }
      const sharedContext = `${personalContext}\n${contextSummaries.join("\n\n")}`;
      const chapters = new Array<string>(units.length);
      let nextUnit = 0;
      await Promise.all(Array.from({ length: Math.min(3, units.length) }, async () => {
        while (nextUnit < units.length) {
          const index = nextUnit++;
          const unit = units[index];
          const prompt = `${adaptationPrompt(job, body.notes || "")}\n\nEstás redactando el CAPÍTULO ${index + 1} de ${units.length} de un libro anual adaptado. La unidad original está en el archivo “${unit.filename}”. Adapta exclusivamente esta unidad, conservando su tema y orden curricular. Contrasta la unidad con la programación anual: mantén sus objetivos, saberes, competencias específicas y criterios de evaluación, pero ajusta el nivel de desempeño, el lenguaje y las evidencias exigidas al nivel competencial elegido.\n\nCONTEXTO COMÚN, PROGRAMACIÓN Y MODELO DE NIVEL:\n${sharedContext || "No se aportó material adicional."}\n\nEl capítulo debe ser material directamente utilizable por el alumno, no una explicación para el docente. Incluye: ficha curricular adaptada; portada breve; vocabulario esencial; explicaciones cortas y claras; ejemplos resueltos; actividades graduadas y variadas; propuestas manipulativas; espacios o instrucciones de respuesta; repasos; autoevaluación; y evaluación final alineada con los criterios. Cuando una ilustración mejore la comprensión, inserta un marcador preciso con el formato [IMAGEN: descripción clara, sencilla y adecuada a la edad]. Evita bloques largos de texto. Usa Markdown y empieza con “# Unidad ${index + 1}: …”.`;
          chapters[index] = await callModel([{ type: "input_text", text: prompt }, { type: "input_file", file_id: unit.id }], 6500);
        }
      }));
      const bookTitle = `# Libro anual adaptado\n\n**Alumno/a:** ${job.student_name}\n\n**Curso de referencia:** ${job.current_course}\n\n**Nivel competencial:** ${job.target_course}\n\n---\n\n## Índice\n${units.map((unit, index) => `${index + 1}. Unidad ${index + 1} · ${unit.filename}`).join("\n")}\n\n---\n\n`;
      const result = bookTitle + chapters.join("\n\n---\n\n");
      await DB.prepare("UPDATE jobs SET title = ?, status = 'completed', result = ?, updated_at = ? WHERE id = ?").bind(`Libro adaptado · ${job.student_name}`, result, Date.now(), id).run();
      return Response.json({ result });
    }
    let finalContent = content;
    if (openAIFileIds.length > 10) {
      const summaries: string[] = [];
      for (let index = 0; index < openAIFileIds.length; index += 8) {
        const batch = openAIFileIds.slice(index, index + 8);
        const batchContent = [{ type: "input_text", text: `Analiza estos documentos educativos (lote ${Math.floor(index / 8) + 1}). Resume de forma fiel: estructura de las unidades, contenidos, criterios, metodología, actividades, recursos, nivel de dificultad y elementos visuales. Conserva títulos y diferencias entre documentos. Este resumen se utilizará después para diseñar una propuesta curricular.` }, ...batch.map((fileId) => ({ type: "input_file", file_id: fileId }))];
        const summaryResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: batchContent }], max_output_tokens: 3500 }) });
        const summaryData = await summaryResponse.json() as any;
        if (!summaryResponse.ok) throw new Error(summaryData?.error?.message || "No se pudo analizar uno de los lotes de documentos.");
        summaries.push(extractText(summaryData));
      }
      finalContent = [{ type: "input_text", text: `${content[0].text}\n\nANÁLISIS DE LOS DOCUMENTOS APORTADOS:\n${summaries.map((summary, index) => `\n--- LOTE ${index + 1} ---\n${summary}`).join("\n")}` }];
    }
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: finalContent }], max_output_tokens: 9000 }) });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(data?.error?.message || "No se pudo generar la propuesta.");
    const result = extractText(data);
    if (!result) throw new Error("La IA no devolvió contenido utilizable.");
    await DB.prepare("UPDATE jobs SET status = 'completed', result = ?, updated_at = ? WHERE id = ?").bind(result, Date.now(), id).run();
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    await DB.prepare("UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(message, Date.now(), id).run();
    return jsonError(message, 500);
  } finally {
    await Promise.allSettled(openAIFileIds.map((fileId) => fetch(`https://api.openai.com/v1/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } })));
  }
}
