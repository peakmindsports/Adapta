"use client";

import { useEffect, useRef, useState } from "react";

type View = "home" | "adaptacion" | "proyecto";
type UploadKey = "dictamen" | "programacion" | "criterios" | "unidades" | "material" | "proyecto" | "project_math" | "project_math_criteria" | "project_language" | "project_language_criteria" | "project_science" | "project_science_criteria" | "project_english" | "project_english_criteria";
type Job = { id: string; kind: string; title: string; studentName?: string; currentCourse?: string; targetCourse?: string; subject?: string; academicYear?: string; teacherName?: string; status: string; createdAt: number; result?: string };
type ApiModel = { id: string; label: string; cost: string; rank: number };
const courses = ["1º de Primaria", "2º de Primaria", "3º de Primaria", "4º de Primaria", "5º de Primaria", "6º de Primaria", "1º de ESO", "2º de ESO"];
const subjects = ["Matemáticas", "Lengua Castellana", "Conocimiento del Medio", "Inglés", "Educación Artística", "Educación Física", "Otra"];
const today = new Date();
const schoolYearStart = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
const academicYears = Array.from({ length: 8 }, (_, index) => `${schoolYearStart - index}/${schoolYearStart - index + 1}`);
const projectSubjects: Array<{ id: "project_math" | "project_language" | "project_science" | "project_english"; criteriaId: "project_math_criteria" | "project_language_criteria" | "project_science_criteria" | "project_english_criteria"; label: string; icon: "math" | "language" | "science" | "english" }> = [
  { id: "project_math", criteriaId: "project_math_criteria", label: "Matemáticas", icon: "math" },
  { id: "project_language", criteriaId: "project_language_criteria", label: "Lengua", icon: "language" },
  { id: "project_science", criteriaId: "project_science_criteria", label: "Conocimiento", icon: "science" },
  { id: "project_english", criteriaId: "project_english_criteria", label: "Inglés", icon: "english" },
];

function SubjectIcon({ type, compact = false }: { type: "math" | "language" | "science" | "english"; compact?: boolean }) {
  const labels = { math: "Matemáticas", language: "Lengua", science: "Conocimiento", english: "Inglés" };
  return <span className={`subject-icon subject-icon-${type}${compact ? " compact" : ""}`} role="img" aria-label={labels[type]}>
    {type === "math" && <><b>∑</b><i>+</i><em>÷</em></>}
    {type === "language" && <><b>“</b><i /><em /></>}
    {type === "science" && <><b>●</b><i /><em /></>}
    {type === "english" && <><b>Hi!</b><i /></>}
  </span>;
}

