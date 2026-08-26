import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime } from "../_shared";

function sharedTitle(resource: Record<string, any>) {
  if (resource.kind !== "adaptation" && resource.kind !== "reinforcement") return resource.title;
  const route = resource.kind === "reinforcement" ? resource.currentCourse : resource.currentCourse && resource.targetCourse ? resource.currentCourse + " → " + resource.targetCourse : resource.currentCourse || resource.targetCourse;
  return [resource.kind === "reinforcement" ? "PRA compartido" : "Adaptación compartida", resource.subject, route].filter(Boolean).join(" · ");
}

function redactStudentNames(result: string, studentNames: string) {
  const names = studentNames.split(/\s*(?:,|;|·|\sy\s)\s*/i).filter(Boolean);
  return names.reduce((text, fullName) => {
    const variants = [fullName.trim(), fullName.trim().split(/\s+/)[0]].filter((name) => name.length >= 3);
    return variants.reduce((value, name) => value.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "Alumnado"), text);
  }, result);
}

export async function GET(request: Request) {
  await ensureSchema(); const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const rows = await runtime().DB.prepare("SELECT jobs.id, jobs.title, jobs.kind, jobs.current_course AS currentCourse, jobs.target_course AS targetCourse, jobs.subject, jobs.academic_year AS academicYear, jobs.teacher_name AS teacherName, jobs.owner_email AS ownerEmail, jobs.shared_at AS sharedAt, GROUP_CONCAT(DISTINCT recipients.recipient_email) AS recipientEmails, CASE WHEN reads.project_id IS NULL THEN 0 ELSE 1 END AS isRead FROM jobs JOIN shared_resource_recipients AS recipients ON recipients.job_id = jobs.id LEFT JOIN shared_project_reads AS reads ON reads.project_id = jobs.id AND reads.owner_email = ? WHERE jobs.shared_at IS NOT NULL AND jobs.status = 'completed' AND (jobs.owner_email = ? OR recipients.recipient_email = ?) GROUP BY jobs.id ORDER BY jobs.shared_at DESC").bind(owner, owner, owner).all();
  return Response.json({ projects: rows.results.map((resource: any) => ({ ...resource, title: sharedTitle(resource), recipientEmails: resource.ownerEmail === owner ? String(resource.recipientEmails || "").split(",").filter(Boolean) : [], isMine: resource.ownerEmail === owner, isRead: Boolean(resource.isRead) })) });
}

export async function PATCH(request: Request) {
  await ensureSchema(); const owner = await activeOwnerFrom(request); if (!owner) return authenticationError(); const body = await request.json() as { projectId?: string };
  if (!body.projectId) return jsonError("Selecciona un recurso.");
  const resource = await runtime().DB.prepare("SELECT jobs.id FROM jobs JOIN shared_resource_recipients AS recipients ON recipients.job_id = jobs.id WHERE jobs.id = ? AND jobs.owner_email <> ? AND recipients.recipient_email = ? AND jobs.shared_at IS NOT NULL AND jobs.status = 'completed'").bind(body.projectId, owner, owner).first();
  if (!resource) return jsonError("Este recurso compartido ya no está disponible.", 404);
  await runtime().DB.prepare("INSERT INTO shared_project_reads (owner_email, project_id, read_at) VALUES (?, ?, ?) ON CONFLICT(owner_email, project_id) DO UPDATE SET read_at = excluded.read_at").bind(owner, body.projectId, Date.now()).run();
  return Response.json({ read: true });
}

export async function POST(request: Request) {
  await ensureSchema(); const owner = await activeOwnerFrom(request); if (!owner) return authenticationError(); const body = await request.json() as { projectId?: string };
  if (!body.projectId) return jsonError("Selecciona un recurso.");
  const source = await runtime().DB.prepare("SELECT kind, title, student_name, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year, teacher_name, result FROM jobs JOIN shared_resource_recipients AS recipients ON recipients.job_id = jobs.id WHERE jobs.id = ? AND recipients.recipient_email = ? AND jobs.shared_at IS NOT NULL AND jobs.status = 'completed'").bind(body.projectId, owner).first<Record<string, any>>();
  if (!source?.result) return jsonError("Este recurso ya no está compartido.", 404);
  const id = crypto.randomUUID(); const now = Date.now();
  const title = sharedTitle(source);
  const safeResult = (source.kind === "adaptation" || source.kind === "reinforcement") && source.student_name ? redactStudentNames(String(source.result), String(source.student_name)) : source.result;
  await runtime().DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, current_course, target_course, subject, academic_year, teacher_name, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)").bind(id, owner, source.kind, `Copia · ${title}`, source.currentCourse, source.targetCourse, source.subject, source.academic_year, source.teacher_name, safeResult, now, now).run();
  return Response.json({ job: { id, title: `Copia · ${title}`, status: "completed" } }, { status: 201 });
}
