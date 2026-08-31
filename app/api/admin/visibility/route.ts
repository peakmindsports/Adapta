import { ensureSchema, isSiteAdmin, jsonError, runtime } from "../../_shared";
import { allCourses, courseFeatureKeys, CourseFeatureKey, featureKeys, FeatureKey, readVisibilitySettings } from "../../_visibility";

export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar la visibilidad.", 403);
  return Response.json(await readVisibilitySettings());
}
export async function PATCH(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede cambiar la visibilidad.", 403);
  const body = await request.json() as { key?: string; section?: string; course?: string; visible?: boolean };
  if (typeof body.visible !== "boolean") return jsonError("Opción de visibilidad no válida.");
  const next = await readVisibilitySettings();
  if (body.key && featureKeys.includes(body.key as FeatureKey)) next.featureVisibility[body.key as FeatureKey] = body.visible;
  else if (courseFeatureKeys.includes(body.section as CourseFeatureKey) && allCourses.includes(body.course || "")) {
    const section = body.section as CourseFeatureKey;
    next.courseVisibility[section] = body.visible ? [...new Set([...next.courseVisibility[section], body.course!])].sort((a, b) => allCourses.indexOf(a) - allCourses.indexOf(b)) : next.courseVisibility[section].filter((course) => course !== body.course);
  } else return jsonError("Opción de visibilidad no válida.");
  await runtime().DB.prepare("INSERT INTO user_settings (owner_email, model, updated_at) VALUES ('site-feature-visibility', ?, ?) ON CONFLICT(owner_email) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at").bind(JSON.stringify({ features: next.featureVisibility, courses: next.courseVisibility }), Date.now()).run();
  return Response.json(next);
}
