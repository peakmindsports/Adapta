import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { decodePDFRawStream, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts, rgb } from "pdf-lib";
import UPNG from "@pdf-lib/upng";
import jpeg from "jpeg-js";
import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime, safeFilename } from "../../../_shared";

type Block = { type: "heading" | "bullet" | "checkbox" | "number" | "paragraph" | "tableRow" | "card" | "break" | "image" | "match"; text: string; second?: string; level?: number; cells?: string[] };
type SourceImage = { bytes: Uint8Array; width: number; height: number; type: "jpg" | "png" };
type CoverDetails = { subject?: string | null; student?: string | null; course?: string | null; academicYear?: string | null; audience?: "all" | "student" | "teacher" };

function generatedFallbackCover(): SourceImage {
  const width = 900; const height = 560; const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; let color = [246, 242, 231];
    const circle = (cx: number, cy: number, radius: number) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
    if (circle(130, 105, 92)) color = [239, 110, 87];
    if (circle(790, 455, 120)) color = [64, 142, 151];
    if (x > 170 && x < 730 && y > 105 && y < 455) color = [255, 255, 252];
    if (x > 205 && x < 430 && y > 155 && y < 405) color = [214, 232, 226];
    if (x > 470 && x < 695 && y > 155 && y < 405) color = [255, 224, 165];
    if ((x > 225 && x < 410 || x > 490 && x < 675) && y > 185 && y < 198) color = [39, 127, 145];
    if ((x > 225 && x < 410 || x > 490 && x < 675) && y > 235 && y < 246) color = [116, 128, 130];
    if ((x > 225 && x < 410 || x > 490 && x < 675) && y > 285 && y < 296) color = [116, 128, 130];
    if ((x > 225 && x < 410 || x > 490 && x < 675) && y > 335 && y < 346) color = [116, 128, 130];
    if (circle(250, 240, 15) || circle(515, 290, 15) || circle(250, 340, 15)) color = [239, 110, 87];
    rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255;
  }
  return { bytes: new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0)), width, height, type: "png" };
}

function isDecorativeTexture(pixels: Uint8Array, width: number, height: number, channels = 4) {
  const pixelCount = width * height; const step = Math.max(1, Math.floor(pixelCount / 12000));
  let samples = 0; let luminanceSum = 0; let luminanceSquaredSum = 0; let edgeSum = 0; let previousLuminance: number | null = null;
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * channels; const red = pixels[offset]; const green = pixels[offset + 1]; const blue = pixels[offset + 2];
    const luminance = .299 * red + .587 * green + .114 * blue; samples += 1; luminanceSum += luminance; luminanceSquaredSum += luminance * luminance;
    if (previousLuminance !== null) edgeSum += Math.abs(luminance - previousLuminance); previousLuminance = luminance;
  }
  if (samples < 2) return true;
  const mean = luminanceSum / samples; const deviation = Math.sqrt(Math.max(0, luminanceSquaredSum / samples - mean * mean)); const averageEdge = edgeSum / (samples - 1);
  return deviation < 24 && averageEdge < 27;
}

function isUsefulJpeg(bytes: Uint8Array) {
  try { const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true }); return !isDecorativeTexture(decoded.data, decoded.width, decoded.height); }
  catch { return false; }
}

function imageFingerprint(image: SourceImage) {
  let hash = 2166136261; const step = Math.max(1, Math.floor(image.bytes.length / 2048));
  for (let index = 0; index < image.bytes.length; index += step) { hash ^= image.bytes[index]; hash = Math.imul(hash, 16777619); }
  return `${image.type}:${image.width}:${image.height}:${image.bytes.length}:${hash >>> 0}`;
}

function cleanMarkdown(value: string) {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^>\s?/, "").trim();
}

