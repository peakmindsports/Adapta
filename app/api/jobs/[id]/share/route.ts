import { ensureSchema, jsonError, ownerFrom, runtime } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request); const body = await request.json() as { shared?: boolean };
  const job = await runtime().DB.prepare("SELECT kind, status FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ kind: string; status: string }>();
  if (!job) return jsonError("Proyecto no encontrado.", 404);
  if (!job.kind.startsWith("project")) return jsonError("Solo pueden compartirse proyectos interdisciplinares.");
  if (job.status !== "completed") return jsonError("El proyecto debe estar terminado antes de compartirlo.", 409);
  const sharedAt = body.shared ? Date.now() : null;
  await runtime().DB.prepare("UPDATE jobs SET shared_at = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(sharedAt, Date.now(), id, owner).run();
  return Response.json({ shared: Boolean(sharedAt), sharedAt });
}
