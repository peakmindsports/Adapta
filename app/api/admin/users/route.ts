import { ensureSchema, isSiteAdmin, jsonError, runtime, SITE_ADMIN_EMAIL } from "../../_shared";

export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar usuarios.", 403);
  const { DB } = runtime();
  const [users, setting] = await Promise.all([
    DB.prepare(`SELECT u.email, u.display_name AS displayName, u.blocked, u.first_seen_at AS firstSeenAt, u.last_seen_at AS lastSeenAt,
      COUNT(a.id) AS queries, COALESCE(SUM(a.input_tokens), 0) AS inputTokens, COALESCE(SUM(a.output_tokens), 0) AS outputTokens,
      COALESCE(SUM(a.estimated_cost_usd), 0) AS estimatedCostUsd
      FROM app_users u LEFT JOIN api_usage a ON a.owner_email = u.email
      WHERE u.deleted = 0 GROUP BY u.email ORDER BY estimatedCostUsd DESC, COALESCE(NULLIF(TRIM(u.display_name), ''), u.email) COLLATE NOCASE ASC, u.email COLLATE NOCASE ASC`).all(),
    DB.prepare("SELECT model FROM user_settings WHERE owner_email = 'site-public-visibility'").first<{ model: string }>(),
  ]);
  return Response.json({ users: users.results, publicEnabled: setting?.model !== "disabled", currency: "USD" });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede cambiar permisos.", 403);
  const body = await request.json() as { email?: string; blocked?: boolean; publicEnabled?: boolean };
  const { DB } = runtime();
  if (typeof body.publicEnabled === "boolean") {
    await DB.prepare("INSERT INTO user_settings (owner_email, model, updated_at) VALUES ('site-public-visibility', ?, ?) ON CONFLICT(owner_email) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at")
      .bind(body.publicEnabled ? "enabled" : "disabled", Date.now()).run();
    return Response.json({ publicEnabled: body.publicEnabled });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || typeof body.blocked !== "boolean") return jsonError("Petición no válida.");
  if (email === SITE_ADMIN_EMAIL) return jsonError("La cuenta administradora no puede bloquearse.");
  await DB.prepare("UPDATE app_users SET blocked = ? WHERE email = ?").bind(body.blocked ? 1 : 0, email).run();
  return Response.json({ email, blocked: body.blocked });
}
export async function DELETE(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede eliminar usuarios.", 403);
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return jsonError("Falta el correo de la cuenta.");
  if (email === SITE_ADMIN_EMAIL) return jsonError("La cuenta administradora no puede eliminarse.");
  const { DB } = runtime();
  await DB.batch([
    DB.prepare("UPDATE app_users SET blocked = 1, deleted = 1 WHERE email = ?").bind(email),
    DB.prepare("DELETE FROM api_usage WHERE owner_email = ?").bind(email),
    DB.prepare("DELETE FROM daily_usage WHERE owner_email = ?").bind(email),
  ]);
  return Response.json({ deleted: true, email });
}