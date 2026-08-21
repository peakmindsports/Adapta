import { ensureSchema, jsonError, ownerFrom, runtime } from "../../_shared";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year AS academicYear, teacher_name AS teacherName, status, result, error, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first();
  if (!job) return jsonError("Trabajo no encontrado.", 404); return Response.json({ job });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request); const { DB, FILES } = runtime();
  const job = await DB.prepare("SELECT status FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ status: string }>();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  if (job.status === "generating") return jsonError("Espera a que termine la generación antes de eliminar este trabajo.", 409);
  const rows = await DB.prepare("SELECT DISTINCT storage_key FROM job_files WHERE job_id = ? AND owner_email = ?").bind(id, owner).all<{ storage_key: string }>();
  try {
    for (const row of rows.results) {
      const references = await DB.prepare("SELECT COUNT(*) AS total FROM job_files WHERE storage_key = ? AND job_id <> ?").bind(row.storage_key, id).first<{ total: number }>(); if ((references?.total || 0) > 0) continue;
      if (row.storage_key.startsWith("chunks:")) { let cursor: string | undefined; do { const listed = await FILES.list({ prefix: row.storage_key.slice(7), cursor }); if (listed.objects.length) await FILES.delete(listed.objects.map((object) => object.key)); cursor = listed.truncated ? listed.cursor : undefined; } while (cursor); }
      else await FILES.delete(row.storage_key);
    }
    await DB.batch([DB.prepare("DELETE FROM job_files WHERE job_id = ? AND owner_email = ?").bind(id, owner), DB.prepare("DELETE FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner)]);
    return Response.json({ deleted: true });
  } catch { return jsonError("No se pudo eliminar completamente el trabajo. Inténtalo de nuevo.", 500); }
}
