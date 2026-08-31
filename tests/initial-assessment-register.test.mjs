import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the initial assessment register mirrors the full teacher workflow", async () => {
  const route = await readFile(
    new URL("../app/api/initial-assessment-excel/route.ts", import.meta.url),
    "utf8",
  );
  for (const label of [
    "Instrumento",
    "Medio de evaluación",
    "Evidencia",
    "Estado",
    "Puntuación",
    "Dificultades encontradas",
    "N.º alumnado",
    "Porcentaje",
  ])
    assert.match(route, new RegExp(label));
  assert.match(
    route,
    /Rúbrica,Lista de cotejo,Portafolio,Prueba escrita,Prueba práctica,Autoevaluación,Observación directa/,
  );
  assert.match(
    route,
    /Proyectos colaborativos,Presentaciones orales,Debates,Diario de reflexión,Mapas conceptuales/,
  );
  assert.match(route, /No adquirido.*1.*En proceso.*2.*Adquirido.*3/);
  assert.match(route, /COUNTIF/);
  assert.match(route, /COUNTA/);
  assert.match(route, /analyzeRegister/);
  assert.match(route, /analyzeCompatibleRegister/);
  assert.match(route, /function compatibleValues/);
  assert.match(route, /inputHeaders\.length\s*\?\s*inputHeaders/);
  assert.match(route, /percentageDistribution/);
  assert.match(route, /r:id/);
  assert.match(route, /\(\?:\\\/\>\|>/);
});
