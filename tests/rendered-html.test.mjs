import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

test("offers UDI, other material and both in Departamento de Orientación", async () => {
  const page = await readProjectFile("app/page.tsx");

  assert.match(page, /useState<OrientationSource \| "both">\("units"\)/);
  assert.match(page, />Unidades didácticas del curso actual</);
  assert.match(page, />Otro material</);
  assert.match(page, />Ambos: UDI y otro material</);
  assert.match(page, /dos documentos separados que no mezclan sus contenidos/);
  assert.match(page, /orientationSource !== "other" && <UploadBox/);
  assert.match(page, /orientationSource !== "units" && <div className="orientation-other-material"/);
});

test("creates two independent tasks per level when both is selected", async () => {
  const page = await readProjectFile("app/page.tsx");

  assert.match(page, /orientationSource === "both" \? \["units", "other"\]/);
  assert.match(page, /selectedSources\.includes\("units"\) && !files\.unidades\.length/);
  assert.match(page, /selectedSources\.includes\("other"\) && !orientationOtherMaterial\.length/);
  assert.match(page, /const tasks = ready\.flatMap\(\(level\) => selectedSources\.map/);
  assert.match(page, /const completedKeys = new Set\(orientationResults\.map/);
  assert.match(page, /source === "units" \? files\.unidades : orientationOtherMaterial/);
  assert.match(page, /Banco del Departamento de Orientación · \$\{sourceLabel\} · \$\{level\.targetCourse\}/);
  assert.match(page, /No mezcles este documento con el otro tipo de contenido/);
  assert.match(page, /createdResults\.push\(\{ jobId: created\.job\.id, result: generated\.result, level: level\.targetCourse, source \}\)/);
});

test("shows and documents the two separate results", async () => {
  const page = await readProjectFile("app/page.tsx");
  const manual = await readProjectFile("app/manual.tsx");
  const css = await readProjectFile("app/globals.css");

  assert.match(page, /item\.source === "units" \? "Unidades didácticas adaptadas" : "Otro material adaptado"/);
  assert.match(page, /Se crearán dos documentos separados por cada curso seleccionado/);
  assert.match(manual, /Elige Ambos: UDI y otro material/);
  assert.match(manual, /se generan dos documentos independientes/);
  assert.match(manual, /Sus contenidos no se mezclan/);
  assert.match(css, /\.orientation-source-selector\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(css, /\.orientation-separate-note/);
  assert.match(css, /@media\(max-width:700px\)\{\.orientation-source-selector\{grid-template-columns:1fr\}\}/);
});
test("enforces editorial, pedagogical and manual-input quality", async () => {
  const generation = await readProjectFile("app/api/jobs/[id]/generate/route.ts");
  const manual = await readProjectFile("app/manual.tsx");

  assert.match(generation, /CONTRATO TRANSVERSAL DE APORTACIONES MANUALES/);
  assert.match(generation, /Aportación manual → decisión aplicada/);
  assert.match(generation, /CONTRATO DE CALIDAD EDITORIAL Y PEDAGÓGICA/);
  assert.match(generation, /imágenes didácticas originales/);
  assert.match(generation, /producto final tangible, motivador y adecuado a la edad/);
  assert.match(generation, /auditoría interna página a página/);
  assert.match(manual, /cada aportación específica haya producido una decisión visible/);
});

test("protects long and document-heavy generations", async () => {
  const page = await readProjectFile("app/page.tsx");
  const generation = await readProjectFile("app/api/jobs/[id]/generate/route.ts");
  const download = await readProjectFile("app/api/jobs/[id]/download/route.ts");

  assert.doesNotMatch(generation, /fileRows\.results\.slice\(0, 60\)/);
  assert.doesNotMatch(page, /El conjunto supera 180 MB/);
  assert.match(page, /MAX_JOB_BYTES = 600 \* 1024 \* 1024/);
  assert.match(page, /procesamiento seguro/);
  assert.match(page, /const generateReliably = async/);
  assert.match(page, /el trabajo sigue guardado y se comprueba automáticamente/);
  assert.match(generation, /job\.status === "completed" && job\.result/);
  assert.match(generation, /job\.status === "generating"/);
  assert.match(generation, /UPDATE jobs SET updated_at/);
  assert.match(generation, /quotaLimit = isOrientationBank \? 30 : 3/);
  assert.doesNotMatch(download, /unique = candidates[\s\S]{0,300}\.sort\(/);
});