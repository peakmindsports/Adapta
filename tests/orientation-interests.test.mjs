import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("other orientation material accepts optional interests and applies them only there",async()=>{
 const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(page,/orientationInterests/);
 assert.match(page,/Centros de interés, temas o palabras importantes/);
 assert.match(page,/source === "other" && orientationInterests\.trim\(\)/);
 assert.match(page,/ejemplos, vocabulario, situaciones, actividades y apoyos/);
 assert.match(page,/No elimines ni alteres los aprendizajes esenciales/);
});