function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []; let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: cleanMarkdown(paragraph.join(" ")) }); paragraph = []; };
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim(); if (!line) { flush(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/); const checkbox = line.match(/^[-*+]\s+\[\s*\]\s+(.+)$/); const bullet = line.match(/^[-*+]\s+(.+)$/); const number = line.match(/^\d+[.)]\s+(.+)$/); const image = line.match(/^\[IMAGEN:\s*(.+)\]$/i); const card = line.match(/^(?:>\s*)?\[TARJETA:\s*(.+)\]$/i); const match = line.match(/^\[UNIR:\s*(.+?)\s*\|\|\s*(.+)\]$/i);
    if (heading) { flush(); blocks.push({ type: "heading", text: cleanMarkdown(heading[2]), level: Math.min(3, heading[1].length) }); }
    else if (image) { flush(); blocks.push({ type: "image", text: cleanMarkdown(image[1]) }); }
    else if (card) { flush(); blocks.push({ type: "card", text: cleanMarkdown(card[1]) }); }
    else if (match) { flush(); blocks.push({ type: "match", text: cleanMarkdown(match[1]), second: cleanMarkdown(match[2]) }); }
    else if (checkbox) { flush(); blocks.push({ type: "checkbox", text: cleanMarkdown(checkbox[1]) }); }
    else if (bullet) { flush(); blocks.push({ type: "bullet", text: cleanMarkdown(bullet[1]) }); }
    else if (number) { flush(); blocks.push({ type: "number", text: cleanMarkdown(number[1]) }); }
    else if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) { flush(); }
    else if (/^\|.+\|$/.test(line)) { flush(); const cells = line.slice(1, -1).split("|").map((cell) => cleanMarkdown(cell)); blocks.push({ type: "tableRow", text: cells.join(" · "), cells }); }
    else if (/^---+$/.test(line)) { flush(); blocks.push({ type: "break", text: "" }); }
    else paragraph.push(line);
  }
  flush(); return blocks.filter((block) => block.type === "break" || block.text);
}

