import { ensureSchema, jsonError, ownerFrom, runtime } from "../_shared";

export async function GET(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request);
  const rows = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year AS academicYear, teacher_name AS teacherName, status, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE owner_email = ? ORDER BY created_at DESC").bind(owner).all();
  return Response.json({ jobs: rows.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request);
  const body = await request.json() as Record<string, string>;
  if (!body.kind || !["adaptation", "project"].includes(body.kind)) return jsonError("Tipo de trabajo no válido.");
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = body.kind === "adaptation" ? `Adaptación · ${body.studentName || "Sin nombre"}` : `Proyecto · ${body.theme || body.currentCourse || "Sin título"}`;
  const subject = body.kind === "project" ? "Interdisciplinar" : body.subject || null;
  await runtime().DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, student_name, current_course, target_course, subject, academic_year, teacher_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(id, owner, body.kind, title, body.studentName || null, body.currentCourse || null, body.targetCourse || null, subject, body.academicYear || null, body.teacherName || null, now, now).run();
  return Response.json({ job: { id, title, status: "draft" } }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request); const { DB, FILES } = runtime();
  const generating = await DB.prepare("SELECT COUNT(*) AS total FROM jobs WHERE owner_email = ? AND status = 'generating'").bind(owner).first<{ total: number }>();
  if ((generating?.total || 0) > 0) return jsonError("Espera a que terminen los trabajos que se están generando antes de vaciar el historial.", 409);
  const files = await DB.prepare("SELECT DISTINCT storage_key FROM job_files WHERE owner_email = ?").bind(owner).all<{ storage_key: string }>();
  try {
    for (const file of files.results) {
      const otherReferences = await DB.prepare("SELECT COUNT(*) AS total FROM job_files WHERE storage_key = ? AND owner_email <> ?").bind(file.storage_key, owner).first<{ total: number }>();
      if ((otherReferences?.total || 0) > 0) continue;
      if (file.storage_key.startsWith("chunks:")) { let cursor: string | undefined; do { const listed = await FILES.list({ prefix: file.storage_key.slice(7), cursor }); if (listed.objects.length) await FILES.delete(listed.objects.map((object) => object.key)); cursor = listed.truncated ? listed.cursor : undefined; } while (cursor); }
      else await FILES.delete(file.storage_key);
    }
    await DB.batch([DB.prepare("DELETE FROM job_files WHERE owner_email = ?").bind(owner), DB.prepare("DELETE FROM jobs WHERE owner_email = ?").bind(owner)]);
    return Response.json({ deleted: true });
  } catch { return jsonError("No se pudo vaciar completamente el historial. Inténtalo de nuevo.", 500); }
}
