import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Infantil shows live curriculum progress and keeps 100 percent visible",async()=>{
 const client=await readFile(new URL("../app/initial-assessment-v2.tsx",import.meta.url),"utf8");
 assert.match(client,/setProgress\(1\)/);
 assert.match(client,/window\.setInterval/);
 assert.match(client,/Math\.min\(end - 2/);
 assert.match(client,/busy \|\| progress > 0/);
 assert.match(client,/Competencias preparadas/);
});