function selectUnits(markdown: string, requested: number[]) {
  if (!requested.length) return markdown;
  const matches = [...markdown.matchAll(/^# Unidad\s+(\d+)\s*:\s*.+$/gim)];
  if (!matches.length) return markdown;
  const preamble = markdown.slice(0, matches[0].index).replace(/## Índice[\s\S]*?(?=\n---\n|$)/i, "").trim();
  const chapters = matches.map((match, index) => ({ number: Number(match[1]), text: markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length).replace(/^\s*---\s*$/gm, "").trim() }));
  const chosen = chapters.filter((chapter) => requested.includes(chapter.number));
  return chosen.length ? `${preamble}\n\n---\n\n${chosen.map((chapter) => chapter.text).join("\n\n---\n\n")}` : markdown;
}

function repairIndex(markdown: string) {
  const units = [...markdown.matchAll(/^# Unidad\s+(\d+)\s*:\s*(.+)$/gim)].map((match) => ({ number: Number(match[1]), title: match[2].trim() }));
  if (!units.length || !/## Índice/i.test(markdown)) return markdown;
  const index = `## Índice\n${units.map((unit) => `${unit.number}. Unidad ${unit.number} · ${unit.title}`).join("\n")}`;
  return markdown.replace(/## Índice[\s\S]*?(?=\n---\n)/i, index);
}

function clarifyAmbiguousActivities(markdown: string) {
  return markdown.replace(/Copia una palabra\.?\s*\n+\s*(?:\*\*)?Población\s*:\s*(?:\*\*)?/gi, "Copia la palabra «población» en la línea.\n\n**Población:** ______________________________");
}
function repairEvaluationLabels(markdown: string) {
  return markdown
    .replace(/Criterio no disponible en la documentación\.?/gi, "Indicador observable de la actividad")
    .replace(/Criterio no disponible\.?/gi, "Indicador observable de la actividad");
}

function studentSafeMarkdown(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*(?:[-*]\s*)?\*{0,2}(?:nivel competencial(?: de trabajo)?|nivel de concreción curricular|nivel curricular|nivel educativo de adaptación)\s*:\*{0,2}/i.test(line))
    .filter((line) => !/^\s*\|[^|]*(?:nivel competencial|nivel de concreción curricular|nivel curricular|nivel educativo de adaptación)[^|]*\|/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

type DownloadScope = "all" | "student" | "teacher";

function audienceSections(markdown: string) {
  const annex = markdown.match(/^# Anexo exclusivo para el profesorado\s*$/im);
  if (annex?.index !== undefined) return { student: markdown.slice(0, annex.index).trim(), teacher: markdown.slice(annex.index).trim() };
  const units = [...markdown.matchAll(/^# Unidad\s+(\d+)\s*:\s*(.+)$/gim)];
  if (!units.length) return { student: markdown, teacher: "" };
  const preamble = markdown.slice(0, units[0].index).trim(); const studentUnits: string[] = []; const teacherUnits: string[] = [];
  units.forEach((unit, index) => {
    const chapter = markdown.slice(unit.index, units[index + 1]?.index ?? markdown.length).replace(/^\s*---\s*$/gm, "").trim();
    const marker = chapter.match(/^(?:<!--\s*INICIO_DOCENTE\s*-->|#{2,3}\s+(?:Material exclusivo para el profesorado|Indicadores? de evaluaci[oó]n|R[uú]brica(?: de la unidad)?|Lista de control|Prueba escrita(?: para el profesorado)?|Solucionario docente|Gu[ií]a docente).*)$/im);
    if (!marker?.index) { studentUnits.push(chapter); return; }
    studentUnits.push(chapter.slice(0, marker.index).trim());
    const teacherBody = chapter.slice(marker.index).replace(/<!--\s*(?:INICIO|FIN)_DOCENTE\s*-->/gi, "").trim();
    teacherUnits.push(`## Unidad ${unit[1]} · ${unit[2].trim()}\n\n${teacherBody}`);
  });
  const teacher = teacherUnits.length ? `# Anexo exclusivo para el profesorado\n\nEste bloque reúne los instrumentos de evaluación, registros, pruebas y solucionarios. No forma parte del material entregable al alumnado.\n\n${teacherUnits.join("\n\n---\n\n")}` : "";
  return { student: `${preamble}\n\n${studentUnits.join("\n\n---\n\n")}`.trim(), teacher };
}

function selectTeacherUnits(markdown: string, requested: number[]) {
  if (!requested.length || !markdown) return markdown;
  const units = [...markdown.matchAll(/^## Unidad\s+(\d+)\s*[·:]\s*.+$/gim)];
  if (!units.length) return markdown;
  const preamble = markdown.slice(0, units[0].index).trim();
  const chosen = units.map((unit, index) => ({ number: Number(unit[1]), text: markdown.slice(unit.index, units[index + 1]?.index ?? markdown.length).replace(/^\s*---\s*$/gm, "").trim() })).filter((unit) => requested.includes(unit.number));
  return chosen.length ? `${preamble}\n\n${chosen.map((unit) => unit.text).join("\n\n---\n\n")}` : markdown;
}

function resourceForScope(markdown: string, requested: number[], scope: DownloadScope) {
  const sections = audienceSections(markdown); const student = selectUnits(sections.student, requested); const teacher = selectTeacherUnits(sections.teacher, requested);
  if (scope === "student") return student;
  if (scope === "teacher") return teacher || "# Material exclusivo para el profesorado\n\nEste recurso no contiene todavía un bloque docente identificado.";
  return teacher ? `${student}\n\n---\n\n${teacher}` : student;
}

async function makeWord(title: string, markdown: string, images: Array<SourceImage | null>, cover: CoverDetails, coverImage: SourceImage) {
  const coverScale = Math.min(430 / coverImage.width, 350 / coverImage.height, 1); const teacherCover = cover.audience === "teacher";
  const children: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: teacherCover ? "ADAPTA  ·  GUÍA DOCENTE" : "ADAPTA  ·  RECURSO EDUCATIVO", bold: true, color: "277F91", size: 18, characterSpacing: 40 })], spacing: { before: 300, after: 260 } }), new Paragraph({ children: [new TextRun({ text: cover.subject || "Mi recurso anual", bold: true, color: "172B30", size: 48 })], spacing: { after: 120 } }), new Paragraph({ children: [new TextRun({ text: teacherCover ? "Evaluar con claridad" : "Aprendo a mi manera", italics: true, color: "EF6E57", size: 28 })], spacing: { after: 280 } }), new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: coverImage.type, data: coverImage.bytes, transformation: { width: Math.round(coverImage.width * coverScale), height: Math.round(coverImage.height * coverScale) } })], spacing: { after: 260 } }), new Paragraph({ children: [new TextRun({ text: cover.student || title, bold: true, size: 26, color: "172B30" }), new TextRun({ break: 1, text: [cover.course, cover.academicYear].filter(Boolean).join("  ·  "), size: 20, color: "587075" })], shading: { fill: "EDF7F4" }, border: { left: { color: "277F91", style: "single", size: 18 } }, spacing: { before: 100, after: 200 }, indent: { left: 220 } }), new Paragraph({ children: [new PageBreak()] }), new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 240 } }), new Paragraph({ children: [new TextRun({ text: "Recurso adaptado", color: "277F91", size: 24 })], spacing: { after: 360 } })];
  let firstHeading = true;
  let imageIndex = 0;
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (block.type === "image") {
      const image = images[imageIndex++];
      if (image) { const scale = Math.min(470 / image.width, 260 / image.height, 1); children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: image.type, data: image.bytes, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) } })], spacing: { before: 120, after: 140 } })); }
    } else if (block.type === "card") {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, keepNext: true, children: [new TextRun({ text: "✂  TARJETA PARA RECORTAR", bold: true, size: 16, color: "A06A13" }), new TextRun({ break: 1, text: block.text, bold: true, size: 26, color: "172B30" })], shading: { fill: "FFF4D6" }, border: { top: { color: "E1A93B", style: "dashed", size: 10 }, bottom: { color: "E1A93B", style: "dashed", size: 10 }, left: { color: "E1A93B", style: "dashed", size: 10 }, right: { color: "E1A93B", style: "dashed", size: 10 } }, spacing: { before: 140, after: 180, line: 340 }, indent: { left: 220, right: 220 } }));
    } else if (block.type === "match") {
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [4700, 4700], rows: [new TableRow({ children: [new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: block.text, spacing: { before: 100, after: 100 } })] }), new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: block.second || "", spacing: { before: 100, after: 100 } })] })] })] }));
      children.push(new Paragraph({ text: "", spacing: { after: 150 } }));
    } else if (block.type === "checkbox") {
      children.push(new Paragraph({ children: [new TextRun({ text: "☐  ", bold: true, size: 26 }), new TextRun({ text: block.text, size: 22 })], spacing: { before: 45, after: 75 }, indent: { left: 280 } }));
    } else if (block.type === "tableRow") {
      const cells = block.cells?.length ? block.cells : [block.text]; const rubricHeader = cells.some((cell) => /^(Excelente|Bien|En proceso|Necesita apoyo|Todavía no|Observaciones)/i.test(cell)); const cellWidth = Math.floor(100 / cells.length); children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: cells.map(() => Math.floor(9400 / cells.length)), rows: [new TableRow({ cantSplit: true, children: cells.map((cell, cellIndex) => new TableCell({ width: { size: cellWidth, type: WidthType.PERCENTAGE }, shading: { fill: cellIndex === 0 ? "DCE6F7" : "F8FAF9" }, children: [new Paragraph({ children: [new TextRun({ text: cell, bold: cellIndex === 0 || rubricHeader, size: 17 })], spacing: { before: 80, after: 80, line: 240 } })] })) })] }));
    } else if (block.type === "heading") {
      if (!firstHeading && block.level === 1) children.push(new Paragraph({ children: [new PageBreak()] })); firstHeading = false;
      const activityHeading = /actividad|producto final|demuestro|repaso|juego|taller/i.test(block.text);
      children.push(new Paragraph({ text: block.text, heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, keepNext: true, spacing: { before: activityHeading ? 420 : 180, after: activityHeading ? 180 : 100 }, border: activityHeading ? { top: { color: "E6A48F", style: "single", size: 6, space: 10 } } : undefined }));
    } else if (block.type === "bullet") children.push(new Paragraph({ text: block.text, bullet: { level: 0 }, spacing: { after: 70 } }));
    else if (block.type === "number") children.push(new Paragraph({ text: block.text, numbering: { reference: "adaptation-numbering", level: 0 }, spacing: { before: 110, after: 170 } }));
    else children.push(new Paragraph({ text: block.text, spacing: { after: 130, line: 300 } }));
  }
  const document = new Document({ numbering: { config: [{ reference: "adaptation-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start", style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] }, styles: { default: { document: { run: { font: "Arial", size: 22, color: "172B30" }, paragraph: { spacing: { line: 300 } } } } }, sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children }] });
  return Packer.toBlob(document);
}

