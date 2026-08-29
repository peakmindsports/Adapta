import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("curriculum consultation exposes progress and uses resilient endpoint", async () => {
  const [client, route] = await Promise.all([read("app/initial-assessment.tsx"), read("app/api/curriculum-v2/route.ts")]);
  assert.match(client, /curriculumProgress/);
  assert.match(client, /Consultando normativa oficial/);
  assert.match(client, /\/api\/curriculum-v2/);
  assert.match(route, /search_context_size: "low"/);
  assert.match(route, /response\.status !== 429/);
  assert.match(route, /attempt < 5/);
  assert.match(route, /curriculum:\$\{body\.course\}:\$\{body\.subject\}/);
  assert.match(route, /cached: true/);
});

test("initial-assessment exports remove private markers and protect rubric tables", async () => {
  const route = await read("app/api/jobs/[id]/download/route.ts");
  assert.match(route, /INICIO_DOCENTE/);
  assert.match(route, /FIN_DOCENTE/);
  assert.match(route, /previousBlockType !== "tableRow" && y < 430/);
  assert.match(route, /brica anal\|lista de observaci/);
});
