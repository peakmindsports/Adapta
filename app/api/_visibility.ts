import { runtime } from "./_shared";

export const featureKeys = ["adaptacion", "proyecto", "orientacion", "manual", "privacidad", "evaluacion"] as const;
export type FeatureKey = typeof featureKeys[number];
export type FeatureVisibility = Record<FeatureKey, boolean>;

export const defaultFeatureVisibility: FeatureVisibility = {
  adaptacion: true,
  proyecto: true,
  orientacion: true,
  manual: true,
  privacidad: true,
  evaluacion: true,
};

export async function readFeatureVisibility(): Promise<FeatureVisibility> {
  const row = await runtime().DB.prepare("SELECT model FROM user_settings WHERE owner_email = 'site-feature-visibility'").first<{ model: string }>();
  if (!row?.model) return defaultFeatureVisibility;
  try {
    const stored = JSON.parse(row.model) as Partial<FeatureVisibility>;
    return Object.fromEntries(featureKeys.map((key) => [key, stored[key] !== false])) as FeatureVisibility;
  } catch { return defaultFeatureVisibility; }
}
