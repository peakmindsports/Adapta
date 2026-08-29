import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uploads temporary OpenAI files with compatible multipart fields", async () => {
  const routes = await Promise.all([
    read("app/api/jobs/[id]/generate/route.ts"),
    read("app/api/jobs/[id]/recommend-level/route.ts"),
  ]);

  for (const route of routes) {
    assert.match(route, /append\("purpose", "user_data"\)/);
    assert.doesNotMatch(route, /append\("expires_after"/);
    assert.match(route, /method: "DELETE"/);
  }
});