function pdfSafe(value: string) { return value.normalize("NFKC").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF]/g, ""); }
function wrapText(text: string, maxWidth: number, size: number, font: { widthOfTextAtSize(text: string, size: number): number }) {
  const lines: string[] = []; let current = "";
  for (const word of pdfSafe(text).split(/\s+/)) { const candidate = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate; else { if (current) lines.push(current); current = word; } }
  if (current) lines.push(current); return lines.length ? lines : [""];
}

async function makePdf(title: string, markdown: string, images: Array<SourceImage | null>, cover: CoverDetails, coverImage: SourceImage, includeActivityMap = false) {
  const teacherCover = cover.audience === "teacher";
  const pdf = await PDFDocument.create(); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89]; const margin = 54; let page = pdf.addPage(pageSize); let y = pageSize[1] - margin;
  const addPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
  const draw = (text: string, size: number, isBold = false, color = rgb(0.09, 0.17, 0.19), indent = 0, gap = 5) => {
    const font = isBold ? bold : regular; const lines = wrapText(text, pageSize[0] - margin * 2 - indent, size, font); const lineHeight = size * 1.38;
    if (y - lines.length * lineHeight < margin + 28) addPage();
    for (const line of lines) { page.drawText(line, { x: margin + indent, y, size, font, color }); y -= lineHeight; } y -= gap;
  };
  page.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: rgb(1, .98, .93) }); page.drawRectangle({ x: 0, y: 0, width: 18, height: pageSize[1], color: rgb(.15, .5, .57) }); page.drawCircle({ x: 550, y: 790, size: 72, color: rgb(.94, .43, .34), opacity: .9 });
  page.drawText(teacherCover ? "ADAPTA  ·  GUÍA DOCENTE" : "ADAPTA  ·  RECURSO EDUCATIVO", { x: 48, y: 785, size: 10, font: bold, color: rgb(.15, .5, .57) });
  const coverTitle = pdfSafe(cover.subject || "Mi recurso anual"); wrapText(coverTitle, 470, 30, bold).slice(0, 2).forEach((line, index) => page.drawText(line, { x: 48, y: 742 - index * 36, size: 30, font: bold, color: rgb(.09, .17, .19) }));
  page.drawText(teacherCover ? "Evaluar con claridad" : "Aprendo a mi manera", { x: 48, y: 662, size: 17, font: bold, color: rgb(.94, .34, .25) });
  const coverEmbedded = coverImage.type === "png" ? await pdf.embedPng(coverImage.bytes) : await pdf.embedJpg(coverImage.bytes); const coverScale = Math.min(470 / coverEmbedded.width, 405 / coverEmbedded.height); const coverWidth = coverEmbedded.width * coverScale; const coverHeight = coverEmbedded.height * coverScale; page.drawRectangle({ x: (pageSize[0] - coverWidth) / 2 - 7, y: 222 - 7, width: coverWidth + 14, height: coverHeight + 14, color: rgb(1, 1, 1), borderColor: rgb(.82, .73, .59), borderWidth: 1 }); page.drawImage(coverEmbedded, { x: (pageSize[0] - coverWidth) / 2, y: 222, width: coverWidth, height: coverHeight });
  page.drawRectangle({ x: 42, y: 65, width: 511, height: 112, color: rgb(.93, .97, .95) }); page.drawRectangle({ x: 42, y: 65, width: 7, height: 112, color: rgb(.15, .5, .57) }); page.drawText(pdfSafe(cover.student || title), { x: 65, y: 128, size: 15, font: bold, color: rgb(.09, .17, .19), maxWidth: 460 }); page.drawText(pdfSafe([cover.course, cover.academicYear].filter(Boolean).join("  ·  ")), { x: 65, y: 96, size: 10, font: regular, color: rgb(.33, .44, .46) });
  addPage(); draw(title, 24, true, rgb(0.94, 0.34, 0.25), 0, 7); draw("Recurso adaptado", 12, true, rgb(0.15, 0.5, 0.57), 0, 22);
  let firstHeading = true; let imageIndex = 0; const activityLocations: Array<{ code: string; title: string; page: number }> = [];
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { if (y < pageSize[1] - margin - 20) addPage(); continue; }
    if (block.type === "image") {
      const image = images[imageIndex++];
      if (image) { const embedded = image.type === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes); const scale = Math.min((pageSize[0] - margin * 2) / embedded.width, 245 / embedded.height, 1); const width = embedded.width * scale; const height = embedded.height * scale; if (y - height < margin + 28) addPage(); page.drawRectangle({ x: margin - 6, y: y - height - 6, width: pageSize[0] - margin * 2 + 12, height: height + 12, color: rgb(0.94, 0.98, 0.97), borderColor: rgb(0.55, 0.76, 0.72), borderWidth: 1 }); page.drawImage(embedded, { x: (pageSize[0] - width) / 2, y: y - height, width, height }); y -= height + 18; }
    } else if (block.type === "card") {
      const cardWidth = pageSize[0] - margin * 2 - 36; const cardLines = wrapText(block.text, cardWidth - 32, 12, bold); const cardHeight = Math.max(86, cardLines.length * 18 + 50); if (y - cardHeight < margin + 28) addPage(); const cardX = margin + 18; const cardBottom = y - cardHeight;
      page.drawRectangle({ x: cardX, y: cardBottom, width: cardWidth, height: cardHeight, color: rgb(1, 0.96, 0.84), borderColor: rgb(0.88, 0.6, 0.18), borderWidth: 1.5, borderDashArray: [6, 4] }); page.drawText("RECORTA ESTA TARJETA", { x: cardX + 16, y: y - 21, size: 8, font: bold, color: rgb(0.63, 0.42, 0.07) });
      cardLines.forEach((line, index) => { const lineWidth = bold.widthOfTextAtSize(line, 12); page.drawText(line, { x: cardX + Math.max(16, (cardWidth - lineWidth) / 2), y: y - 49 - index * 18, size: 12, font: bold, color: rgb(0.09, 0.17, 0.19) }); }); y = cardBottom - 20;
    } else if (block.type === "match") {
      const leftLines = wrapText(block.text, 190, 10.5, regular); const rightLines = wrapText(block.second || "", 190, 10.5, regular); const boxHeight = Math.max(42, Math.max(leftLines.length, rightLines.length) * 15 + 18); if (y - boxHeight < margin + 28) addPage();
      page.drawRectangle({ x: margin, y: y - boxHeight, width: 205, height: boxHeight, color: rgb(0.96, 0.98, 1), borderColor: rgb(0.38, 0.58, 0.74), borderWidth: 1 }); page.drawRectangle({ x: pageSize[0] - margin - 205, y: y - boxHeight, width: 205, height: boxHeight, color: rgb(1, 0.97, 0.91), borderColor: rgb(0.9, 0.55, 0.25), borderWidth: 1 });
      leftLines.forEach((line, index) => page.drawText(line, { x: margin + 10, y: y - 18 - index * 15, size: 10.5, font: regular, color: rgb(0.18, 0.25, 0.26) })); rightLines.forEach((line, index) => page.drawText(line, { x: pageSize[0] - margin - 195, y: y - 18 - index * 15, size: 10.5, font: regular, color: rgb(0.18, 0.25, 0.26) })); y -= boxHeight + 18;
    } else if (block.type === "checkbox") {
      if (y < margin + 35) addPage(); page.drawRectangle({ x: margin + 8, y: y - 2, width: 11, height: 11, borderColor: rgb(0.15, 0.5, 0.57), borderWidth: 1.5 }); draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 28, 7);
    } else if (block.type === "tableRow") {
      const cells = block.cells?.length ? block.cells : [block.text]; const rubricHeader = cells.some((cell) => /^(Excelente|Bien|En proceso|Necesita apoyo|Todavía no|Observaciones)/i.test(cell)); const tableWidth = pageSize[0] - margin * 2; const columnWidth = tableWidth / cells.length; const cellLines = cells.map((cell) => wrapText(cell, columnWidth - 12, cells.length >= 5 ? 7.1 : 8.2, regular)); const lineHeight = cells.length >= 5 ? 9.4 : 11; const rowHeight = Math.max(30, Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 14); if (y - rowHeight < margin + 28) addPage(); const rowTop = y; cells.forEach((cell, cellIndex) => { const cellX = margin + cellIndex * columnWidth; const fill = cellIndex === 0 ? rgb(.86, .9, .97) : cellIndex === 1 && cells.length >= 5 ? rgb(.82, .93, .75) : cellIndex === 2 && cells.length >= 5 ? rgb(1, .91, .66) : cellIndex === 3 && cells.length >= 5 ? rgb(.98, .78, .57) : cellIndex === 4 && cells.length >= 5 ? rgb(.96, .49, .58) : rgb(.98, .99, .98); page.drawRectangle({ x: cellX, y: rowTop - rowHeight, width: columnWidth, height: rowHeight, color: fill, borderColor: rgb(.76, .79, .78), borderWidth: .65 }); cellLines[cellIndex].forEach((line, lineIndex) => page.drawText(line, { x: cellX + 6, y: rowTop - 12 - lineIndex * lineHeight, size: cells.length >= 5 ? 7.1 : 8.2, font: cellIndex === 0 || rubricHeader ? bold : regular, color: rgb(.12, .17, .18) })); }); y -= rowHeight;
    } else if (block.type === "heading") { if (!firstHeading && block.level === 1 && y < pageSize[1] - margin - 80) addPage(); firstHeading = false; const activityHeading = /actividad|producto final|demuestro|repaso|juego|taller/i.test(block.text); if (activityHeading && y < pageSize[1] - margin - 30) y -= 26; else y -= block.level === 1 ? 10 : 4; if (activityHeading) { if (y < margin + 90) addPage(); page.drawRectangle({ x: margin - 8, y: y - 8, width: pageSize[0] - margin * 2 + 16, height: 30, color: rgb(0.99, 0.9, 0.84), borderColor: rgb(0.9, 0.62, 0.52), borderWidth: .8 }); } const activityCode = block.text.match(/\[(ACT-[A-Z0-9-]+)\]/i)?.[1]?.toUpperCase(); if (activityCode && !activityLocations.some((item) => item.code === activityCode)) activityLocations.push({ code: activityCode, title: block.text.replace(/\[ACT-[A-Z0-9-]+\]\s*/i, "").trim(), page: pdf.getPageCount() }); draw(block.text, block.level === 1 ? 18 : block.level === 2 ? 15 : 12, true, block.level === 1 ? rgb(0.15, 0.5, 0.57) : rgb(0.09, 0.17, 0.19), 0, activityHeading ? 12 : 8); }
    else if (block.type === "bullet") draw(`- ${block.text}`, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 4);
    else if (block.type === "number") { y -= 7; draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 13); }
    else draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 0, 12);
  }
  if (includeActivityMap && activityLocations.length) {
    addPage(); draw("Mapa de localización de actividades evaluables", 18, true, rgb(0.15, 0.5, 0.57), 0, 10); draw("Las páginas se corresponden con la numeración real de este PDF. Utiliza el código en las rúbricas, pruebas y matrices de trazabilidad.", 10.5, false, rgb(0.18, 0.25, 0.26), 0, 16);
    for (const item of activityLocations) draw(item.code + " · página " + item.page + " · " + item.title, 10.5, true, rgb(0.09, 0.17, 0.19), 0, 8);
  }
  for (let index = 0; index < pdf.getPageCount(); index += 1) { const current = pdf.getPage(index); const label = `${index + 1} / ${pdf.getPageCount()}`; current.drawText(label, { x: pageSize[0] - margin - regular.widthOfTextAtSize(label, 8), y: 24, size: 8, font: regular, color: rgb(0.45, 0.5, 0.5) }); }
  return pdf.save();
}

