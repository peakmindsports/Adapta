"use client";

import { useRef, useState } from "react";

type Competency = { code: string; text: string };
type Curriculum = { sourceTitle: string; sourceUrl: string; competencies: Competency[] };

const courses = ["1º de Primaria", "2º de Primaria", "3º de Primaria", "4º de Primaria", "5º de Primaria", "6º de Primaria", "1º de ESO", "2º de ESO", "3º de ESO", "4º de ESO"];
const primarySubjects = ["Lengua Castellana y Literatura", "Matemáticas", "Conocimiento del Medio Natural, Social y Cultural", "Primera Lengua Extranjera", "Educación Artística", "Educación Física", "Educación en Valores Cívicos y Éticos"];
const esoSubjects = ["Lengua Castellana y Literatura", "Matemáticas", "Primera Lengua Extranjera", "Geografía e Historia", "Biología y Geología", "Física y Química", "Tecnología y Digitalización", "Educación Física", "Música", "Educación Plástica, Visual y Audiovisual", "Educación en Valores Cívicos y Éticos"];

async function bodyOf(response: Response) { const text = await response.text(); try { return JSON.parse(text); } catch { return { error: text || "Respuesta no válida." }; } }

export default function InitialAssessment() {
  const input = useRef<HTMLInputElement>(null);
  const [course, setCourse] = useState("");
  const [subject, setSubject] = useState("");
  const [studentName, setStudentName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ id: string; text: string } | null>(null);
  const subjects = course.includes("ESO") ? esoSubjects : primarySubjects;

  const consultCurriculum = async () => {
    if (!course || !subject) { setNotice("Selecciona primero el curso y la asignatura."); return; }
    setLoadingCurriculum(true); setNotice(""); setCurriculum(null); setSelected([]);
    try { const response = await fetch("/api/curriculum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course, subject }) }); const body = await bodyOf(response); if (!response.ok) throw new Error(body.error); setCurriculum(body); setSelected(body.competencies.map((item: Competency) => item.code)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo consultar el currículo."); }
    finally { setLoadingCurriculum(false); }
  };

  const upload = async (jobId: string, file: File, category: string) => {
    const chunkSize = 768 * 1024; const total = Math.max(1, Math.ceil(file.size / chunkSize)); const uploadId = crypto.randomUUID();
    for (let index = 0; index < total; index++) { const form = new FormData(); form.append("category", category); form.append("uploadId", uploadId); form.append("chunkIndex", String(index)); form.append("chunkTotal", String(total)); form.append("originalName", file.name); form.append("originalType", file.type || "application/octet-stream"); form.append("totalSize", String(file.size)); form.append("files", file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)), `parte-${index}`); const response = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", body: form }); const body = await bodyOf(response); if (!response.ok) throw new Error(body.error || `No se pudo subir ${file.name}.`); }
  };

  const generate = async () => {
    const chosen = curriculum?.competencies.filter((item) => selected.includes(item.code)) || [];
    if (!course || !subject || !curriculum || !chosen.length) { setNotice("Consulta el currículo y selecciona al menos una competencia."); return; }
    setProcessing(true); setProgress(3); setNotice(""); setResult(null);
    try {
      const create = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "initial_assessment", studentName: studentName || "Grupo clase", currentCourse: course, targetCourse: course, subject, teacherName }) }); const created = await bodyOf(create); if (!create.ok) throw new Error(created.error);
      const curriculumFile = new File([`Fuente oficial: ${curriculum.sourceTitle}\n${curriculum.sourceUrl}\n\nCOMPETENCIAS SELECCIONADAS:\n${chosen.map((item) => `${item.code}. ${item.text}`).join("\n\n")}`], `curriculo-${course}-${subject}.txt`, { type: "text/plain" });
      const allFiles = [curriculumFile, ...files]; for (let index = 0; index < allFiles.length; index++) { await upload(created.job.id, allFiles[index], index === 0 ? "criterios" : "dictamen"); setProgress(8 + Math.round(((index + 1) / allFiles.length) * 42)); }
      setProgress(55);
      const notes = `Fuente curricular oficial verificada: ${curriculum.sourceTitle} (${curriculum.sourceUrl}). Competencias seleccionadas: ${chosen.map((item) => `${item.code}: ${item.text}`).join(" | ")}. ${files.length ? "Hay documentación individual: crea ajustes accesibles equivalentes y protege todos los datos sensibles." : "No se aporta documentación individual; crea una prueba común accesible para el grupo."} ${studentName ? `Aplicación individual para ${studentName}.` : "Aplicación para el grupo clase."}`;
      const generation = await fetch(`/api/jobs/${created.job.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }); const generated = await bodyOf(generation); if (!generation.ok) throw new Error(generated.error); setProgress(100); setResult({ id: created.job.id, text: generated.result }); setNotice("Evaluación inicial creada y guardada en Mi historial.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo crear la evaluación inicial."); }
    finally { setProcessing(false); }
  };

  return <section className="initial-assessment workspace"><div className="assessment-heading"><span className="section-kicker violet-ink">EVALUACIÓN INICIAL COMPETENCIAL</span><h1>Conoce el punto de partida de tu alumnado</h1><p>Selecciona curso y materia. La plataforma consulta las competencias específicas oficiales de Andalucía y prepara pruebas, observaciones y rúbricas listas para aplicar.</p></div><div className="assessment-layout"><div className="assessment-form">
    <section className="assessment-step"><span>01 · CURRÍCULO OFICIAL</span><h2>Curso y asignatura</h2><div className="assessment-fields"><label>Curso<select value={course} onChange={(event) => { setCourse(event.target.value); setSubject(""); setCurriculum(null); }}><option value="">Selecciona el curso</option>{courses.map((item) => <option key={item}>{item}</option>)}</select></label><label>Asignatura<select value={subject} disabled={!course} onChange={(event) => { setSubject(event.target.value); setCurriculum(null); }}><option value="">Selecciona la asignatura</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label></div><button type="button" className="assessment-consult" disabled={loadingCurriculum || !course || !subject} onClick={consultCurriculum}>{loadingCurriculum ? "Consultando normativa oficial…" : "Obtener competencias específicas"}</button>
    {curriculum && <div className="competency-picker"><header><div><strong>Competencias encontradas</strong><small>{curriculum.sourceTitle}</small></div><span>{selected.length} seleccionadas</span></header><div className="competency-actions"><button type="button" onClick={() => setSelected(curriculum.competencies.map((item) => item.code))}>Seleccionar todas</button><button type="button" onClick={() => setSelected([])}>Limpiar</button><a href={curriculum.sourceUrl} target="_blank" rel="noreferrer">Ver fuente oficial ↗</a></div>{curriculum.competencies.map((item) => <label key={item.code} className={selected.includes(item.code) ? "selected" : ""}><input type="checkbox" checked={selected.includes(item.code)} onChange={() => setSelected((current) => current.includes(item.code) ? current.filter((code) => code !== item.code) : [...current, item.code])} /><b>{item.code}</b><span>{item.text}</span></label>)}</div>}</section>
    <section className="assessment-step"><span>02 · APLICACIÓN</span><h2>Grupo o evaluación individual</h2><div className="assessment-fields"><label>Alumno o alumna <em>Opcional</em><input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Déjalo vacío para el grupo clase" /></label><label>Docente <em>Opcional</em><input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="Nombre del docente" /></label></div><div className={`assessment-upload ${files.length ? "has-files" : ""}`}><input ref={input} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => { setFiles([...files, ...Array.from(event.target.files || [])]); event.target.value = ""; }} /><div><b>Dictamen, informe, ACI o adaptación</b><p>Opcional. Se utilizará para ajustar el acceso, los apoyos y la forma de responder, sin mostrar datos sensibles.</p></div><button type="button" onClick={() => input.current?.click()}>Seleccionar archivos</button>{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Eliminar ${file.name}`} onClick={() => setFiles(files.filter((_, item) => item !== index))}>×</button></span>)}</div></section>
    {notice && <div className="success-note" role="status">{notice}</div>}<button type="button" className="primary assessment-generate" disabled={processing || !curriculum || !selected.length} onClick={generate}>{processing ? `Creando documento… ${progress}%` : "Generar pruebas y rúbricas ✦"}</button>
    {result && <section className="result-panel"><div><span>EVALUACIÓN GENERADA</span><h2>Documento listo</h2></div><div className="result-downloads audience-downloads"><div><strong>Documento completo</strong><span><a href={`/api/jobs/${result.id}/download?format=pdf&scope=all`}>PDF ↓</a><a href={`/api/jobs/${result.id}/download?format=docx&scope=all`}>Word ↓</a></span></div><div><strong>Cuaderno del alumnado</strong><span><a href={`/api/jobs/${result.id}/download?format=pdf&scope=student`}>PDF ↓</a><a href={`/api/jobs/${result.id}/download?format=docx&scope=student`}>Word ↓</a></span></div><div><strong>Guía y rúbricas</strong><span><a href={`/api/jobs/${result.id}/download?format=pdf&scope=teacher`}>PDF ↓</a><a href={`/api/jobs/${result.id}/download?format=docx&scope=teacher`}>Word ↓</a></span></div></div><pre>{result.text}</pre></section>}
  </div><aside className="assessment-output"><span>EL DOCUMENTO INCLUIRÁ</span><ol><li><b>01</b><div><strong>Pruebas flexibles</strong><p>Una competencia o varias en una misma tarea.</p></div></li><li><b>02</b><div><strong>Evidencias variadas</strong><p>Observación, diálogo, producción y desempeño práctico.</p></div></li><li><b>03</b><div><strong>Rúbricas descriptivas</strong><p>No conseguido, en proceso y conseguido.</p></div></li><li><b>04</b><div><strong>Decisiones pedagógicas</strong><p>Aprendizajes prioritarios, apoyos y metodología.</p></div></li></ol><blockquote>La evaluación inicial orienta la enseñanza; no etiqueta al alumnado ni se limita a un examen.</blockquote></aside></div></section>;
}
