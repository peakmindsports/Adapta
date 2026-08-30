import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("only Orientation other material creates similar resources at the same course",async()=>{
 const [page,generator,jobs]=await Promise.all([
  readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/api/jobs/[id]/generate/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/jobs/route.ts",import.meta.url),"utf8"),
 ]);
 assert.match(page,/orientationSource !== "other" && ready\.some/);
 assert.match(page,/orientationSource === "other" \? courses : courses\.filter/);
 assert.match(page,/Crea material nuevo y similar/);
 assert.match(generator,/isOrientationOtherMaterial/);
 assert.match(generator,/MATERIAL NUEVO Y SIMILAR/);
 assert.match(generator,/isOrientationOtherMaterial \? orientationSimilarMaterialPrompt/);
 assert.match(jobs,/Material similar/);
});