async function readStoredFile(storageKey: string) {
  const { FILES } = runtime(); const parts: ArrayBuffer[] = [];
  if (storageKey.startsWith("chunks:")) { const listed = await FILES.list({ prefix: storageKey.slice(7) }); for (const entry of [...listed.objects].sort((a, b) => a.key.localeCompare(b.key))) { const part = await FILES.get(entry.key); if (part) parts.push(await part.arrayBuffer()); } }
  else { const object = await FILES.get(storageKey); if (object) parts.push(await object.arrayBuffer()); }
  return new Uint8Array(await new Blob(parts).arrayBuffer());
}

function requiredImages(markdown: string) {
  const needs = new Map<number, number>(); const matches = [...markdown.matchAll(/^# Unidad\s+(\d+)\s*:/gim)];
  for (const [index, match] of matches.entries()) { const chapter = markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length); needs.set(Number(match[1]), (chapter.match(/^\[IMAGEN:\s*.+\]$/gim) || []).length); }
  return needs;
}

async function sourceImages(jobId: string, owner: string, requested: number[] = [], needs = new Map<number, number>()) {
  const rows = await runtime().DB.prepare("SELECT content_type, storage_key FROM job_files WHERE job_id = ? AND owner_email = ? AND category = 'unidades' ORDER BY created_at").bind(jobId, owner).all<{ content_type: string; storage_key: string }>();
  const selected: Array<SourceImage | null> = []; const seenImages = new Set<string>();
  for (const [index, row] of rows.results.entries()) {
    const unitNumber = index + 1; if (requested.length && !requested.includes(unitNumber)) continue; const needed = needs.get(unitNumber) || 0; if (!needed) continue;
    try {
      const bytes = await readStoredFile(row.storage_key);
      if (/image\/jpe?g/i.test(row.content_type)) { selected.push({ bytes, width: 1200, height: 800, type: "jpg" }, ...Array(Math.max(0, needed - 1)).fill(null)); continue; }
      if (/image\/png/i.test(row.content_type)) { selected.push({ bytes, width: 1200, height: 800, type: "png" }, ...Array(Math.max(0, needed - 1)).fill(null)); continue; }
      if (!/pdf/i.test(row.content_type)) { selected.push(...Array(needed).fill(null)); continue; }
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true }); const candidates: SourceImage[] = [];
      for (const [, object] of source.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream)) continue;
        const subtype = object.dict.get(PDFName.of("Subtype")); const filter = object.dict.get(PDFName.of("Filter"));
        if (String(subtype) !== "/Image") continue;
        const width = object.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() || 0; const height = object.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() || 0;
        const ratio = width / height; const colorSpace = String(object.dict.get(PDFName.of("ColorSpace"))); const hasMask = object.dict.has(PDFName.of("SMask")) || object.dict.has(PDFName.of("Mask")); const looksLikePage = width * height > 1500000 && ratio > .64 && ratio < .78; const filterName = String(filter);
        if (width < 240 || height < 160 || ratio < .28 || ratio > 3.6 || looksLikePage || colorSpace === "/DeviceGray" || colorSpace === "/DeviceCMYK") continue;
        if (filterName.includes("/DCTDecode") && !hasMask) { const jpegBytes = object.getContents(); if (isUsefulJpeg(jpegBytes)) candidates.push({ bytes: jpegBytes, width, height, type: "jpg" }); }
        else if (filterName.includes("/FlateDecode") && width * height <= 5000000) {
          const decoded = decodePDFRawStream(object).decode(); const pixels = width * height; const rgba = new Uint8Array(pixels * 4); if (colorSpace !== "/DeviceRGB" || decoded.length < pixels * 3) continue; let colored = 0; let visible = 0;
          const softMask = object.dict.lookupMaybe(PDFName.of("SMask"), PDFRawStream); let alpha: Uint8Array | null = null; if (softMask) { try { const decodedMask = decodePDFRawStream(softMask).decode(); if (decodedMask.length >= pixels) alpha = decodedMask; } catch { alpha = null; } }
          for (let pixel = 0; pixel < pixels; pixel += 1) { const red = decoded[pixel * 3]; const green = decoded[pixel * 3 + 1]; const blue = decoded[pixel * 3 + 2]; rgba[pixel * 4] = red; rgba[pixel * 4 + 1] = green; rgba[pixel * 4 + 2] = blue; rgba[pixel * 4 + 3] = alpha?.[pixel] ?? 255; if (Math.max(red, green, blue) - Math.min(red, green, blue) > 12) colored += 1; if (red + green + blue < 735 && (alpha?.[pixel] ?? 255) > 20) visible += 1; }
          if (colored / pixels < .025 || visible / pixels < .06 || isDecorativeTexture(rgba, width, height)) continue;
          candidates.push({ bytes: new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0)), width, height, type: "png" });
        }
      }
      const localFingerprints = new Set<string>(); const unique = candidates.filter((candidate) => { const fingerprint = imageFingerprint(candidate); if (localFingerprints.has(fingerprint) || seenImages.has(fingerprint)) return false; localFingerprints.add(fingerprint); return true; }).sort((left, right) => right.width * right.height - left.width * left.height);
      const chosen = unique.slice(0, needed); chosen.forEach((image) => seenImages.add(imageFingerprint(image))); selected.push(...chosen, ...Array(Math.max(0, needed - chosen.length)).fill(null));
    } catch { selected.push(...Array(needed).fill(null)); /* Un PDF sin imágenes utilizables no desplaza imágenes de otra UDI. */ }
  }
  return selected;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const job = await runtime().DB.prepare("SELECT title, result, kind, student_name AS student, current_course AS course, subject, academic_year AS academicYear FROM jobs WHERE id = ? AND owner_email = ? AND status = 'completed'").bind(id, owner).first<{ title: string; result: string; kind: string; student?: string; course?: string; subject?: string; academicYear?: string }>();
  if (!job?.result) return jsonError("El documento aún no está disponible.", 404);
  const url = new URL(request.url); const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf"; const requested = (url.searchParams.get("units") || "").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0); const scopeValue = url.searchParams.get("scope"); const scope: DownloadScope = scopeValue === "student" || scopeValue === "teacher" ? scopeValue : "all"; const repaired = repairEvaluationLabels(clarifyAmbiguousActivities(repairIndex(job.result))); const scoped = resourceForScope(repaired, requested, scope); const result = studentSafeMarkdown(scoped); const unitSuffix = requested.length ? `-UDI-${requested.join("-")}` : ""; const scopeSuffix = scope === "student" ? "-Alumnado" : scope === "teacher" ? "-Docente" : "-Completo"; const displayTitle = job.kind === "reinforcement" && scope === "student" ? "Mi recurso de aprendizaje" : job.title; const filename = `${safeFilename(displayTitle)}${unitSuffix}${scopeSuffix}`; const safeMode = url.searchParams.get("safe") === "1"; let images: Array<SourceImage | null> = []; if (!safeMode) { try { images = await sourceImages(id, owner, requested, requiredImages(result)); } catch { images = []; } } const fallbackCover = generatedFallbackCover; let coverImage = images.find((image): image is SourceImage => Boolean(image)) || fallbackCover(); const cover: CoverDetails = { subject: job.subject, student: job.student, course: job.course, academicYear: job.academicYear, audience: scope };
  if (format === "docx") { let blob: Blob; try { blob = await makeWord(displayTitle, result, images, cover, coverImage); } catch { coverImage = fallbackCover(); blob = await makeWord(displayTitle, result, images.map(() => null), cover, coverImage); } return new Response(blob, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename}.docx"`, "Cache-Control": "private, no-store" } }); }
  let bytes: Uint8Array; try { bytes = await makePdf(displayTitle, result, images, cover, coverImage, scope !== "student"); } catch { coverImage = fallbackCover(); bytes = await makePdf(displayTitle, result, images.map(() => null), cover, coverImage, scope !== "student"); } const body = bytes.slice().buffer as ArrayBuffer;  return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
}
