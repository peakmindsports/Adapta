import { ensureSchema, jsonError, ownerFrom, runtime } from "../../_shared";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, status, result, error, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first();
  if (!job) return jsonError("Trabajo no encontrado.", 404); return Response.json({ job });
}
