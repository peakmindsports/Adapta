import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = await activeOwnerFrom(request); if (!owner) return authenticationError(); const body = await request.json() as { shared?: boolean };
  const job = await runtime().DB.prepare("SELECT kind, status FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ kind: string; status: string }>();
  if (!job) return jsonError("Recurso no encontrado.", 404);
  if (job.kind !== "adaptation" && !job.kind.startsWith("project")) return jsonError("Este tipo de recurso no se puede compartir.");
  if (job.status !== "completed") return jsonError("El recurso debe estar terminado antes de compartirlo.", 409);
  const sharedAt = body.shared ? Date.now() : null;
  await runtime().DB.prepare("UPDATE jobs SET shared_at = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(sharedAt, Date.now(), id, owner).run();
  return Response.json({ shared: Boolean(sharedAt), sharedAt });
}
