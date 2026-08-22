import { ensureSchema, GLOBAL_MODEL_OWNER, jsonError, ownerFrom, runtime, SITE_ADMIN_EMAIL } from "../../../_shared";

const adaptationPrompt = (job: Record<string, unknown>, notes: string) => `Eres especialista en pedagogía inclusiva, diseño editorial escolar y adaptaciones curriculares en España. Crea un RECURSO DE APRENDIZAJE Y ACTIVIDADES atractivo para ${job.student_name}, matriculado/a en ${job.current_course}, con nivel competencial de ${job.target_course}. Conserva los saberes esenciales, el hilo temático, el orden, la identidad visual y el tipo de actividades del material original, pero ajusta lenguaje, carga, apoyos, autonomía y evaluación al nivel indicado. Respeta todos los documentos aportados. Si existe una selección de criterios por unidad, representa la prioridad expresa del equipo docente: las actividades, pruebas, evidencias y productos finales deben evaluar esos criterios y no incorporar otros como objeto de calificación. ${notes ? `Indicaciones del docente: ${notes}` : ""}\n\nEl material se dirige principalmente a cada estudiante: evita informes pedagógicos extensos, justificaciones para personas adultas y bloques largos. Usa páginas breves, títulos motivadores, instrucciones de una sola acción, ejemplos visuales, juegos, manipulación, elección, coloreado, recortables y espacios claros para responder. Toda consigna debe nombrar exactamente qué elemento debe observarse, copiarse, escribirse, marcarse, unirse o colorearse y mostrar el lugar de respuesta. Prohíbense órdenes ambiguas como «Copia una palabra» seguidas de una etiqueta: escribe, por ejemplo, «Copia la palabra “población” en la línea» y añade una pauta visible. Cada unidad debe culminar obligatoriamente en un producto final motivador y una evaluación accesible alineada con los criterios seleccionados.\n\nCONTRATO DE MAQUETACIÓN: deja una línea en blanco antes y después de cada actividad para que ninguna respuesta quede pegada al ejercicio siguiente. Separa siempre cada enunciado de sus opciones con una línea en blanco. Escribe cada posible respuesta en una línea independiente usando exactamente «- [ ] respuesta»; nunca pongas varias opciones separadas por barras o en la misma línea. En cualquier actividad de unir, escribe cada pareja en una línea independiente con el formato exacto «[UNIR: elemento de la columna izquierda || elemento desordenado de la columna derecha]»; nunca presentes ambos grupos en una sola columna. Todo material que se anuncie como recortable debe incluir tarjetas completas y autónomas, una por línea, usando exactamente «[TARJETA: título breve - contenido que debe quedar impreso dentro de la tarjeta]». El contenido debe ser legible al recortarlo y no puede depender de un texto situado fuera de la tarjeta. Incluye entre 6 y 12 tarjetas cuando el juego las necesite; no indiques que el equipo docente debe prepararlas. Si propones un «juego de preguntas» en el que una persona toma una tarjeta y otra pregunta, añade obligatoriamente un apartado «Preguntas que podemos hacer» con 8-12 preguntas concretas, breves y adaptadas a esas tarjetas, por ejemplo preguntas sobre quién, qué, cuándo, dónde, para qué, causa, consecuencia, comparación o pista. Incluye también una ronda de ejemplo completa: tarjeta obtenida, pregunta formulada y respuesta esperada. Nunca escribas únicamente «haz una pregunta». Cada registro o instrumento de evaluación debe tener su propio subtítulo de nivel 3, su tabla independiente y espacio de observaciones. Incluye marcadores [IMAGEN: ...] únicamente para ilustraciones a color, completas, claramente visibles y realmente existentes en la UDI original; respeta su orden de aparición y no marques fondos, marcos, texturas, páginas completas, logotipos, máscaras ni adornos. Todo «Ejemplo resuelto» debe incluir una consigna completa, una respuesta modelo comprensible y una explicación de por qué es correcta; prohíbense asociaciones sueltas como «líneas rectas - Renacimiento» o «luces y sombras - Barroco» sin contexto. No diagnostiques ni inventes información.`;
const projectPrompt = (job: Record<string, unknown>, notes: string, theme: string, duration: string) => `Eres especialista en aprendizaje basado en proyectos y diseño interdisciplinar de Primaria en España. Diseña para TODO EL GRUPO de ${job.current_course} un proyecto globalizado de duración ${duration || "flexible"}, con el reto ${theme || "deducido de las unidades"}. Integra de forma auténtica Matemáticas, Lengua, Conocimiento del Medio e Inglés a partir de los materiales aportados. ${notes ? `Contexto del docente: ${notes}` : ""}\n\nEste producto es totalmente diferente de una adaptación curricular o un recurso por unidades: no redactes capítulos de asignaturas, fichas adaptadas, actividades repetidas de cada UDI ni contenido dirigido a un alumno concreto. Crea una única experiencia común organizada por fases alrededor de un reto real. Entrega en Markdown con: título y pregunta guía; escenario motivador; conexiones curriculares por área; producto final auténtico; lanzamiento; investigación; creación; comunicación pública; secuencia de sesiones; dinámicas cooperativas y roles; voz y elección del alumnado; participación concreta y voluntaria de las familias; recursos; inclusión mediante diseño universal para el aprendizaje; evaluación integrada; y tabla-resumen.\n\nEVALUACIÓN OBLIGATORIA: extrae de las programaciones aportadas las competencias específicas y criterios de evaluación de cada asignatura que realmente se trabajan. Crea una matriz «área → criterio → indicador observable → actividad/evidencia → instrumento → momento». No inventes códigos ni criterios ausentes; si un dato no está disponible, indícalo. Formula indicadores concretos, observables y verificables para cada criterio. Incluye instrumentos completos y directamente utilizables: una rúbrica analítica final con cuatro niveles de logro y descriptores observables por indicador; una lista de control con casillas Sí / En proceso / Todavía no y espacio de observaciones; una prueba escrita interdisciplinar breve y adecuada al curso, con puntuación por pregunta y solucionario docente; e instrumentos dinámicos (misiones, pasaporte de aprendizaje, exposición o feria, reto práctico, portfolio, diario visual, observación, coevaluación y autoevaluación). Cada instrumento debe señalar el criterio y los indicadores que evalúa. Cada instrumento debe evaluar una evidencia concreta del proyecto, no solo participación o conducta. Evita conexiones artificiales y distingue la aportación de cada área.`;

