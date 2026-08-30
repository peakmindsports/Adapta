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
test("uses a rotating color palette for orientation destination levels", async () => {
  const [page, css, manual] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
    readProjectFile("app/manual.tsx"),
  ]);

  assert.match(page, /orientation-level-tone-\$\{\(index % 12\) \+ 1\}/);
  for (let tone = 1; tone <= 12; tone += 1) {
    assert.match(css, new RegExp(`\\.orientation-level-tone-${tone}\\{`));
  }
  assert.match(css, /border:1px solid var\(--level-border\)/);
  assert.match(css, /color:var\(--level-accent\)/);
  assert.match(css, /\.orientation-level:before\{content:"";position:absolute;inset:0 0 auto;height:7px;background:var\(--level-accent\)/);
  assert.match(css, /\.orientation-level>header\{margin:-18px -18px 18px;padding:22px 18px 13px;background:var\(--level-accent\)/);
  assert.match(css, /\.orientation-level \.field select\{border-color:var\(--level-border\);box-shadow:inset 4px 0 0 var\(--level-accent\)/);
  assert.match(manual, /Cada nueva tarjeta se identifica automáticamente con un color diferente/);
});
test("keeps history and sign out visible on tablets and phones and restores Noa Martínez", async () => {
  const [page, css] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(page, /className="mobile-account-actions"/);
  assert.match(page, /<strong>Noa Martínez<\/strong>/);
  assert.match(page, /student-avatar">NM</);
  assert.doesNotMatch(page, /Irene Galán|Clara Galán/);
  assert.match(css, /@media\(max-width:1250px\)\{\.mobile-account-actions\{position:fixed/);
  assert.match(css, /bottom:max\(16px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.mobile-account-actions button,\.mobile-account-actions a\{min-height:42px/);
});
test("asks for the exact improvement location and securely supports image evidence", async () => {
  const [page, css, feedback] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
    readProjectFile("app/api/feedback/route.ts"),
  ]);

  assert.match(page, /Indica dónde habría que hacer el cambio/);
  assert.match(page, /pantalla, el apartado y, si es posible, el botón o campo/);
  assert.match(page, /type="file" accept="image\/jpeg,image\/png,image\/webp,image\/gif" multiple/);
  assert.match(page, /feedbackImages\.forEach\(\(image\) => form\.append\("images", image\)\)/);
  assert.match(page, /Evita que aparezcan datos personales del alumnado/);
  assert.match(page, /admin-proposal-images/);
  assert.match(css, /\.feedback-guidance\{/);
  assert.match(feedback, /const MAX_IMAGES = 3/);
  assert.match(feedback, /const MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(feedback, /runtime\(\)\.FILES\.put\(key, file\.stream\(\)/);
  assert.match(feedback, /if \(!isSiteAdmin\(request\)\)/);
  assert.match(feedback, /attachmentKey\.startsWith\("feedback\/"\)/);
});
test("accepts generated PDF and Word resources and asks for exact error pages", async () => {
  const [page, css, feedback] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
    readProjectFile("app/api/feedback/route.ts"),
  ]);

  assert.match(page, /adjúntalo e indica el error y las páginas concretas/);
  assert.match(page, /páginas exactas y explica qué debería aparecer y qué aparece realmente/);
  assert.match(page, /id="feedback-resources" type="file"/);
  assert.match(page, /application\/pdf,application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(page, /feedbackResources\.forEach\(\(resource\) => form\.append\("resources", resource\)\)/);
  assert.match(page, /attachment\.kind === "resource"/);
  assert.match(css, /\.feedback-resources\{/);
  assert.match(feedback, /const MAX_RESOURCES = 2/);
  assert.match(feedback, /const MAX_RESOURCE_BYTES = 40 \* 1024 \* 1024/);
  assert.match(feedback, /form\.getAll\("resources"\)/);
  assert.match(feedback, /kind: "resource"/);
  assert.match(feedback, /Content-Disposition/);
});
test("gives each orientation source option its own color", async () => {
  const css = await readProjectFile("app/globals.css");

  assert.match(css, /\.orientation-source-selector button:nth-child\(1\)\{--source-accent:#277f91/);
  assert.match(css, /\.orientation-source-selector button:nth-child\(2\)\{--source-accent:#b35443/);
  assert.match(css, /\.orientation-source-selector button:nth-child\(3\)\{--source-accent:#7056a2/);
  assert.match(css, /\.orientation-source-selector button\.active\{border-color:var\(--source-accent\)/);
  assert.match(css, /content:"Seleccionado"/);
});
test("keeps identified people collapsed and orders them by cost then alphabetically", async () => {
  const [page, usersRoute, css] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/api/admin/users/route.ts"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(page, /const \[showAdminUsers, setShowAdminUsers\] = useState\(false\)/);
  assert.match(page, /aria-expanded=\{showAdminUsers\} aria-controls="admin-user-list"/);
  assert.match(page, /\{showAdminUsers && <div id="admin-user-list"/);
  assert.match(page, /Number\(b\.estimatedCostUsd\) - Number\(a\.estimatedCostUsd\)/);
  assert.match(page, /localeCompare\(b\.displayName \|\| b\.email, "es", \{ sensitivity: "base" \}\)/);
  assert.match(usersRoute, /ORDER BY estimatedCostUsd DESC/);
  assert.match(usersRoute, /COLLATE NOCASE ASC/);
  assert.match(css, /\.admin-users-content\{padding-top:8px\}/);
});
test("keeps improvement proposals collapsed and links pending alerts to the exact proposal", async () => {
  const [page, feedback, css] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/api/feedback/route.ts"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(page, /const \[showAdminProposals, setShowAdminProposals\] = useState\(false\)/);
  assert.match(page, /aria-expanded=\{showAdminProposals\} aria-controls="admin-proposal-list"/);
  assert.match(page, /improvementProposals\.some\(\(proposal\) => proposal\.status === "pending"\)/);
  assert.match(page, /className="admin-proposal-alert" onClick=\{openPendingProposal\}/);
  assert.match(page, /setShowAdminProposals\(true\); setHighlightedProposalId\(proposal\.id\)/);
  assert.match(page, /document\.getElementById\(`admin-proposal-\$\{proposal\.id\}`\)/);
  assert.match(page, /id=\{`admin-proposal-\$\{proposal\.id\}`\}/);
  assert.match(feedback, /export async function PATCH\(request: Request\)/);
  assert.match(feedback, /UPDATE improvement_proposals SET status = 'reviewed' WHERE id = \?/);
  assert.match(css, /\.admin-proposal-alert\{/);
  assert.match(css, /article\.proposal-highlighted\{/);
});
test("shows Manu Galán Marín beside the brand on tablets and phones", async () => {
  const [page, css] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(page, /<em>Manu Galán Marín<\/em>/);
  assert.match(css, /@media\(max-width:1250px\)\{\.brand\{flex:none\}\.brand em\{display:block/);
  assert.match(css, /\.brand em\{display:block;font-size:7px;line-height:1\.15;white-space:nowrap\}/);
  assert.match(css, /@media\(max-width:420px\)\{\.site-header\{padding-inline:12px\}/);
});

test("rejects incomplete generations across every workflow", async () => { const generation = await readProjectFile("app/api/jobs/[id]/generate/route.ts"); assert.match(generation, /generatedResultIssue/); assert.match(generation, /callValidatedModel/); assert.match(generation, /qualityAttempt < 2/); assert.match(generation, /initial_assessment/); assert.match(generation, /chapter/); assert.match(generation, /project/); assert.match(generation, /no se guardó ningún documento incompleto/); assert.match(generation, /CURRÍCULO OFICIAL INCORPORADO DIRECTAMENTE/); });
