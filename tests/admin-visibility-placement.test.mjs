import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("renders feature visibility outside the project workspace", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const projectStart = page.indexOf('{view === "proyecto"');
  const historyStart = page.indexOf("{showHistory &&", projectStart);
  const visibilityDock = page.indexOf("admin-visibility-dock");

  assert.ok(projectStart >= 0 && historyStart > projectStart);
  assert.ok(visibilityDock > historyStart, "visibility controls must remain available when Administration opens from any view");
});
