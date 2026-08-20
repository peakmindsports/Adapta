import { ensureSchema, jsonError, ownerFrom, runtime } from "../../../_shared";

const adaptationPrompt = (job: Record<string, unknown>, notes: string) => `Eres especialista en pedagogía inclusiva, diseño editorial escolar y adaptaciones curriculares en España. Crea un LIBRO DE TEXTO Y ACTIVIDADES atractivo para ${job.student_name}, matriculado/a en ${job.current_course}, con nivel competencial de ${job.target_course}. Conserva los saberes esenciales, el hilo temático, el orden, la identidad visual y el tipo de actividades del material original, pero ajusta lenguaje, carga, apoyos, autonomía y evaluación al nivel indicado. Respeta todos los documentos aportados. ${notes ? `Indicaciones del docente: ${notes}` : ""}\n\nEl destinatario principal es el alumno: evita informes pedagógicos extensos, justificaciones para adultos y bloques largos. Usa páginas breves, títulos motivadores, instrucciones de una sola acción, ejemplos visuales, juegos, manipulación, elección, coloreado, recortables y espacios claros para responder. Cada unidad debe culminar obligatoriamente en un producto final motivador y una evaluación accesible. No diagnostiques ni inventes información.`;
const projectPrompt = (job: Record<string, unknown>, notes: string, theme: string, duration: string) => `Eres especialista en aprendizaje basado en proyectos y diseño interdisciplinar de Primaria en España. Diseña para TODO EL GRUPO de ${job.current_course} un proyecto globalizado de duración ${duration || "flexible"}, con el reto ${theme || "deducido de las unidades"}. Integra de forma auténtica Matemáticas, Lengua, Conocimiento del Medio e Inglés a partir de los materiales aportados. ${notes ? `Contexto del docente: ${notes}` : ""}\n\nEste producto es totalmente diferente de una adaptación curricular o un libro por unidades: no redactes capítulos de asignaturas, fichas adaptadas, actividades repetidas de cada UDI ni contenido dirigido a un alumno concreto. Crea una única experiencia común organizada por fases alrededor de un reto real. Entrega en Markdown con: título y pregunta guía; escenario motivador; conexiones curriculares por área; producto final auténtico; lanzamiento; investigación; creación; comunicación pública; secuencia de sesiones; dinámicas cooperativas y roles; voz y elección del alumnado; participación concreta y voluntaria de las familias; recursos; inclusión mediante diseño universal para el aprendizaje; evaluación integrada con rúbrica; y tabla-resumen. Evita conexiones artificiales y distingue la aportación de cada área.`;

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
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: requestContent }], max_output_tokens: maxOutputTokens }) });
        const data = await response.json() as any;
        if (response.ok) return extractText(data);
        if (response.status !== 429 || attempt === 4) throw new Error(data?.error?.message || "No se pudo completar una parte del libro.");
        const message = data?.error?.message || "";
        const suggestedSeconds = Number(response.headers.get("retry-after")) || Number(message.match(/try again in ([\d.]+)s/i)?.[1]) || 15;
        const waitMs = Math.min(60000, Math.max(10000, Math.ceil(suggestedSeconds * 1000) + 2000));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      throw new Error("No se pudo completar una parte del libro tras varios reintentos.");
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
      await Promise.all(Array.from({ length: Math.min(1, units.length) }, async () => {
        while (nextUnit < units.length) {
          const index = nextUnit++;
          const unit = units[index];
          const prompt = `${adaptationPrompt(job, body.notes || "")}\n\nEstás redactando el CAPÍTULO ${index + 1} de ${units.length} del libro anual. La unidad original es “${unit.filename}”. Analiza también su maquetación: paleta, recuadros, ritmo de páginas, ilustraciones, iconos y organización. Conserva el tema y el orden curricular y contrástalo con la programación anual. Mantén objetivos, saberes, competencias y criterios, ajustando el desempeño al nivel elegido.\n\nCONTEXTO COMÚN, PROGRAMACIÓN Y MODELO DE NIVEL:\n${sharedContext || "No se aportó material adicional."}\n\nESTRUCTURA OBLIGATORIA DE ESTA UDI:\n# Unidad ${index + 1}: título breve y motivador\n## ¡Empezamos! (reto y qué aprenderé, máximo 5 ideas)\n[IMAGEN: imagen o ilustración de la unidad original que conviene reutilizar]\n## Palabras importantes (máximo 8, con explicación de una línea)\n## Aprendo y practico (4-7 bloques pequeños). En cada bloque alterna: explicación de 2-4 frases, ejemplo resuelto, marcador de imagen y 2-4 actividades variadas.\n## Juego o taller manipulativo (materiales y 3-5 pasos)\n## Producto final (resultado tangible, materiales, pasos, roles y forma de compartirlo; incluye una participación familiar posible y no obligatoria)\n## Repaso visual (6-10 preguntas breves variadas)\n## Demuestro lo que sé (evaluación final accesible ligada a los criterios, con observación, tarea práctica y preguntas)\n## Me evalúo (4 frases con opciones Sí / A veces / Necesito ayuda)\n## Guía docente (solo una página final breve: objetivos, criterios, evidencias, apoyos y registro de evaluación).\n\nEscribe material directamente utilizable. No incluyas síntesis pedagógica al principio ni repitas datos administrativos en cada página. Usa Markdown, tablas solo cuando ayuden de verdad y marcadores [IMAGEN: ...] donde la maquetación deba reutilizar imágenes del PDF original.`;
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
