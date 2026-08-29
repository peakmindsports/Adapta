import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("persists six administrator-controlled visibility options", async () => {
  const [route, shared] = await Promise.all([read("app/api/admin/visibility/route.ts"), read("app/api/_visibility.ts")]);
  assert.match(shared, /adaptacion.*proyecto.*orientacion.*manual.*privacidad.*evaluacion/);
  assert.match(shared, /site-feature-visibility/);
  assert.match(route, /isSiteAdmin/);
  assert.match(route, /INSERT INTO user_settings/);
});

test("returns visibility with the session and protects direct navigation", async () => {
  const [session, page] = await Promise.all([read("app/api/session/route.ts"), read("app/page.tsx")]);
  assert.match(session, /readFeatureVisibility/);
  assert.match(session, /featureVisibility/);
  assert.match(page, /nextVisibility\[requested as FeatureKey\]/);
  assert.match(page, /Esta sección no está disponible actualmente/);
});

test("hides navigation, home cards and workspaces", async () => {
  const page = await read("app/page.tsx");
  for (const key of ["adaptacion", "proyecto", "orientacion", "manual", "privacidad", "evaluacion"]) assert.match(page, new RegExp(`featureVisibility\\.${key}`));
  assert.match(page, /AdminVisibility value=\{featureVisibility\}/);
  assert.match(page, /toggleFeatureVisibility/);
});
