import { ensureSchema, jsonError, ownerFrom, runtime } from "../_shared";

export async function GET(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request);
  const rows = await runtime().DB.prepare("SELECT jobs.id, jobs.title, jobs.kind, jobs.current_course AS currentCourse, jobs.target_course AS targetCourse, jobs.subject, jobs.academic_year AS academicYear, jobs.teacher_name AS teacherName, jobs.owner_email AS ownerEmail, jobs.shared_at AS sharedAt, CASE WHEN reads.project_id IS NULL THEN 0 ELSE 1 END AS isRead FROM jobs LEFT JOIN shared_project_reads AS reads ON reads.project_id = jobs.id AND reads.owner_email = ? WHERE jobs.shared_at IS NOT NULL AND jobs.status = 'completed' AND jobs.kind LIKE 'project%' ORDER BY jobs.shared_at DESC").bind(owner).all();
  return Response.json({ projects: rows.results.map((project) => ({ ...project, isMine: (project as { ownerEmail?: string }).ownerEmail === owner, isRead: Boolean((project as { isRead?: number }).isRead) })) });
}

export async function PATCH(request: Request) {
  await ensureSchema(); const owner = ownerFrom(request); const body = await request.json() as { projectId?: string };
  if (!body.projectId) return jsonError("Selecciona un proyecto.");
  const project = await runtime().DB.prepare("SELECT id FROM jobs WHERE id = ? AND owner_email <> ? AND shared_at IS NOT NULL AND status = 'completed' AND kind LIKE 'project%'").bind(body.projectId, owner).first();
  if (!project) return jsonError("Este proyecto compartido ya no está disponible.", 404);
  await runtime().DB.prepare("INSERT INTO shared_project_reads (owner_email, project_id, read_at) VALUES (?, ?, ?) ON CONFLICT(owner_email, project_id) DO UPDATE SET read_at = excluded.read_at").bind(owner, body.projectId, Date.now()).run();
  return Response.json({ read: true });
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
