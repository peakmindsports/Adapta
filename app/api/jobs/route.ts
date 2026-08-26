import { authenticationError, ensureSchema, jsonError, ownerFrom, runtime } from "../_shared";

export async function GET(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request); if (!owner) return authenticationError();
  const rows = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year AS academicYear, teacher_name AS teacherName, status, shared_at AS sharedAt, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE owner_email = ? ORDER BY created_at DESC").bind(owner).all();
  return Response.json({ jobs: rows.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request); if (!owner) return authenticationError();
  const body = await request.json() as Record<string, string>;
  if (!body.kind || !["adaptation", "project", "project_adaptation"].includes(body.kind)) return jsonError("Tipo de trabajo no válido.");
  const id = crypto.randomUUID();
  const now = Date.now();
  let title = body.kind === "adaptation" ? `Adaptación · ${body.studentName || "Sin nombre"}` : `Proyecto · ${body.theme || body.currentCourse || "Sin título"}`;
  if (body.kind === "project_adaptation") title = "Proyecto adaptado · " + (body.theme || body.currentCourse || "Sin título") + " · " + (body.studentName || body.targetCourse || "Nivel personalizado");
  const subject = body.kind.startsWith("project") ? "Interdisciplinar" : body.subject || null;
  await runtime().DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, student_name, current_course, target_course, subject, academic_year, teacher_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(id, owner, body.kind, title, body.studentName || null, body.currentCourse || null, body.targetCourse || null, subject, body.academicYear || null, body.teacherName || null, now, now).run();
  return Response.json({ job: { id, title, status: "draft" } }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request); if (!owner) return authenticationError(); const { DB, FILES } = runtime();
  const files = await DB.prepare("SELECT DISTINCT storage_key FROM job_files WHERE owner_email = ?").bind(owner).all<{ storage_key: string }>();
  try {
    await DB.batch([DB.prepare("DELETE FROM job_files WHERE owner_email = ?").bind(owner), DB.prepare("DELETE FROM jobs WHERE owner_email = ?").bind(owner)]);
    const cleanup = Promise.allSettled(files.results.map(async (file) => {
      const otherReferences = await DB.prepare("SELECT COUNT(*) AS total FROM job_files WHERE storage_key = ?").bind(file.storage_key).first<{ total: number }>();
      if ((otherReferences?.total || 0) > 0) return;
      if (file.storage_key.startsWith("chunks:")) { let cursor: string | undefined; do { const listed = await FILES.list({ prefix: file.storage_key.slice(7), cursor }); if (listed.objects.length) await FILES.delete(listed.objects.map((object) => object.key)); cursor = listed.truncated ? listed.cursor : undefined; } while (cursor); }
      else await FILES.delete(file.storage_key);
    }));
    await Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 3000))]);
    return Response.json({ deleted: true });
  } catch { return jsonError("No se pudo vaciar completamente el historial. Inténtalo de nuevo.", 500); }
}
