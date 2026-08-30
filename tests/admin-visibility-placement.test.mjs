import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("renders feature visibility inline inside Administration", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const publicControl = page.indexOf("admin-public-control");
  const visibilityInline = page.indexOf(
    "admin-visibility-inline",
    publicControl,
  );
  const people = page.indexOf("Personas identificadas", visibilityInline);
  assert.ok(publicControl >= 0 && visibilityInline > publicControl);
  assert.ok(
    people > visibilityInline,
    "visibility controls must stay in normal flow above identified people",
  );
  assert.doesNotMatch(page, /admin-visibility-dock/);
});

test("keeps the visibility toggle available to the Administration render", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const userToggle = page.indexOf("const toggleUserAccess");
  const visibilityToggle = page.indexOf("const toggleFeatureVisibility");
  const deleteUser = page.indexOf("const deleteAdminUser");
  assert.ok(
    userToggle >= 0 &&
      visibilityToggle > userToggle &&
      deleteUser > visibilityToggle,
  );
});