function extractText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForOpenAIFile(fileId: string, apiKey: string, filename: string) {
  const deadline = Date.now() + 60000;
  let lastMessage = "";
  while (Date.now() < deadline) {
    const response = await fetch(`https://api.openai.com/v1/files/${fileId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const file = await response.json() as any;
    if (response.ok) {
      if (file.status === "error") throw new Error(file.status_details || `OpenAI no pudo procesar “${filename}”.`);
      // Newer File objects omit the deprecated status once the file is available.
      if (!file.status || file.status === "processed") return;
      lastMessage = file.status_details || `Estado del archivo: ${file.status}`;
    } else if (response.status !== 404 && response.status !== 409 && response.status < 500) {
      throw new Error(file?.error?.message || `No se pudo comprobar “${filename}” en OpenAI.`);
    } else {
      lastMessage = file?.error?.message || `OpenAI todavía no reconoce “${filename}”.`;
    }
    await sleep(2000);
  }
  throw new Error(lastMessage || `OpenAI tardó demasiado en preparar “${filename}”.`);
}

function isTemporaryOpenAIError(status: number, message: string) {
  return status === 408 || status === 409 || status === 429 || status >= 500
    || /unknown error while validating file ownership|validating file ownership|file.*(?:not (?:yet )?(?:available|ready|found)|still (?:processing|being processed))|try again/i.test(message);
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
    for (const row of fileRows.results.slice(0, 60)) {
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
      await waitForOpenAIFile(uploaded.id, OPENAI_API_KEY, row.filename);
      preparedFiles.push({ id: uploaded.id, filename: row.filename, category: row.category });
      content.push({ type: "input_file", file_id: uploaded.id });
    }
    if (job.kind === "project") {
      const subjectNames: Record<string, string> = { project_math_criteria: "SELECCIÓN PRIORITARIA DE CRITERIOS · Matemáticas · todas las UDI", project_language_criteria: "SELECCIÓN PRIORITARIA DE CRITERIOS · Lengua · todas las UDI", project_science_criteria: "SELECCIÓN PRIORITARIA DE CRITERIOS · Conocimiento del Medio · todas las UDI", project_english_criteria: "SELECCIÓN PRIORITARIA DE CRITERIOS · Inglés · todas las UDI", project_math: "Matemáticas", project_language: "Lengua", project_science: "Conocimiento del Medio", project_english: "Inglés", proyecto: "Área sin clasificar" };
      content[0].text += `\n\nDOCUMENTOS CLASIFICADOS POR EL EQUIPO DOCENTE:\n${preparedFiles.map((file) => `- ${subjectNames[file.category] || file.category}: ${file.filename}`).join("\n")}\nRespeta esta clasificación. Si hay documentos de SELECCIÓN PRIORITARIA DE CRITERIOS, utilízalos como decisión principal: el producto final, las actividades y los instrumentos deben obtener evidencias de esos criterios, sin añadir otros como objeto de calificación. Crea una matriz «área → unidad de origen → criterio seleccionado → evidencia → instrumento → momento».`;
    }
    const setting = await DB.prepare("SELECT model FROM user_settings WHERE owner_email IN (?, ?) ORDER BY CASE WHEN owner_email = ? THEN 0 ELSE 1 END LIMIT 1").bind(GLOBAL_MODEL_OWNER, SITE_ADMIN_EMAIL, GLOBAL_MODEL_OWNER).first<{ model: string }>();
    const model = setting?.model || OPENAI_MODEL || "gpt-5-mini";
    const callModel = async (requestContent: any[], maxOutputTokens: number) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: requestContent }], max_output_tokens: maxOutputTokens }) });
        const data = await response.json() as any;
        if (response.ok) return extractText(data);
        const message = data?.error?.message || "";
        if (!isTemporaryOpenAIError(response.status, message) || attempt === 5) throw new Error(message || "No se pudo completar una parte del libro.");
        const suggestedSeconds = Number(response.headers.get("retry-after")) || Number(message.match(/try again in ([\d.]+)s/i)?.[1]) || 15;
        const fallbackMs = Math.min(20000, 2000 * 2 ** attempt);
        const waitMs = response.status === 429 ? Math.min(60000, Math.max(10000, Math.ceil(suggestedSeconds * 1000) + 2000)) : fallbackMs;
        await sleep(waitMs);
      }
      throw new Error("No se pudo completar una parte del libro tras varios reintentos.");
    };
    if (job.kind === "adaptation") {
      const units = preparedFiles.filter((file) => file.category === "unidades");
      const contextFiles = preparedFiles.filter((file) => file.category !== "unidades");
      if (!units.length) throw new Error("Añade las unidades didácticas del curso actual para generar el libro adaptado.");
      const contextSummaries: string[] = [];
      for (const file of contextFiles) {
        contextSummaries.push(await callModel([{ type: "input_text", text: `Analiza exclusivamente este documento (${file.category}: ${file.filename}). Extrae de forma compacta la información útil por unidad. Si es una selección de criterios, conserva literalmente los códigos, descriptores y UDI asociadas porque representan la prioridad del equipo docente. Si es programación, recoge objetivos, saberes, competencias y criterios; si es informe, medidas y apoyos; si es material de nivel, formato, lenguaje y dificultad. No diagnostiques ni inventes datos.` }, { type: "input_file", file_id: file.id }], 1800));
      }
      const sharedContext = `${personalContext}\n${contextSummaries.join("\n\n")}`.slice(0, 250000);
      const chapters = new Array<string>(units.length);
      let nextUnit = 0;
      await Promise.all(Array.from({ length: Math.min(1, units.length) }, async () => {
        while (nextUnit < units.length) {
          const index = nextUnit++;
          const unit = units[index];
          const prompt = `${adaptationPrompt(job, body.notes || "")}\n\nEstás redactando el CAPÍTULO ${index + 1} de ${units.length} del recurso anual. La unidad original es “${unit.filename}”. Analiza también su maquetación: paleta, recuadros, ritmo de páginas, ilustraciones, iconos y organización. Conserva el tema y el orden curricular y contrástalo con la programación anual. Mantén objetivos, saberes, competencias y criterios, ajustando el desempeño al nivel elegido.\n\nCONTEXTO COMÚN, PROGRAMACIÓN Y MODELO DE NIVEL:\n${sharedContext || "No se aportó material adicional."}\n\nESTRUCTURA OBLIGATORIA DE ESTA UDI:\n# Unidad ${index + 1}: título breve y motivador\n## ¡Empezamos! (reto y qué aprenderé, máximo 5 ideas)\n[IMAGEN: imagen o ilustración de la unidad original que conviene reutilizar]\n## Palabras importantes (máximo 8, con explicación de una línea)\n## Aprendo y practico (4-7 bloques pequeños). En cada bloque alterna: explicación de 2-4 frases, ejemplo resuelto, marcador de imagen y 2-4 actividades variadas.\n## Juego o taller manipulativo (materiales y 3-5 pasos)\n## Producto final (resultado tangible, materiales, pasos, roles y forma de compartirlo; incluye una participación familiar posible y no obligatoria)\n## Repaso visual (6-10 preguntas breves variadas)\n## Demuestro lo que sé (evaluación final accesible ligada a los criterios, con observación, tarea práctica y preguntas)\n## Me evalúo (4 frases con opciones Sí / A veces / Necesito ayuda)\n<!-- INICIO_DOCENTE -->\n## Material exclusivo para el profesorado\n## Indicadores de evaluación (tabla «criterio seleccionado → indicador observable → evidencia»; indicadores concretos y verificables, sin inventar criterios)\n### Rúbrica de la unidad (tabla independiente con cuatro niveles de logro y descriptores observables por indicador)\n### Lista de control (tabla independiente con una fila por indicador, casillas Sí / En proceso / Todavía no y espacio de observaciones)\n### Prueba escrita para el profesorado (6-10 preguntas variadas, adaptadas al nivel, con puntuación visible y espacio suficiente para responder)\n### Solucionario docente de la prueba (respuestas esperadas y relación de cada pregunta con su criterio e indicador)\n## Guía docente (objetivos, criterios, indicadores, evidencias, apoyos y registros de evaluación)\n<!-- FIN_DOCENTE -->\n\nRespeta literalmente los marcadores INICIO_DOCENTE y FIN_DOCENTE. Antes de INICIO_DOCENTE solo puede aparecer material entregable al alumnado; no incluyas respuestas, solucionarios, rúbricas ni registros docentes. Escribe todos los instrumentos completos y directamente imprimibles; no te limites a recomendarlos. Cada indicador e instrumento debe derivar de los criterios seleccionados aportados por el equipo docente. Si no se aportó un criterio para esta unidad, indica «Criterio no disponible en la documentación» en vez de inventarlo. Escribe material directamente utilizable. No incluyas síntesis pedagógica al principio ni repitas datos administrativos en cada página. Usa Markdown, tablas solo cuando ayuden de verdad y marcadores [IMAGEN: ...] donde la maquetación deba reutilizar imágenes del PDF original.`;
          chapters[index] = await callModel([{ type: "input_text", text: prompt }, { type: "input_file", file_id: unit.id }], 6500);
        }
      }));
      const chapterTitles = chapters.map((chapter, index) => chapter.match(/^#\s*Unidad\s+\d+\s*:\s*(.+)$/im)?.[1]?.trim() || `Unidad ${index + 1}`);
      const bookTitle = `# Recurso anual adaptado\n\n**Alumno/a:** ${job.student_name}\n\n**Curso de referencia:** ${job.current_course}\n\n**Nivel competencial:** ${job.target_course}\n\n---\n\n## Índice\n${chapterTitles.map((title, index) => `${index + 1}. Unidad ${index + 1} · ${title}`).join("\n")}\n\n---\n\n`;
      const studentChapters: string[] = []; const teacherChapters: string[] = [];
      chapters.forEach((chapter, index) => {
        const start = chapter.indexOf("<!-- INICIO_DOCENTE -->"); const end = chapter.indexOf("<!-- FIN_DOCENTE -->");
        if (start < 0) { studentChapters.push(chapter); return; }
        studentChapters.push(`${chapter.slice(0, start)}${end >= 0 ? chapter.slice(end + "<!-- FIN_DOCENTE -->".length) : ""}`.trim());
        const teacher = chapter.slice(start + "<!-- INICIO_DOCENTE -->".length, end >= 0 ? end : chapter.length).trim();
        teacherChapters.push(`## Unidad ${index + 1} · ${chapterTitles[index]}\n\n${teacher}`);
      });
      const teacherAnnex = teacherChapters.length ? `\n\n---\n\n# Anexo exclusivo para el profesorado\n\nEste bloque reúne los instrumentos de evaluación, registros, pruebas y solucionarios. No forma parte del material entregable al alumnado.\n\n${teacherChapters.join("\n\n---\n\n")}` : "";
      const result = bookTitle + studentChapters.join("\n\n---\n\n") + teacherAnnex;
      await DB.prepare("UPDATE jobs SET title = ?, status = 'completed', result = ?, updated_at = ? WHERE id = ?").bind(`Recurso adaptado · ${job.student_name}`, result, Date.now(), id).run();
      return Response.json({ result });
    }
    const summaries: string[] = [];
    for (const file of preparedFiles) {
      summaries.push(await callModel([{ type: "input_text", text: `Analiza exclusivamente “${file.filename}”, clasificado como ${file.category}. Resume de forma compacta estructura, UDI, contenidos, competencias, criterios, metodología, actividades, recursos y elementos visuales. Si contiene criterios seleccionados, conserva exactamente códigos, descriptores, unidad y asignatura. Este resumen se integrará después en un proyecto interdisciplinar.` }, { type: "input_file", file_id: file.id }], 1500));
    }
    const synthesis = `${content[0].text}\n\nANÁLISIS INDIVIDUAL DE LOS DOCUMENTOS:\n${summaries.map((summary, index) => `\n--- ${preparedFiles[index].category.toUpperCase()} · ${preparedFiles[index].filename} ---\n${summary}`).join("\n")}`.slice(0, 300000);
    const result = await callModel([{ type: "input_text", text: synthesis }], 9000);
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
