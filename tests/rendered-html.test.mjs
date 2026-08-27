import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

test("offers both source-material options in Departamento de Orientación", async () => {
  const page = await readProjectFile("app/page.tsx");

  assert.match(page, /orientationSource.*useState<"units" \| "other">\("units"\)/);
  assert.match(page, />Unidades didácticas del curso actual</);
  assert.match(page, />Otro material</);
  assert.match(page, /fichas, cuadernos, dossiers, actividades o recursos de elaboración propia/);
  assert.match(page, /No es necesario que el material esté organizado como unidades didácticas/);
  assert.match(page, /orientationSource === "units" \? <UploadBox[\s\S]*orientationOtherMaterial/);
});

test("validates and uploads the selected common source", async () => {
  const page = await readProjectFile("app/page.tsx");

  assert.match(page, /const sourceFiles = orientationSource === "units" \? files\.unidades : orientationOtherMaterial/);
  assert.match(page, /if \(!sourceFiles\.length\)/);
  assert.match(page, /Añade el material propio que quieres adaptar/);
  assert.match(page, /sourceFiles\.map\(\(file\) => \(\{ category: "unidades" as UploadKey, file \}\)\)/);
  assert.match(page, /Adapta íntegramente el material propio aportado por el departamento/);
  assert.match(page, /No lo trates como una programación anual ni inventes unidades que no existan/);
});

test("documents the new Otro material workflow", async () => {
  const manual = await readProjectFile("app/manual.tsx");
  const css = await readProjectFile("app/globals.css");

  assert.match(manual, /title: "Departamento de Orientación"/);
  assert.match(manual, /Elige Otro material cuando el departamento quiera adaptar recursos propios/);
  assert.match(manual, /no necesitan estar organizados como UDI/);
  assert.match(manual, /se ajustan al nivel elegido las explicaciones, las consignas, el vocabulario, la extensión, los apoyos y la dificultad/);
  assert.match(css, /\.orientation-source-selector/);
  assert.match(css, /\.orientation-source-selector button\.active/);
  assert.match(css, /@media\(max-width:700px\)\{\.orientation-source-selector\{grid-template-columns:1fr\}\}/);
});