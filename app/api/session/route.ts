import { ensureSchema, isSiteAdmin, ownerFrom, runtime } from "../_shared";
import { readVisibilitySettings } from "../_visibility";

function fullNameFrom(request: Request) {
  const value = request.headers.get("oai-authenticated-user-full-name");
  if (!value || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function GET(request: Request) {
  await ensureSchema();
  const email = ownerFrom(request);
  const admin = isSiteAdmin(request);
  const displayName = fullNameFrom(request) || email;
  const { DB } = runtime();
  let blocked = false;
  if (email) {
    const now = Date.now();
    await DB.prepare("INSERT INTO app_users (email, display_name, blocked, first_seen_at, last_seen_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = COALESCE(excluded.display_name, app_users.display_name), last_seen_at = excluded.last_seen_at")
      .bind(email, displayName, now, now).run();
    const user = await DB.prepare("SELECT blocked, deleted FROM app_users WHERE email = ?").bind(email).first<{ blocked: number; deleted: number }>();
    blocked = !admin && Boolean(user?.blocked || user?.deleted);
  }
  const visibility = await DB.prepare("SELECT model FROM user_settings WHERE owner_email = 'site-public-visibility'").first<{ model: string }>();
  const publicEnabled = visibility?.model !== "disabled";
  const { featureVisibility, courseVisibility } = await readVisibilitySettings();
  return Response.json({ authenticated: Boolean(email) && !blocked, identified: Boolean(email), blocked, isAdmin: admin, email, displayName, publicEnabled, featureVisibility, courseVisibility });
}