function UploadBox({ id, eyebrow, title, description, files, onFiles, optional = false }: { id: UploadKey; eyebrow: string; title: string; description: string; files: File[]; onFiles: (id: UploadKey, files: File[]) => void; optional?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className={`upload-box ${files.length ? "has-files" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(id, Array.from(e.dataTransfer.files)); }}>
    <input ref={input} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(e) => onFiles(id, Array.from(e.target.files ?? []))} />
    <div className="upload-icon" aria-hidden="true">↥</div>
    <div className="upload-copy"><span className="eyebrow">{eyebrow}{optional && <em>Opcional</em>}</span><h3>{title}</h3><p>{description}</p>
      {files.length > 0 && <div className="file-list">{files.slice(0, 3).map((file) => <span key={`${file.name}-${file.size}`}>✓ {file.name}</span>)}{files.length > 3 && <span>+ {files.length - 3} archivos más</span>}</div>}
    </div>
    <button type="button" className="file-button" onClick={() => input.current?.click()}>{files.length ? "Añadir más" : "Seleccionar"}</button>
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const viewRef = useRef<View>("home");
  const [files, setFiles] = useState<Record<UploadKey, File[]>>({ dictamen: [], programacion: [], criterios: [], unidades: [], material: [], proyecto: [], project_math: [], project_math_criteria: [], project_language: [], project_language_criteria: [], project_science: [], project_science_criteria: [], project_english: [], project_english_criteria: [] });
  const [notice, setNotice] = useState("");
  const [studentName, setStudentName] = useState("");
  const [currentCourse, setCurrentCourse] = useState("");
  const [targetCourse, setTargetCourse] = useState("");
  const [subject, setSubject] = useState("");
  const [academicYear, setAcademicYear] = useState(academicYears[0]);
  const [teacherName, setTeacherName] = useState("");
  const [notes, setNotes] = useState("");
  const [strengths, setStrengths] = useState("");
  const [classroomContext, setClassroomContext] = useState("");
  const [familyContext, setFamilyContext] = useState("");
  const [effectiveSupports, setEffectiveSupports] = useState("");
  const [theme, setTheme] = useState("");
  const [duration, setDuration] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState("");
  const [activeJob, setActiveJob] = useState("");
  const [history, setHistory] = useState<Job[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyKind, setHistoryKind] = useState("");
  const [historySubject, setHistorySubject] = useState("");
  const [historyLevel, setHistoryLevel] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [models, setModels] = useState<ApiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelNote, setModelNote] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [projectTarget, setProjectTarget] = useState("");
  const [adaptingProject, setAdaptingProject] = useState(false);
  const [adaptedProject, setAdaptedProject] = useState<{ result: string; jobId: string } | null>(null);
  const [projectSubject, setProjectSubject] = useState<"project_math" | "project_language" | "project_science" | "project_english">("project_math");
  const [recommendation, setRecommendation] = useState<{ recommendedCourse: string; explanation: string; confidence: string; caveat: string } | null>(null);
  const addFiles = (key: UploadKey, incoming: File[]) => setFiles((current) => ({ ...current, [key]: [...current[key], ...incoming] }));
  const go = (next: View) => { setNotice(""); if (!processing) { setResult(""); setActiveJob(""); setAdaptedProject(null); setProgress(0); setProgressLabel(""); } viewRef.current = next; setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const loadHistory = async () => { const response = await fetch("/api/jobs"); if (response.ok) setHistory((await response.json()).jobs); };
  const openHistory = async () => { await loadHistory(); setShowHistory(true); };
  const visibleHistory = history.filter((job) => {
    const query = historySearch.trim().toLocaleLowerCase("es");
    const searchable = [job.title, job.studentName, job.teacherName, job.subject, job.currentCourse, job.targetCourse].filter(Boolean).join(" ").toLocaleLowerCase("es");
    return (!query || searchable.includes(query)) && (!historyKind || (historyKind === "project" ? job.kind.startsWith("project") : job.kind === historyKind)) && (!historySubject || job.subject === historySubject) && (!historyLevel || job.targetCourse === historyLevel || job.currentCourse === historyLevel) && (!historyYear || job.academicYear === historyYear);
  });
  const recoverJob = async (job: Job) => {
    const response = await fetch(`/api/jobs/${job.id}`); const body = await responseBody(response); if (!response.ok || !body.job?.result) return;
    const saved = body.job as Job; setStudentName(saved.studentName || ""); setCurrentCourse(saved.currentCourse || ""); setTargetCourse(saved.targetCourse || ""); setSubject(saved.subject || ""); setAcademicYear(saved.academicYear || academicYears[0]); setTeacherName(saved.teacherName || ""); setActiveJob(saved.id); setResult(saved.result || ""); setShowHistory(false); viewRef.current = saved.kind === "adaptation" ? "adaptacion" : "proyecto"; setView(viewRef.current); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openAdmin = async () => { setShowAdmin(true); setAdminStatus("Consultando modelos disponibles…"); const response = await fetch("/api/admin/models"); const body = await responseBody(response); if (!response.ok) { setAdminStatus(body.error); return; } setModels(body.models); setSelectedModel(body.selected); setModelNote(body.note); setAdminStatus(""); };
  const saveModel = async () => { setAdminStatus("Guardando…"); const response = await fetch("/api/admin/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: selectedModel }) }); const body = await responseBody(response); setAdminStatus(response.ok ? `Modelo activo: ${body.selected}` : body.error); };
  const responseBody = async (response: Response) => {
    const text = await response.text();
    try { return JSON.parse(text); } catch { return { error: response.status === 413 ? "La plataforma rechazó un fragmento de la subida. Se ha reducido automáticamente el tamaño de los fragmentos; recarga la página e inténtalo de nuevo." : `El servidor no pudo procesar la solicitud (${response.status}).` }; }
  };
  const recommendLevel = async () => {
    setRecommendation(null); setNotice("");
    if (!studentName.trim() || !currentCourse) { setNotice("Indica el nombre y el curso actual antes de analizar los informes."); return; }
    if (!files.dictamen.length) { setNotice("Añade al menos un dictamen, informe o adaptación previa."); return; }
    setAssessing(true);
    try {
      const create = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "adaptation", studentName, currentCourse, targetCourse: "Pendiente de valoración", subject, academicYear, teacherName }) });
      const created = await responseBody(create); if (!create.ok) throw new Error(created.error);
      let done = 0;
      for (const file of files.dictamen) { const chunkSize = 768 * 1024; const total = Math.ceil(file.size / chunkSize); const uploadId = crypto.randomUUID(); for (let index = 0; index < total; index++) { const form = new FormData(); form.append("category", "dictamen"); form.append("uploadId", uploadId); form.append("chunkIndex", String(index)); form.append("chunkTotal", String(total)); form.append("originalName", file.name); form.append("originalType", file.type || "application/octet-stream"); form.append("totalSize", String(file.size)); form.append("files", file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)), `parte-${index}`); const upload = await fetch(`/api/jobs/${created.job.id}/files`, { method: "POST", body: form }); const uploaded = await responseBody(upload); if (!upload.ok) throw new Error(uploaded.error || `No se pudo subir “${file.name}”.`); } done += 1; setNotice(`Informes preparados: ${done} de ${files.dictamen.length}`); }
      const response = await fetch(`/api/jobs/${created.job.id}/recommend-level`, { method: "POST" }); const body = await responseBody(response); if (!response.ok) throw new Error(body.error);
      setRecommendation(body.recommendation); setTargetCourse(body.recommendation.recommendedCourse); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo estimar el nivel."); } finally { setAssessing(false); }
  };
  const generate = async (kind: "adaptation" | "project") => {
    setNotice(""); setResult(""); setAdaptedProject(null); setProgress(0); setProgressLabel("");
    if (kind === "adaptation" && (!studentName.trim() || !currentCourse || !targetCourse)) { setNotice("Completa el nombre, el curso actual y el nivel de adaptación."); return; }
    if (kind === "project" && !currentCourse) { setNotice("Selecciona el curso del proyecto."); return; }
    const groups: [UploadKey, File[]][] = kind === "adaptation" ? [["dictamen", files.dictamen], ["programacion", files.programacion], ["criterios", files.criterios], ["unidades", files.unidades], ["material", files.material]] : projectSubjects.flatMap((subject) => [[subject.id, files[subject.id]], [subject.criteriaId, files[subject.criteriaId]]] as [UploadKey, File[]][]);
    if (!groups.some(([, list]) => list.length)) { setNotice("Añade al menos un documento antes de generar."); return; }
    const allSelected = groups.flatMap(([category, list]) => list.map((file) => ({ category, file })));
    const oversized = allSelected.find(({ file }) => file.size > 60 * 1024 * 1024);
    const totalBytes = allSelected.reduce((sum, { file }) => sum + file.size, 0);
    if (oversized) { setNotice(`“${oversized.file.name}” supera el límite de 60 MB por documento.`); return; }
    if (totalBytes > 180 * 1024 * 1024) { setNotice("El conjunto supera 180 MB. Divide la carga en dos trabajos."); return; }
    setProcessing(true); setProgress(2); setProgressLabel("Preparando el trabajo…");
    let generationTimer: ReturnType<typeof setInterval> | undefined;
    try {
      const create = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, studentName, currentCourse, targetCourse, theme, subject, academicYear, teacherName }) });
      const created = await responseBody(create); if (!create.ok) throw new Error(created.error || "No se pudo crear el trabajo.");
      setActiveJob(created.job.id);
      let completedFiles = 0; let uploadedChunks = 0; const chunkSize = 768 * 1024; const totalChunks = allSelected.reduce((sum, item) => sum + Math.ceil(item.file.size / chunkSize), 0);
      const uploadOne = async ({ category, file }: { category: UploadKey; file: File }) => { const total = Math.ceil(file.size / chunkSize); const uploadId = crypto.randomUUID(); for (let index = 0; index < total; index++) { const form = new FormData(); form.append("category", category); form.append("uploadId", uploadId); form.append("chunkIndex", String(index)); form.append("chunkTotal", String(total)); form.append("originalName", file.name); form.append("originalType", file.type || "application/octet-stream"); form.append("totalSize", String(file.size)); form.append("files", file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)), `parte-${index}`); const upload = await fetch(`/api/jobs/${created.job.id}/files`, { method: "POST", body: form }); const uploaded = await responseBody(upload); if (!upload.ok) throw new Error(uploaded.error || `No se pudo guardar “${file.name}” (parte ${index + 1}/${total}).`); uploadedChunks += 1; setProgress(Math.min(52, 3 + Math.round((uploadedChunks / totalChunks) * 49))); setProgressLabel(`Subiendo documentos · ${completedFiles + 1} de ${allSelected.length}`); } completedFiles += 1; setNotice(`Documentos subidos: ${completedFiles} de ${allSelected.length}`); };
      const queue = [...allSelected];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) { const next = queue.shift(); if (next) await uploadOne(next); } }));
      setProgress(56); setProgressLabel(kind === "adaptation" ? "Analizando las UDI y los criterios…" : "Analizando las áreas y sus criterios…");
      generationTimer = setInterval(() => setProgress((value) => Math.min(94, value + (value < 75 ? 2 : 1))), 1800);
      const response = await fetch(`/api/jobs/${created.job.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes, theme, duration, studentContext: { strengths, classroomContext, familyContext, effectiveSupports } }) });
      const generated = await responseBody(response); if (!response.ok) throw new Error(generated.error || "No se pudo generar la propuesta.");
      if (generationTimer) clearInterval(generationTimer); setProgress(100); setProgressLabel(kind === "adaptation" ? "Libro completado y guardado · disponible en Adaptaciones y Mi historial" : "Proyecto completado y guardado · disponible en Proyectos y Mi historial"); if (viewRef.current === (kind === "adaptation" ? "adaptacion" : "proyecto")) setResult(generated.result); else setResult(""); setNotice(kind === "adaptation" ? "Libro generado y guardado correctamente en Mi historial." : "Proyecto generado y guardado correctamente en Mi historial."); await loadHistory();
    } catch (error) { setProgressLabel("El proceso se ha detenido"); setNotice(error instanceof Error ? error.message : "Ha ocurrido un error inesperado."); } finally { if (generationTimer) clearInterval(generationTimer); setProcessing(false); setTimeout(() => document.querySelector(".result-panel, .success-note")?.scrollIntoView({ behavior: "smooth" }), 20); }
  };
  const adaptProject = async () => {
    if (!activeJob || !result) { setNotice("Primero genera el proyecto interdisciplinar."); return; }
    if (!projectTarget) { setNotice("Selecciona el nivel educativo al que quieres adaptar el proyecto."); return; }
    setAdaptingProject(true); setNotice(""); setAdaptedProject(null);
    try { const response = await fetch(`/api/jobs/${activeJob}/adapt-project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetCourse: projectTarget }) }); const body = await responseBody(response); if (!response.ok) throw new Error(body.error || "No se pudo adaptar el proyecto."); setAdaptedProject({ result: body.result, jobId: body.jobId }); setNotice(`Proyecto adaptado a ${projectTarget} y guardado por separado.`); await loadHistory(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo adaptar el proyecto."); }
    finally { setAdaptingProject(false); setTimeout(() => document.querySelector(".adapted-project-result, .success-note")?.scrollIntoView({ behavior: "smooth" }), 20); }
  };

  return <main>
    <header className="site-header">
      <button className="brand" onClick={() => go("home")} aria-label="Ir al inicio"><span className="brand-mark">A<span>+</span></span><span><strong>Adapta</strong><small>Docencia a medida</small></span></button>
      <nav aria-label="Navegación principal"><button className={view === "adaptacion" ? "active" : ""} onClick={() => go("adaptacion")}>Adaptaciones</button><button className={view === "proyecto" ? "active" : ""} onClick={() => go("proyecto")}>Proyectos</button></nav>
      <div className="header-tools"><button className="admin-button" onClick={openAdmin}>⚙ Administrador</button><button className="teacher-pill" onClick={openHistory}><span>MP</span><div><strong>Mi historial</strong><small>Trabajos guardados</small></div></button></div>
    </header>
    {progress > 0 && <GenerationProgress value={progress} label={progressLabel} active={processing} />}

    {view === "home" && <div className="home-view">
      <section className="hero">
        <div className="hero-copy"><span className="hero-tag"><i /> Inteligencia artificial al servicio de la inclusión</span><h1>Cada persona aprende<br /><em>a su manera.</em></h1><p>Convierte tus unidades didácticas en experiencias accesibles, ajustadas al nivel real de cada estudiante y listas para llevar al aula.</p>
          <div className="hero-actions"><button className="primary" onClick={() => go("adaptacion")}>Crear una adaptación <span>→</span></button><button className="text-button" onClick={() => go("proyecto")}>Diseñar un proyecto <span>↗</span></button></div>
          <div className="trust-line"><span className="avatar-stack"><i>LM</i><i>AS</i><i>JR</i></span><span>Diseñado junto a docentes<br /><strong>para simplificar, no para sustituir.</strong></span></div>
        </div>
        <div className="hero-visual" aria-label="Ejemplo visual de una adaptación curricular"><div className="paper-grid" /><div className="student-card"><span className="student-avatar">N</span><div><small>ESTUDIANTE</small><strong>Noa Martínez</strong><p>5º Primaria · Nivel 2º</p></div><span className="status">Adaptando</span></div><div className="flow-card original"><span className="book-icon">5º</span><div><small>CONTENIDO ORIGINAL</small><strong>Las fracciones</strong><p>Matemáticas · Unidad 6</p></div></div><div className="connector"><span>✦</span></div><div className="flow-card adapted"><span className="book-icon">2º</span><div><small>PROPUESTA ADAPTADA</small><strong>Repartimos en partes</strong><p>Apoyo visual · Manipulativo</p></div><b>✓</b></div><div className="pencil-shape" /><div className="spark s1">✦</div><div className="spark s2">✦</div></div>
      </section>
      <section className="choice-section"><div className="section-heading"><span>¿QUÉ QUIERES CREAR HOY?</span><h2>Elige tu punto de partida</h2><p>Te acompañamos paso a paso. Solo necesitas tus materiales de clase.</p></div><div className="choice-grid">
        <button className="choice-card coral" onClick={() => go("adaptacion")}><span className="choice-number">01</span><div className="choice-icon">Aa</div><div><span className="mini-label">PARA CADA ESTUDIANTE</span><h3>Adaptación curricular</h3><p>Ajusta los contenidos del curso al nivel competencial de la persona, respetando el formato y estilo de tus unidades.</p><span className="card-link">Comenzar adaptación <b>→</b></span></div></button>
        <button className="choice-card blue" onClick={() => go("proyecto")}><span className="choice-number">02</span><div className="choice-icon">✣</div><div><span className="mini-label">PARA TODA LA CLASE</span><h3>Proyecto interdisciplinar</h3><p>Conecta Matemáticas, Lengua, Conocimiento e Inglés en una experiencia global con un producto final compartido.</p><span className="card-link">Diseñar proyecto <b>→</b></span></div></button>
      </div></section>
    </div>}

    {view === "adaptacion" && <section className="workspace">
      <button className="back" onClick={() => go("home")}>← Volver al inicio</button><div className="workspace-title"><span className="section-kicker coral-ink">ADAPTACIÓN CURRICULAR</span><h1>Conozcamos a nuestro alumnado</h1><p>La información que compartas nos ayudará a crear una propuesta realista, respetuosa y útil para el aula.</p></div>
      <div className="form-shell"><aside><span>01</span><strong>Datos personales</strong><i /><span>02</span><strong>Documentación</strong><i /><span>03</span><strong>Generar</strong></aside><div className="form-content">
        <div className="form-section"><span className="step-label">01 · INFORMACIÓN BÁSICA</span><h2>¿Para quién es esta adaptación?</h2><div className="field full"><label htmlFor="student">Nombre y apellidos</label><input id="student" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Ej. Noa Martínez López" /></div><div className="field-grid"><div className="field"><label htmlFor="current">Curso en el que está matriculado</label><select id="current" value={currentCourse} onChange={(e) => setCurrentCourse(e.target.value)}><option value="" disabled>Selecciona un curso</option>{courses.map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="target">Nivel al que adaptar el contenido</label><select id="target" value={targetCourse} onChange={(e) => setTargetCourse(e.target.value)}><option value="" disabled>Selecciona el nivel competencial</option>{courses.map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="subject">Asignatura o área principal</label><select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Selecciona un área</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="academic-year">Año académico</label><select id="academic-year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>{academicYears.map((year) => <option key={year}>{year}</option>)}</select></div></div><div className="field full"><label htmlFor="teacher-name">Docente responsable</label><input id="teacher-name" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Nombre y apellidos del profesorado que realiza la adaptación" /></div></div>
        <div className="form-section"><span className="step-label">02 · DOCUMENTACIÓN Y MATERIALES</span><h2>Comparte el contexto pedagógico</h2><p className="section-help">Puedes arrastrar archivos o seleccionarlos. Formatos admitidos: PDF, Word, PowerPoint e imágenes.</p>
          <UploadBox id="dictamen" eyebrow="DOCUMENTACIÓN PERSONAL Y EDUCATIVA" title="Dictamen, adaptaciones o refuerzos" description="Nos ayudará a respetar las necesidades, medidas y orientaciones ya establecidas." files={files.dictamen} onFiles={addFiles} />
          <div className="level-advisor"><div><strong>¿Qué nivel competencial sugieren los informes?</strong><p>La IA puede proponerte un curso de referencia. Podrás corregirlo antes de crear el libro.</p></div><button type="button" disabled={assessing || !files.dictamen.length} onClick={recommendLevel}>{assessing ? "Analizando informes…" : "Proponer nivel con IA"}</button></div>
          {recommendation && <div className="recommendation-card"><span>NIVEL PROPUESTO · CONFIANZA {recommendation.confidence?.toUpperCase()}</span><h3>{recommendation.recommendedCourse}</h3><p>{recommendation.explanation}</p><small>{recommendation.caveat} La decisión final corresponde al equipo docente y de orientación.</small></div>}
          <UploadBox id="programacion" eyebrow="MAPA CURRICULAR ANUAL" title="Programación didáctica completa" description="Objetivos, contenidos, competencias específicas, criterios de evaluación y su distribución en cada unidad." files={files.programacion} onFiles={addFiles} optional />
          <UploadBox id="criterios" eyebrow="PRIORIDAD DE APRENDIZAJE Y EVALUACIÓN" title="Criterios seleccionados de todas las unidades" description="Sube simultáneamente los documentos con los criterios elegidos para todas las UDI de la asignatura. Se usarán para crear actividades, pruebas y productos finales." files={files.criterios} onFiles={addFiles} optional />
          <UploadBox id="unidades" eyebrow="CONTENIDO DE PARTIDA" title="Unidades didácticas del curso actual" description="Añade las UDI que vas a impartir. Puedes subirlas todas o trabajar una cada vez." files={files.unidades} onFiles={addFiles} />
          <UploadBox id="material" eyebrow="MODELO DE NIVEL" title="Material del nivel de referencia" description="Libros, fichas o UDI del curso al que adaptaremos el contenido. Servirán como guía de formato y dificultad." files={files.material} onFiles={addFiles} optional />
        </div>
        <div className="student-context"><span className="step-label">03 · CONTEXTO PERSONAL Y EDUCATIVO</span><h2>Lo que ayuda a cada estudiante a aprender</h2><p>Incluye solo información relevante para la intervención educativa. Describe situaciones observables y evita datos innecesarios de terceras personas.</p><div className="context-grid"><div className="notes-field"><label htmlFor="strengths">Fortalezas, intereses y motivadores <span>Opcional</span></label><textarea id="strengths" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Qué le interesa, en qué destaca, qué actividades le motivan..." /><PhraseDropdown category="strengths" onPick={(phrase) => setStrengths((value) => value ? `${value} ${phrase}` : phrase)} /></div><div className="notes-field"><label htmlFor="classroom-context">Situaciones en el aula y necesidades de apoyo <span>Opcional</span></label><textarea id="classroom-context" value={classroomContext} onChange={(e) => setClassroomContext(e.target.value)} placeholder="Atención, frustración, relación con iguales, autonomía, comunicación, desencadenantes observables..." /><PhraseDropdown category="classroom" onPick={(phrase) => setClassroomContext((value) => value ? `${value} ${phrase}` : phrase)} /></div><div className="notes-field"><label htmlFor="family-context">Contexto familiar relevante <span>Opcional</span></label><textarea id="family-context" value={familyContext} onChange={(e) => setFamilyContext(e.target.value)} placeholder="Rutinas, disponibilidad de apoyo, idiomas familiares, coordinación necesaria..." /><PhraseDropdown category="family" onPick={(phrase) => setFamilyContext((value) => value ? `${value} ${phrase}` : phrase)} /></div><div className="notes-field"><label htmlFor="effective-supports">Estrategias que funcionan y situaciones a evitar <span>Opcional</span></label><textarea id="effective-supports" value={effectiveSupports} onChange={(e) => setEffectiveSupports(e.target.value)} placeholder="Anticipación, descansos, apoyos visuales, refuerzo, agrupamientos, ajustes del entorno..." /><PhraseDropdown category="supports" onPick={(phrase) => setEffectiveSupports((value) => value ? `${value} ${phrase}` : phrase)} /></div></div></div><div className="notes-field"><label htmlFor="priorities">Otras indicaciones para la adaptación <span>Opcional</span></label><textarea id="priorities" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Priorizar actividades manipulativas, reducir la carga de escritura, mantener el tema de la unidad..." /></div>{notice && <div className="success-note">{notice}</div>}{result && <ResultPanel result={result} jobId={activeJob} />}
        <PhraseCreator />
        <div className="form-footer"><p><strong>Libro anual completo</strong><br />Cada UDI se convertirá en un capítulo adaptado y todo quedará unido en un documento.</p><button className="primary" disabled={processing} onClick={() => generate("adaptation")}>{processing ? "Creando el libro por unidades…" : "Generar libro adaptado"} <span>✦</span></button></div>
      </div></div>
    </section>}

    {view === "proyecto" && <section className="workspace project-workspace">
      <button className="back" onClick={() => go("home")}>← Volver al inicio</button><div className="workspace-title"><span className="section-kicker blue-ink">PROYECTO INTERDISCIPLINAR</span><h1>Una idea, muchas formas de aprender</h1><p>Reúne las unidades de las distintas áreas y crea una experiencia conectada, participativa y con sentido.</p></div>
      <div className="project-layout"><div className="project-main">
        <div className="form-section"><span className="step-label blue-ink">01 · CONTEXTO DEL PROYECTO</span><h2>Define el punto de partida</h2><div className="field-grid"><div className="field"><label htmlFor="project-course">Curso o grupo</label><select id="project-course" value={currentCourse} onChange={(e) => setCurrentCourse(e.target.value)}><option value="" disabled>Selecciona un curso</option>{courses.map((c) => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="duration">Duración aproximada</label><select id="duration" value={duration} onChange={(e) => setDuration(e.target.value)}><option value="" disabled>Selecciona una duración</option><option>1–2 semanas</option><option>3–4 semanas</option><option>Un trimestre</option></select></div><div className="field"><label htmlFor="project-year">Año académico</label><select id="project-year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>{academicYears.map((year) => <option key={year}>{year}</option>)}</select></div><div className="field"><label htmlFor="project-teacher">Docente responsable</label><input id="project-teacher" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Nombre y apellidos" /></div></div><div className="field full"><label htmlFor="theme">Tema, reto o centro de interés</label><input id="theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ej. ¿Cómo podemos cuidar el agua en nuestro colegio?" /></div></div>
        <div className="form-section"><span className="step-label blue-ink">02 · DOCUMENTOS POR ÁREAS</span><h2>Añade todo lo que quieres conectar</h2><p className="section-help">Selecciona una asignatura. Dentro de cada área puedes subir por separado sus materiales y la selección de criterios de todas sus unidades.</p><div className="subject-picker">{projectSubjects.map((subject) => <button type="button" key={subject.id} className={projectSubject === subject.id ? "active" : ""} onClick={() => setProjectSubject(subject.id)}><SubjectIcon type={subject.icon} /><strong>{subject.label}</strong><small>{files[subject.id].length + files[subject.criteriaId].length ? `${files[subject.id].length + files[subject.criteriaId].length} archivo${files[subject.id].length + files[subject.criteriaId].length === 1 ? "" : "s"}` : "Añadir documentos"}</small></button>)}</div>{projectSubjects.map((subject) => projectSubject === subject.id && <div className="subject-uploads" key={subject.id}><UploadBox id={subject.id} eyebrow={`MATERIALES DE ${subject.label.toUpperCase()}`} title={`UDI y programación de ${subject.label}`} description="Sube simultáneamente las unidades, la programación y los materiales de esta asignatura." files={files[subject.id]} onFiles={addFiles} /><UploadBox id={subject.criteriaId} eyebrow={`EVALUACIÓN DE ${subject.label.toUpperCase()}`} title="Criterios seleccionados de todas las unidades" description={`Sube de una vez la selección de criterios de todas las UDI de ${subject.label}. Guiará el producto final, las evidencias y los instrumentos de evaluación.`} files={files[subject.criteriaId]} onFiles={addFiles} optional /></div>)}<div className="project-upload-summary">{projectSubjects.map((subject) => <span key={subject.id}><SubjectIcon type={subject.icon} compact /> {subject.label}: {files[subject.id].length} materiales · {files[subject.criteriaId].length} criterios</span>)}</div></div>
        <div className="notes-field"><label htmlFor="project-notes">Algo que no puede faltar <span>Opcional</span></label><textarea id="project-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Intereses del grupo, recursos del centro, fechas señaladas, necesidades específicas..." /></div>{notice && <div className="success-note">{notice}</div>}{result && <><ResultPanel result={result} jobId={activeJob} /><section className="project-adapter"><span className="step-label blue-ink">SIGUIENTE PASO · OPCIONAL</span><h2>Adaptar este proyecto a otro nivel</h2><p>Se conservarán el mismo reto, producto final y trabajo interdisciplinar. Solo se ajustarán el acceso, los apoyos, las tareas y la evaluación.</p><div className="project-adapter-controls"><select aria-label="Nivel educativo para adaptar el proyecto" value={projectTarget} onChange={(event) => setProjectTarget(event.target.value)}><option value="" disabled>Selecciona un nivel educativo</option>{courses.map((course) => <option key={course}>{course}</option>)}</select><button className="primary blue-primary" disabled={adaptingProject} onClick={adaptProject}>{adaptingProject ? "Adaptando el proyecto…" : "Adaptar este proyecto"}</button></div></section>{adaptedProject && <div className="adapted-project-result"><ResultPanel result={adaptedProject.result} jobId={adaptedProject.jobId} /></div>}</>}<div className="form-footer"><p><strong>Una experiencia común para todo el grupo</strong><br />Un único reto interdisciplinar, producto final y participación familiar.</p><button className="primary blue-primary" disabled={processing} onClick={() => generate("project")}>{processing ? "Conectando las áreas…" : "Generar proyecto"} <span>✦</span></button></div>
      </div><aside className="project-output"><span className="output-tag">LA PROPUESTA INCLUIRÁ</span><h3>De las UDI a una experiencia compartida</h3><ul><li><i>01</i><div><strong>Hilo conductor</strong><p>Una narrativa que conecta todas las áreas.</p></div></li><li><i>02</i><div><strong>Producto final</strong><p>Un resultado auténtico para mostrar y celebrar.</p></div></li><li><i>03</i><div><strong>Dinámicas activas</strong><p>Retos, equipos, talleres y decisiones del alumnado.</p></div></li><li><i>04</i><div><strong>Participación familiar</strong><p>Propuestas concretas para sumar a las familias.</p></div></li><li><i>05</i><div><strong>Evaluación integrada</strong><p>Rúbrica y evidencias por áreas.</p></div></li></ul><blockquote>“Aprender deja de ser una suma de asignaturas y se convierte en una experiencia.”</blockquote></aside></div>
    </section>}
    {showHistory && <div className="history-overlay" onClick={() => setShowHistory(false)}><aside className="history-panel history-panel-wide" onClick={(e) => e.stopPropagation()}><button className="history-close" onClick={() => setShowHistory(false)}>×</button><span className="section-kicker blue-ink">MI ESPACIO</span><h2>Archivo de trabajos</h2><p>Busca, recupera y descarga todas las adaptaciones y proyectos guardados.</p><div className="history-filters"><input aria-label="Buscar trabajos" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Buscar por estudiante, título o docente…" /><select aria-label="Filtrar por tipo" value={historyKind} onChange={(e) => setHistoryKind(e.target.value)}><option value="">Todos los tipos</option><option value="adaptation">Adaptaciones</option><option value="project">Proyectos</option></select><select aria-label="Filtrar por asignatura" value={historySubject} onChange={(e) => setHistorySubject(e.target.value)}><option value="">Todas las áreas</option>{[...new Set(history.map((job) => job.subject).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filtrar por nivel" value={historyLevel} onChange={(e) => setHistoryLevel(e.target.value)}><option value="">Todos los niveles</option>{courses.map((course) => <option key={course}>{course}</option>)}</select><select aria-label="Filtrar por año académico" value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}><option value="">Todos los cursos académicos</option>{academicYears.map((year) => <option key={year}>{year}</option>)}</select></div><div className="history-count">{visibleHistory.length} trabajo{visibleHistory.length === 1 ? "" : "s"} encontrado{visibleHistory.length === 1 ? "" : "s"}</div><div className="history-list">{visibleHistory.length ? visibleHistory.map((job) => <article key={job.id}><div className="history-copy"><span>{job.kind === "adaptation" ? "ADAPTACIÓN" : job.kind === "project_adaptation" ? "PROYECTO ADAPTADO" : "PROYECTO"}</span><strong>{job.title}</strong><small>{[job.subject, job.targetCourse || job.currentCourse, job.academicYear, job.teacherName].filter(Boolean).join(" · ")}</small><small>{new Date(job.createdAt).toLocaleDateString("es-ES")} · {job.status === "completed" ? "Completado" : job.status}</small></div>{job.status === "completed" && <div className="history-downloads"><button type="button" onClick={() => recoverJob(job)}>Abrir</button><a href={`/api/jobs/${job.id}/download?format=pdf`}>PDF</a><a href={`/api/jobs/${job.id}/download?format=docx`}>Word</a></div>}</article>) : <div className="empty-history">No hay trabajos que coincidan con esos filtros.</div>}</div></aside></div>}
    {showAdmin && <div className="history-overlay" onClick={() => setShowAdmin(false)}><aside className="history-panel admin-panel" onClick={(e) => e.stopPropagation()}><button className="history-close" onClick={() => setShowAdmin(false)}>×</button><span className="section-kicker coral-ink">ADMINISTRACIÓN</span><h2>Modelo de inteligencia artificial</h2><p>Elige el equilibrio entre coste y capacidad para las próximas generaciones.</p>{adminStatus && <div className="admin-status">{adminStatus}</div>}<div className="model-list">{models.map((model) => <label key={model.id} className={selectedModel === model.id ? "selected" : ""}><input type="radio" name="model" value={model.id} checked={selectedModel === model.id} onChange={() => setSelectedModel(model.id)} /><div><strong>{model.label}</strong><span>{model.cost}</span></div></label>)}</div>{modelNote && <p className="model-note">{modelNote}</p>}<button className="primary admin-save" disabled={!selectedModel} onClick={saveModel}>Guardar modelo</button></aside></div>}
    <footer><span className="brand-mark small">A<span>+</span></span><p>Adapta · Herramientas docentes para una escuela inclusiva</p><span>Hecho con cuidado para quienes enseñan</span></footer>
  </main>;
}

function ResultPanel({ result, jobId }: { result: string; jobId: string }) {
  const units = [...result.matchAll(/^# Unidad\s+(\d+)\s*:\s*(.+)$/gim)].map((match) => ({ number: Number(match[1]), title: match[2].trim() }));
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const selectedQuery = selectedUnits.length ? `&units=${selectedUnits.join(",")}` : "";
  const toggleUnit = (number: number) => setSelectedUnits((current) => current.includes(number) ? current.filter((item) => item !== number) : [...current, number].sort((a, b) => a - b));
  return <section className="result-panel"><div><span>PROPUESTA GENERADA</span><h2>Tu documento está listo</h2><small className="student-privacy-note">🔒 El nivel competencial solo es visible aquí. No aparecerá en los archivos entregables.</small></div><div className="result-downloads"><a href={`/api/jobs/${jobId}/download?format=pdf`}>PDF completo ↓</a><a href={`/api/jobs/${jobId}/download?format=docx`}>Word completo ↓</a></div>{units.length > 1 && <details className="unit-download-picker"><summary>Descargar unidades concretas</summary><p>Marca una o varias UDI para crear un documento independiente con esa selección.</p><div className="unit-checks">{units.map((unit) => <label key={unit.number}><input type="checkbox" checked={selectedUnits.includes(unit.number)} onChange={() => toggleUnit(unit.number)} /><span><b>UDI {unit.number}</b>{unit.title}</span></label>)}</div><div className="unit-selection-actions"><button type="button" onClick={() => setSelectedUnits(units.map((unit) => unit.number))}>Seleccionar todas</button><button type="button" onClick={() => setSelectedUnits([])}>Limpiar</button>{selectedUnits.length > 0 && <><a href={`/api/jobs/${jobId}/download?format=pdf${selectedQuery}`}>PDF de la selección ↓</a><a href={`/api/jobs/${jobId}/download?format=docx${selectedQuery}`}>Word de la selección ↓</a></>}</div></details>}<pre>{result}</pre></section>;
}

function GenerationProgress({ value, label, active }: { value: number; label: string; active: boolean }) {
  return <section className={`generation-progress ${active ? "active" : "complete"}`} aria-live="polite" aria-label={`Progreso de generación: ${value}%`}><div><span>{active ? "CREANDO DOCUMENTO" : "PROCESO COMPLETADO"}</span><strong>{label}</strong></div><b>{value}%</b><div className="progress-track"><i style={{ width: `${value}%` }} /></div><small>{value < 53 ? "Estamos guardando los documentos de forma segura." : value < 95 ? "La IA está trabajando documento a documento. Puedes mantener esta pestaña abierta." : "Preparando el resultado y las descargas."}</small></section>;
}

const phraseDefaults: Record<string, string[]> = {
  strengths: ["Muestra interés por actividades manipulativas.", "Aprende mejor mediante apoyos visuales.", "Participa con motivación cuando el tema conecta con sus intereses.", "Destaca en tareas prácticas y creativas."],
  classroom: ["Necesita instrucciones breves, secuenciadas y comprobación de comprensión.", "Se beneficia de tiempos de trabajo cortos con pausas planificadas.", "Presenta dificultad para iniciar las tareas de forma autónoma.", "La sobrecarga de escritura puede generar frustración o abandono."],
  family: ["La familia mantiene una coordinación frecuente con el centro.", "Conviene proponer actividades domésticas breves y fácilmente realizables.", "La disponibilidad de apoyo familiar fuera del horario escolar es limitada.", "Es importante facilitar instrucciones claras y anticipadas a la familia."],
  supports: ["Funcionan bien las agendas visuales y la anticipación de cambios.", "Responde positivamente al refuerzo concreto e inmediato.", "Se recomienda ofrecer modelos resueltos antes del trabajo autónomo.", "Conviene evitar correcciones públicas y situaciones de exposición innecesaria."],
};
const phraseLabels: Record<string, string> = { strengths: "Fortalezas e intereses", classroom: "Aula y conducta", family: "Contexto familiar", supports: "Estrategias eficaces" };

function PhraseDropdown({ category, onPick }: { category: string; onPick: (phrase: string) => void }) {
  const [saved, setSaved] = useState<Array<{ category: string; phrase: string }>>([]);
  useEffect(() => { const load = () => { fetch("/api/context-phrases").then((response) => response.ok ? response.json() : { phrases: [] }).then((data) => setSaved(data.phrases || [])).catch(() => {}); }; load(); window.addEventListener("phrases-updated", load); return () => window.removeEventListener("phrases-updated", load); }, []);
  const choices = [...phraseDefaults[category], ...saved.filter((item) => item.category === category).map((item) => item.phrase)];
  return <select className="phrase-select" value="" aria-label={`Frases tipo: ${phraseLabels[category]}`} onChange={(event) => { if (event.target.value) onPick(event.target.value); }}><option value="">＋ Añadir una frase tipo…</option>{choices.map((phrase, index) => <option key={`${phrase}-${index}`} value={phrase}>{phrase}</option>)}</select>;
}

function PhraseCreator() {
  const [open, setOpen] = useState(false); const [category, setCategory] = useState("strengths"); const [draft, setDraft] = useState(""); const [message, setMessage] = useState("");
  const save = async () => { const phrase = draft.trim(); if (!phrase) return; setMessage("Guardando…"); const response = await fetch("/api/context-phrases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, phrase }) }); if (response.ok) { setDraft(""); setMessage("Frase guardada. Ya aparece en su desplegable."); window.dispatchEvent(new Event("phrases-updated")); } else setMessage("No se pudo guardar la frase."); };
  return <section className="phrase-library"><button type="button" className="phrase-toggle" onClick={() => setOpen(!open)}>＋ Crear una nueva frase tipo</button>{open && <div className="phrase-box"><label htmlFor="new-phrase-category">¿En qué apartado debe aparecer?</label><select id="new-phrase-category" value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(phraseLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><div className="new-phrase"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe la nueva frase tipo..." maxLength={300} /><button type="button" onClick={save}>Guardar frase</button></div>{message && <p>{message}</p>}</div>}</section>;
}
