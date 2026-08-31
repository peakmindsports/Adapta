import { runtime } from "./_shared";

export const featureKeys = ["adaptacion", "proyecto", "orientacion", "manual", "privacidad", "evaluacion"] as const;
export type FeatureKey = typeof featureKeys[number];
export type FeatureVisibility = Record<FeatureKey, boolean>;
export const courseFeatureKeys = ["adaptacion", "proyecto", "orientacion", "evaluacion"] as const;
export type CourseFeatureKey = typeof courseFeatureKeys[number];
export const allCourses = ["3 años de Infantil", "4 años de Infantil", "5 años de Infantil", "1º de Primaria", "2º de Primaria", "3º de Primaria", "4º de Primaria", "5º de Primaria", "6º de Primaria", "1º de ESO", "2º de ESO", "3º de ESO", "4º de ESO"];
export type CourseVisibility = Record<CourseFeatureKey, string[]>;
export const defaultFeatureVisibility: FeatureVisibility = { adaptacion: true, proyecto: true, orientacion: true, manual: true, privacidad: true, evaluacion: true };
export const defaultCourseVisibility = (): CourseVisibility => Object.fromEntries(courseFeatureKeys.map((key) => [key, [...allCourses]])) as CourseVisibility;

export async function readVisibilitySettings(): Promise<{ featureVisibility: FeatureVisibility; courseVisibility: CourseVisibility }> {
  const row = await runtime().DB.prepare("SELECT model FROM user_settings WHERE owner_email = 'site-feature-visibility'").first<{ model: string }>();
  let stored: any = {};
  try { stored = row?.model ? JSON.parse(row.model) : {}; } catch { stored = {}; }
  const features = stored.features || stored;
  const courseVisibility = defaultCourseVisibility();
  for (const key of courseFeatureKeys) if (Array.isArray(stored.courses?.[key])) courseVisibility[key] = allCourses.filter((course) => stored.courses[key].includes(course));
  return { featureVisibility: Object.fromEntries(featureKeys.map((key) => [key, features[key] !== false])) as FeatureVisibility, courseVisibility };
}
export async function readFeatureVisibility() { return (await readVisibilitySettings()).featureVisibility; }
