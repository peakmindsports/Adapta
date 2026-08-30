"use client";
import { useRef, useState } from "react";
type C = {
  code: string;
  text: string;
};
type Cur = {
  subject: string;
  sourceTitle: string;
  sourceUrl: string;
  competencies: C[];
};
type Res = {
  id: string;
  subject: string;
};
const courses = [
  "3 años de Infantil",
  "4 años de Infantil",
  "5 años de Infantil",
  "1º de Primaria",
  "2º de Primaria",
  "3º de Primaria",
  "4º de Primaria",
  "5º de Primaria",
  "6º de Primaria",
  "1º de ESO",
  "2º de ESO",
  "3º de ESO",
  "4º de ESO",
];
const primary = [
  "Lengua Castellana y Literatura",
  "Matemáticas",
  "Conocimiento del Medio Natural, Social y Cultural",
  "Primera Lengua Extranjera",
  "Educación Artística",
  "Educación Física",
];
const infant = [
  "Crecimiento en Armonía",
  "Descubrimiento y Exploración del Entorno",
  "Comunicación y Representación de la Realidad",
];
const secondary = [
  "Lengua Castellana y Literatura",
  "Matemáticas",
  "Primera Lengua Extranjera",
  "Geografía e Historia",
  "Biología y Geología",
  "Física y Química",
  "Tecnología y Digitalización",
  "Educación Física",
  "Música",
  "Educación Plástica, Visual y Audiovisual",
  "Educación en Valores Cívicos y Éticos",
];
async function body(r: Response) {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { error: t || "Respuesta no válida." };
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export default function InitialAssessment() {
  const support = useRef<HTMLInputElement>(null),
    reportInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"create" | "report">("create"),
    [course, setCourse] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [curricula, setCurricula] = useState<Cur[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [student, setStudent] = useState(""),
    [teacher, setTeacher] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [label, setLabel] = useState(""),
    [notice, setNotice] = useState(""),
    [results, setResults] = useState<Res[]>([]),
    [report, setReport] = useState<any>(null);
  const subjects = course.includes("Infantil")
    ? infant
    : course.includes("ESO")
      ? secondary
      : course.startsWith("6º")
        ? [...primary, "Educación en Valores Cívicos y Éticos"]
        : primary;
  const toggle = (s: string) => {
    setChosen((x) => (x.includes(s) ? x.filter((v) => v !== s) : [...x, s]));
    setCurricula([]);
    setProgress(0);
    setLabel("");
  };
  async function consult() {
    if (!course || !chosen.length)
      return setNotice("Selecciona el curso y al menos una asignatura.");
    setBusy(true);
    setNotice("");
    setCurricula([]);
    setProgress(1);
    const found: Cur[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        setLabel(`Consultando ${chosen[i]}`);
        const start = Math.round((i / chosen.length) * 100);
        const end = Math.round(((i + 1) / chosen.length) * 100);
        const step = Math.max(1, Math.ceil((end - start) / 18));
        const timer = window.setInterval(
          () => setProgress((value) => Math.min(end - 2, value + step)),
          650,
        );
        setProgress(Math.max(1, start));
        let r: Response;
        try {
          r = await fetch("/api/curriculum-v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ course, subject: chosen[i] }),
          });
        } finally {
          window.clearInterval(timer);
        }
        const b = await body(r);
        if (!r.ok) throw new Error(b.error);
        found.push({ ...b, subject: chosen[i] });
        setCurricula([...found]);
        setProgress(Math.round(((i + 1) / chosen.length) * 100));
        if (i + 1 < chosen.length) await wait(900);
      }
      setNotice(
        `${found.length} currículo${found.length === 1 ? "" : "s"} preparado${found.length === 1 ? "" : "s"}.`,
      );
      setLabel("Competencias preparadas");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se pudo consultar el currículo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(id: string, file: File, category: string) {
    const size = 768 * 1024,
      total = Math.max(1, Math.ceil(file.size / size)),
      uploadId = crypto.randomUUID();
    for (let i = 0; i < total; i++) {
      const f = new FormData();
      Object.entries({
        category,
        uploadId,
        chunkIndex: String(i),
        chunkTotal: String(total),
        originalName: file.name,
        originalType: file.type || "application/octet-stream",
        totalSize: String(file.size),
      }).forEach(([k, v]) => f.append(k, v));
      f.append(
        "files",
        file.slice(i * size, Math.min(file.size, (i + 1) * size)),
        `parte-${i}`,
      );
      const r = await fetch(`/api/jobs/${id}/files`, {
          method: "POST",
          body: f,
        }),
        b = await body(r);
      if (!r.ok) throw new Error(b.error);
    }
  }
  async function generate() {
    if (curricula.length !== chosen.length)
      return setNotice(
        "Obtén primero las competencias de todas las asignaturas elegidas.",
      );
    setBusy(true);
    setResults([]);
    setNotice("");
    const made: Res[] = [];
    try {
      for (let i = 0; i < curricula.length; i++) {
        const c = curricula[i];
        setLabel(`Creando ${c.subject}`);
        setProgress(Math.round((i / curricula.length) * 100));
        const cr = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "initial_assessment",
              studentName: student || "Grupo clase",
              currentCourse: course,
              targetCourse: course,
              subject: c.subject,
              teacherName: teacher,
            }),
          }),
          created = await body(cr);
        if (!cr.ok) throw new Error(created.error);
        const cf = new File(
          [
            `Fuente oficial: ${c.sourceTitle}\n${c.sourceUrl}\n\nCOMPETENCIAS:\n${c.competencies.map((x) => `${x.code}. ${x.text}`).join("\n\n")}`,
          ],
          `curriculo-${c.subject}.txt`,
          { type: "text/plain" },
        );
        await upload(created.job.id, cf, "criterios");
        for (const file of files)
          await upload(created.job.id, file, "dictamen");
        const notes = `Evaluación independiente de ${c.subject}. Incluye todas las competencias, pruebas y rúbricas con No adquirido, En proceso y Adquirido. ${files.length ? "Aplica ajustes equivalentes a partir de la documentación individual." : "Prueba común para el grupo."}\n\nCOMPETENCIAS ESPECÍFICAS OFICIALES YA DISPONIBLES (no solicites archivos ni información adicional):\n${c.competencies.map((competency) => `${competency.code}. ${competency.text}`).join("\n\n")}`;
        const gr = await fetch(`/api/jobs/${created.job.id}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
          }),
          generated = await body(gr);
        if (!gr.ok) throw new Error(generated.error);
        made.push({ id: created.job.id, subject: c.subject });
        setResults([...made]);
        setProgress(Math.round(((i + 1) / curricula.length) * 100));
        if (i + 1 < curricula.length) await wait(1200);
      }
      setNotice(
        `${made.length} evaluación${made.length === 1 ? "" : "es"} creada${made.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "No se pudieron crear las evaluaciones.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function excel() {
    const r = await fetch("/api/initial-assessment-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "template", course, curricula }),
    });
    if (!r.ok) return setNotice((await body(r)).error);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `Registro-evaluacion-inicial-${course}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function analyze(file: File) {
    setBusy(true);
    setLabel("Analizando el registro");
    setProgress(25);
    setReport(null);
    try {
      const f = new FormData();
      f.append("file", file);
      const r = await fetch("/api/initial-assessment-excel", {
          method: "POST",
          body: f,
        }),
        b = await body(r);
      if (!r.ok) throw new Error(b.error);
      setProgress(100);
      setReport(b);
      setNotice("Informe de evaluación inicial preparado.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "No se pudo analizar el Excel.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="initial-assessment workspace">
      <div className="assessment-heading">
        <span className="section-kicker violet-ink">
          EVALUACIÓN INICIAL COMPETENCIAL
        </span>
        <h1>Conoce el punto de partida de tu alumnado</h1>
        <p>
          Crea una evaluación para una asignatura, varias o todas. Cada materia
          se procesa de forma independiente.
        </p>
        <div className="assessment-mode">
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            Crear evaluación inicial
          </button>
          <button
            className={mode === "report" ? "active" : ""}
            onClick={() => setMode("report")}
          >
            Informe de Evaluación inicial
          </button>
        </div>
      </div>
      {mode === "create" ? (
        <div className="assessment-layout">
          <div className="assessment-form">
            <section className="assessment-step">
              <span>01 · CURRÍCULO OFICIAL</span>
              <h2>Curso y asignaturas</h2>
              <div className="assessment-fields single">
                <label>
                  Curso
                  <select
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      setChosen([]);
                      setCurricula([]);
                      setProgress(0);
                      setLabel("");
                    }}
                  >
                    <option value="">Selecciona el curso</option>
                    {courses.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="subject-selector">
                <header>
                  <strong>Elige una, varias o todas</strong>
                  <button
                    disabled={!course}
                    onClick={() => {
                      setChosen(subjects);
                      setCurricula([]);
                    }}
                  >
                    Seleccionar todas
                  </button>
                </header>
                {subjects.map((x, i) => (
                  <label
                    key={x}
                    style={
                      {
                        "--subject-color": [
                          "#e05a47",
                          "#27889a",
                          "#7651a8",
                          "#d49a28",
                          "#2d806c",
                          "#c05d86",
                          "#6474b8",
                        ][i % 7],
                      } as React.CSSProperties
                    }
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(x)}
                      onChange={() => toggle(x)}
                    />
                    <span>{x}</span>
                  </label>
                ))}
              </div>
              <button
                className="assessment-consult"
                disabled={busy || !course || !chosen.length}
                onClick={consult}
              >
                Obtener competencias específicas
              </button>
              {(busy || progress > 0) && <Progress label={label} value={progress} />}
              {curricula.map((c) => (
                <details className="curriculum-summary" key={c.subject}>
                  <summary>
                    {c.subject}
                    <span>{c.competencies.length} competencias</span>
                  </summary>
                  {c.competencies.map((x) => (
                    <p key={x.code}>
                      <b>{x.code}</b>
                      {x.text}
                    </p>
                  ))}
                </details>
              ))}
              <div
                className={`excel-ready ${curricula.length > 0 && curricula.length === chosen.length ? "" : "is-disabled"}`}
              >
                <div>
                  <strong>
                    {curricula.length > 0 && curricula.length === chosen.length
                      ? "Excel listo para cumplimentar"
                      : "Excel de registro de la evaluación inicial"}
                  </strong>
                  <p>
                    {curricula.length > 0 && curricula.length === chosen.length
                      ? "Añade el alumnado en la columna A y selecciona el nivel alcanzado en cada competencia."
                      : "Selecciona curso y asignaturas y pulsa Obtener competencias específicas. Entonces podrás descargar aquí el Excel."}
                  </p>
                </div>
                <button
                  type="button"
                  className="excel-download"
                  disabled={
                    busy ||
                    !curricula.length ||
                    curricula.length !== chosen.length
                  }
                  onClick={excel}
                >
                  Descargar Excel inicial
                </button>
              </div>
            </section>
            <section className="assessment-step">
              <span>02 · APLICACIÓN</span>
              <h2>Grupo o evaluación individual</h2>
              <div className="assessment-fields">
                <label>
                  Alumno o alumna <em>Opcional</em>
                  <input
                    value={student}
                    onChange={(e) => setStudent(e.target.value)}
                    placeholder="Vacío para el grupo clase"
                  />
                </label>
                <label>
                  Docente <em>Opcional</em>
                  <input
                    value={teacher}
                    onChange={(e) => setTeacher(e.target.value)}
                    placeholder="Nombre del docente"
                  />
                </label>
              </div>
              <div className="assessment-upload">
                <input
                  ref={support}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) =>
                    setFiles([...files, ...Array.from(e.target.files || [])])
                  }
                />
                <div>
                  <b>Dictamen, informe, ACI o adaptación</b>
                  <p>Opcional para ajustar el acceso y los apoyos.</p>
                </div>
                <button onClick={() => support.current?.click()}>
                  Seleccionar archivos
                </button>
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`}>
                    {f.name}
                    <button
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </section>
            {notice && <div className="success-note">{notice}</div>}
            <button
              className="primary assessment-generate"
              disabled={busy || curricula.length !== chosen.length}
              onClick={generate}
            >
              {busy
                ? `${label} · ${progress}%`
                : `Generar ${chosen.length || ""} prueba${chosen.length === 1 ? "" : "s"} y rúbricas ✦`}
            </button>
            {results.length > 0 && (
              <section className="result-panel">
                <h2>Documentos listos</h2>
                {results.map((r) => (
                  <div className="multi-result" key={r.id}>
                    <strong>{r.subject}</strong>
                    <span>
                      <a
                        href={`/api/jobs/${r.id}/download?format=pdf&scope=all`}
                      >
                        PDF
                      </a>
                      <a
                        href={`/api/jobs/${r.id}/download?format=docx&scope=all`}
                      >
                        Word
                      </a>
                    </span>
                  </div>
                ))}
                <button className="excel-download" onClick={excel}>
                  Descargar Excel de registro competencial
                </button>
              </section>
            )}
          </div>
          <aside className="assessment-output">
            <span>GENERACIÓN POR LOTES</span>
            <ol>
              <li>
                <b>01</b>
                <div>
                  <strong>Una o varias materias</strong>
                  <p>Selecciona una, varias o todas.</p>
                </div>
              </li>
              <li>
                <b>02</b>
                <div>
                  <strong>Proceso seguro</strong>
                  <p>Cada asignatura se genera por separado.</p>
                </div>
              </li>
              <li>
                <b>03</b>
                <div>
                  <strong>Registro Excel</strong>
                  <p>Alumnado en A y desplegables por competencia.</p>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      ) : (
        <section className="assessment-report">
          <input
            ref={reportInput}
            type="file"
            accept=".xlsx"
            onChange={(e) => e.target.files?.[0] && analyze(e.target.files[0])}
          />
          <div>
            <span>INFORME DEL GRUPO</span>
            <h2>Sube el Excel cumplimentado</h2>
            <p>
              Calcularemos porcentajes y propuestas de mejora por asignatura.
            </p>
            <button
              onClick={() => reportInput.current?.click()}
              disabled={busy}
            >
              {busy
                ? `${label} · ${progress}%`
                : "Seleccionar Excel cumplimentado"}
            </button>
          </div>
          {notice && <div className="success-note">{notice}</div>}
          {report && (
            <div className="report-results">
              <header>
                <h2>Resultado de la evaluación inicial</h2>
                <strong>{report.students} estudiantes</strong>
              </header>
              {report.subjects.map((s: any) => (
                <article key={s.subject}>
                  <h3>{s.subject}</h3>
                  <div className="report-bars">
                    <span style={{ width: `${Math.max(s.acquired, 12)}%` }}>
                      Adquirido {s.acquired}%
                    </span>
                    <span style={{ width: `${Math.max(s.inProgress, 12)}%` }}>
                      En proceso {s.inProgress}%
                    </span>
                    <span style={{ width: `${Math.max(s.notAcquired, 12)}%` }}>
                      No adquirido {s.notAcquired}%
                    </span>
                  </div>
                  <p>
                    <b>Propuesta de mejora:</b> {s.proposal}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="curriculum-progress">
      <span>{label}</span>
      <strong>{value}%</strong>
      <i>
        <b style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}
