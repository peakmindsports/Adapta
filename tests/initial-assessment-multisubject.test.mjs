import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("orders the public navigation as requested", async () => {
  const page = await read("app/page.tsx"),
    nav = page.slice(
      page.indexOf('<nav aria-label="Navegación principal">'),
      page.indexOf(
        "</nav>",
        page.indexOf('<nav aria-label="Navegación principal">'),
      ),
    );
  const labels = [
    "Evaluación inicial",
    "Adaptaciones",
    "Proyectos",
    "Departamento de Orientación",
    "Manual de uso",
    "Privacidad",
  ];
  for (let i = 1; i < labels.length; i++)
    assert.ok(nav.indexOf(labels[i - 1]) < nav.indexOf(labels[i]));
});
test("keeps colored section visibility behind Mostrar secciones", async () => {
  const [component, css] = await Promise.all([
    read("app/admin-visibility-v2.tsx"),
    read("app/new-features.css"),
  ]);
  assert.match(component, /Mostrar secciones/);
  assert.match(component, /<details className="admin-feature-visibility">/);
  for (let i = 1; i <= 6; i++)
    assert.match(css, new RegExp(`nth-child\\(${i}\\)`));
});
test("supports one, several or all subjects and sequential generation", async () => {
  const client = await read("app/initial-assessment-v2.tsx");
  assert.match(client, /setChosen\(subjects\)/);
  assert.match(
    client,
    /for\s*\(let i\s*=\s*0;\s*i\s*<\s*chosen\.length;\s*i\+\+\)/,
  );
  assert.match(
    client,
    /for\s*\(let i\s*=\s*0;\s*i\s*<\s*selectedCurricula\.length;\s*i\+\+\)/,
  );
  assert.match(client, /Informe de Evaluación inicial/);
  assert.match(client, /initial-assessment-excel/);
  assert.match(client, /course\.startsWith\("6º"\)/);
  assert.match(client, /Descargar Excel inicial/);
  assert.match(client, /3 años de Infantil/);
  assert.match(client, /Crecimiento en Armonía/);
  assert.match(client, /selectedCompetencies/);
  assert.match(client, /Deseleccionar todas/);
  assert.match(
    client,
    /Selecciona al menos una competencia de cada asignatura/,
  );
  assert.match(client, /competencies: curriculum\.competencies\.filter/);
});
test("creates xlsx validations and analyzes the three states", async () => {
  const route = await read("app/api/initial-assessment-excel/route.ts");
  assert.match(
    route,
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );
  assert.match(route, /No adquirido,En proceso,Adquirido/);
  assert.match(route, /unzipSync/);
  assert.match(route, /proposal/);
  assert.match(route, /cellStyleXfs count="1"/);
  assert.match(route, /cellStyles count="1"/);
  assert.ok(
    route.indexOf("<autoFilter ref=") <
      route.indexOf("${validation}<pageMargins"),
  );
});
test("generates new downloads with ExcelJS instead of manual XML", async () => {
  const route = await read("app/api/initial-assessment-excel/route.ts");
  assert.match(route, /import ExcelJS from "exceljs"/);
  assert.match(route, /await workbook\.xlsx\.writeBuffer\(\)/);
  assert.match(route, /const bytes\s*=\s*await makeWorkbook/);
  assert.match(route, /dataValidation\s*=\s*\{/);
  assert.match(route, /fullCalcOnLoad\s*=\s*true/);
  assert.match(route, /percentageDistribution/);
});
test("advances generation progress and repairs printable activity layout", async () => {
  const [client, download, prompt] = await Promise.all([
    read("app/initial-assessment-v2.tsx"),
    read("app/api/jobs/[id]/download/route.ts"),
    read("app/api/jobs/[id]/generate/route.ts"),
  ]);
  assert.match(client, /generationTimer = window\.setInterval/);
  assert.match(client, /Math\.min\(end - 2/);
  assert.match(client, /async function generateReliably/);
  assert.match(client, /job\.job\?\.status === "completed"/);
  assert.match(download, /normalizeInitialAssessmentLayout/);
  assert.match(download, /separate\(options, "- \[ \]"/);
  assert.match(download, /separate\(facts, "- ____"/);
  assert.match(download, /### Rúbrica analítica/);
  assert.match(
    prompt,
    /Cada «Rúbrica analítica» debe comenzar después de un salto de página/,
  );
});
test("hides upstream HTML errors when analyzing an Excel file", async () => {
  const client = await read("app/initial-assessment-v2.tsx");
  assert.match(client, /<!doctype html\|<html\|cloudflare/i);
  assert.match(client, /El servidor no pudo procesar el archivo/);
});
