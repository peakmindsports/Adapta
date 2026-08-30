import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("requires every referenced classroom material to exist",async()=>{const prompt=await read("app/api/jobs/[id]/generate/route.ts");assert.match(prompt,/MATERIALES AUTOSUFICIENTES/);assert.match(prompt,/\[LAMINA:/);assert.match(prompt,/las tarjetas que te enseñará/);assert.match(prompt,/AUDITORÍA FINAL DE RECURSOS/);});
test("keeps rubric titles outside compact four-column tables",async()=>{const prompt=await read("app/api/jobs/[id]/generate/route.ts");assert.match(prompt,/CONTRATO ESTRICTO DE RÚBRICAS/);assert.match(prompt,/Indicador \| No conseguido \| En proceso \| Conseguido/);assert.match(prompt,/máximo 28 palabras por celda/);});
test("renders printable visual sheets and breaks oversized words",async()=>{const route=await read("app/api/jobs/[id]/download/route.ts");assert.match(route,/type: "visual"/);assert.match(route,/const visual = line\.match/);assert.match(route,/block\.type === "visual"/);assert.match(route,/font\.widthOfTextAtSize\(word, size\) > maxWidth/);});
