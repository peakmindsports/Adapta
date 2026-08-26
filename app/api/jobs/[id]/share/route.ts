import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await context.params;
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const body = await request.json() as { shared?: boolean; recipients?: string[] };
  const { DB } = runtime();
  const job = await DB.prepare("SELECT kind, status FROM jobs WHERE id = ? AND owner_email = ?").bind(id, owner).first<{ kind: string; status: string }>();
  if (!job) return jsonError("Recurso no encontrado.", 404);
  if (job.kind !== "adaptation" && job.kind !== "reinforcement" && !job.kind.startsWith("project")) return jsonError("Este tipo de recurso no se puede compartir.");
  if (job.status !== "completed") return jsonError("El recurso debe estar terminado antes de compartirlo.", 409);

  if (!body.shared) {
    await DB.batch([
      DB.prepare("DELETE FROM shared_resource_recipients WHERE job_id = ? AND owner_email = ?").bind(id, owner),
      DB.prepare("UPDATE jobs SET shared_at = NULL, updated_at = ? WHERE id = ? AND owner_email = ?").bind(Date.now(), id, owner),
    ]);
    return Response.json({ shared: false, sharedAt: null, recipients: [] });
  }

  const recipients = [...new Set((body.recipients || []).map((email) => email.trim().toLowerCase()).filter(Boolean))].filter((email) => email !== owner);
  if (!recipients.length) return jsonError("Indica al menos un correo destinatario.");
  if (recipients.length > 20) return jsonError("Puedes compartir un recurso con un máximo de 20 personas.");
  if (recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return jsonError("Revisa los correos destinatarios.");

  const placeholders = recipients.map(() => "?").join(",");
  const registered = await DB.prepare(`SELECT email FROM app_users WHERE email IN (${placeholders}) AND blocked = 0 AND deleted = 0`).bind(...recipients).all<{ email: string }>();
  const allowed = new Set(registered.results.map((item) => item.email));
  const missing = recipients.filter((email) => !allowed.has(email));
  if (missing.length) return jsonError("Estas personas todavía no han iniciado sesión en Adapta o no tienen acceso activo: " + missing.join(", "));

  const now = Date.now();
  await DB.batch([
    DB.prepare("DELETE FROM shared_resource_recipients WHERE job_id = ? AND owner_email = ?").bind(id, owner),
    ...recipients.map((email) => DB.prepare("INSERT INTO shared_resource_recipients (job_id, owner_email, recipient_email, created_at) VALUES (?, ?, ?, ?)").bind(id, owner, email, now)),
    DB.prepare("UPDATE jobs SET shared_at = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(now, now, id, owner),
  ]);
  return Response.json({ shared: true, sharedAt: now, recipients });
}
