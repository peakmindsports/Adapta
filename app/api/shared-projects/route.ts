import { ensureSchema, jsonError, ownerFrom, runtime } from "../_shared";

export async function GET(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request);
  const rows = await runtime().DB.prepare("SELECT id, title, kind, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year AS academicYear, teacher_name AS teacherName, owner_email AS ownerEmail, shared_at AS sharedAt FROM jobs WHERE shared_at IS NOT NULL AND status = 'completed' AND kind LIKE 'project%' ORDER BY shared_at DESC").all();
  return Response.json({ projects: rows.results.map((project) => ({ ...project, isMine: (project as { ownerEmail?: string }).ownerEmail === owner })) });
}

export async function POST(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request); const body = await request.json() as { projectId?: string };
  if (!body.projectId) return jsonError("Selecciona un proyecto.");
  const source = await runtime().DB.prepare("SELECT kind, title, current_course, target_course, subject, academic_year, teacher_name, result FROM jobs WHERE id = ? AND shared_at IS NOT NULL AND status = 'completed' AND kind LIKE 'project%'").bind(body.projectId).first<Record<string, string | null>>();
  if (!source?.result) return jsonError("Este proyecto ya no está compartido.", 404);
  const id = crypto.randomUUID(); const now = Date.now();
  await runtime().DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, current_course, target_course, subject, academic_year, teacher_name, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)").bind(id, owner, source.kind, `Copia · ${source.title}`, source.current_course, source.target_course, source.subject, source.academic_year, source.teacher_name, source.result, now, now).run();
  return Response.json({ job: { id, title: `Copia · ${source.title}`, status: "completed" } }, { status: 201 });
}
