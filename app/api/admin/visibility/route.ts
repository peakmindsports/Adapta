import { ensureSchema, isSiteAdmin, jsonError, runtime } from "../../_shared";
import { featureKeys, FeatureKey, readFeatureVisibility } from "../../_visibility";


export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar la visibilidad.", 403);
  return Response.json({ featureVisibility: await readFeatureVisibility() });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede cambiar la visibilidad.", 403);
  const body = await request.json() as { key?: string; visible?: boolean };
  if (!featureKeys.includes(body.key as FeatureKey) || typeof body.visible !== "boolean") return jsonError("Opción de visibilidad no válida.");
  const next = { ...(await readFeatureVisibility()), [body.key as FeatureKey]: body.visible };
  await runtime().DB.prepare("INSERT INTO user_settings (owner_email, model, updated_at) VALUES ('site-feature-visibility', ?, ?) ON CONFLICT(owner_email) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at")
    .bind(JSON.stringify(next), Date.now()).run();
  return Response.json({ featureVisibility: next });
}
