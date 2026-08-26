import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime } from "../../_shared";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const job = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, subject, academic_year AS academicYear, teacher_name AS teacherName, status, result, error, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first();
  if (!job) return jsonError("Trabajo no encontrado.", 404); return Response.json({ job });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = await activeOwnerFrom(request); if (!owner) return authenticationError(); const { DB, FILES } = runtime();
  const job = await DB.prepare("SELECT status FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ status: string }>();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  const rows = await DB.prepare("SELECT DISTINCT storage_key FROM job_files WHERE job_id = ? AND owner_email = ?").bind(id, owner).all<{ storage_key: string }>();
  try {
    await DB.batch([DB.prepare("DELETE FROM job_files WHERE job_id = ? AND owner_email = ?").bind(id, owner), DB.prepare("DELETE FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner)]);
    const cleanup = Promise.allSettled(rows.results.map(async (row) => {
      const references = await DB.prepare("SELECT COUNT(*) AS total FROM job_files WHERE storage_key = ?").bind(row.storage_key).first<{ total: number }>();
      if ((references?.total || 0) > 0) return;
      if (row.storage_key.startsWith("chunks:")) { let cursor: string | undefined; do { const listed = await FILES.list({ prefix: row.storage_key.slice(7), cursor }); if (listed.objects.length) await FILES.delete(listed.objects.map((object) => object.key)); cursor = listed.truncated ? listed.cursor : undefined; } while (cursor); }
      else await FILES.delete(row.storage_key);
    }));
    await Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 3000))]);
    return Response.json({ deleted: true });
  } catch { return jsonError("No se pudo eliminar completamente el trabajo. Inténtalo de nuevo.", 500); }
}
