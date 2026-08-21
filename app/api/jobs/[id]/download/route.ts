import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { decodePDFRawStream, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts, rgb } from "pdf-lib";
import UPNG from "@pdf-lib/upng";
import { ensureSchema, jsonError, ownerFrom, runtime, safeFilename } from "../../../_shared";

type Block = { type: "heading" | "bullet" | "checkbox" | "number" | "paragraph" | "tableRow" | "card" | "break" | "image"; text: string; level?: number };
type SourceImage = { bytes: Uint8Array; width: number; height: number; type: "jpg" | "png" };

function cleanMarkdown(value: string) {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^>\s?/, "").trim();
}

function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []; let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: cleanMarkdown(paragraph.join(" ")) }); paragraph = []; };
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim(); if (!line) { flush(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/); const checkbox = line.match(/^[-*+]\s+\[\s*\]\s+(.+)$/); const bullet = line.match(/^[-*+]\s+(.+)$/); const number = line.match(/^\d+[.)]\s+(.+)$/); const image = line.match(/^\[IMAGEN:\s*(.+)\]$/i); const card = line.match(/^(?:>\s*)?\[TARJETA:\s*(.+)\]$/i);
    if (heading) { flush(); blocks.push({ type: "heading", text: cleanMarkdown(heading[2]), level: Math.min(3, heading[1].length) }); }
    else if (image) { flush(); blocks.push({ type: "image", text: cleanMarkdown(image[1]) }); }
    else if (card) { flush(); blocks.push({ type: "card", text: cleanMarkdown(card[1]) }); }
    else if (checkbox) { flush(); blocks.push({ type: "checkbox", text: cleanMarkdown(checkbox[1]) }); }
    else if (bullet) { flush(); blocks.push({ type: "bullet", text: cleanMarkdown(bullet[1]) }); }
    else if (number) { flush(); blocks.push({ type: "number", text: cleanMarkdown(number[1]) }); }
    else if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) { flush(); }
    else if (/^\|.+\|$/.test(line)) { flush(); blocks.push({ type: "tableRow", text: line.slice(1, -1).split("|").map((cell) => cleanMarkdown(cell)).filter(Boolean).join("  ·  ") }); }
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

function studentSafeMarkdown(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*(?:[-*]\s*)?\*{0,2}(?:nivel competencial(?: de trabajo)?|nivel de concreción curricular|nivel curricular|nivel educativo de adaptación)\s*:\*{0,2}/i.test(line))
    .filter((line) => !/^\s*\|[^|]*(?:nivel competencial|nivel de concreción curricular|nivel curricular|nivel educativo de adaptación)[^|]*\|/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function makeWord(title: string, markdown: string, images: SourceImage[]) {
  const children: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 240 } }), new Paragraph({ children: [new TextRun({ text: "Libro adaptado", color: "277F91", size: 24 })], spacing: { after: 360 } })];
  let firstHeading = true;
  let imageIndex = 0;
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (block.type === "image") {
      const image = images[imageIndex++];
      if (image) { const scale = Math.min(470 / image.width, 260 / image.height, 1); children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: image.type, data: image.bytes, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) } })], spacing: { before: 120, after: 140 } })); }
    } else if (block.type === "card") {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `✂  ${block.text}`, bold: true, size: 24, color: "172B30" })], shading: { fill: "FFF4D6" }, border: { top: { color: "E1A93B", style: "dashed", size: 8 }, bottom: { color: "E1A93B", style: "dashed", size: 8 }, left: { color: "E1A93B", style: "dashed", size: 8 }, right: { color: "E1A93B", style: "dashed", size: 8 } }, spacing: { before: 100, after: 100 } }));
    } else if (block.type === "checkbox") {
      children.push(new Paragraph({ children: [new TextRun({ text: "☐  ", bold: true, size: 26 }), new TextRun({ text: block.text, size: 22 })], spacing: { before: 45, after: 75 }, indent: { left: 280 } }));
    } else if (block.type === "tableRow") {
      children.push(new Paragraph({ children: [new TextRun({ text: block.text, size: 20 })], shading: { fill: "F1F8F6" }, border: { bottom: { color: "B8D8CF", style: "single", size: 4 } }, spacing: { before: 60, after: 80 } }));
    } else if (block.type === "heading") {
      if (!firstHeading && block.level === 1) children.push(new Paragraph({ children: [new PageBreak()] })); firstHeading = false;
      children.push(new Paragraph({ text: block.text, heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, spacing: { before: 180, after: 100 } }));
    } else if (block.type === "bullet") children.push(new Paragraph({ text: block.text, bullet: { level: 0 }, spacing: { after: 70 } }));
    else if (block.type === "number") children.push(new Paragraph({ text: block.text, numbering: { reference: "adaptation-numbering", level: 0 }, spacing: { after: 70 } }));
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

async function makePdf(title: string, markdown: string, images: SourceImage[]) {
  const pdf = await PDFDocument.create(); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89]; const margin = 54; let page = pdf.addPage(pageSize); let y = pageSize[1] - margin;
  const addPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
  const draw = (text: string, size: number, isBold = false, color = rgb(0.09, 0.17, 0.19), indent = 0, gap = 5) => {
    const font = isBold ? bold : regular; const lines = wrapText(text, pageSize[0] - margin * 2 - indent, size, font); const lineHeight = size * 1.38;
    if (y - lines.length * lineHeight < margin + 28) addPage();
    for (const line of lines) { page.drawText(line, { x: margin + indent, y, size, font, color }); y -= lineHeight; } y -= gap;
  };
  draw(title, 24, true, rgb(0.94, 0.34, 0.25), 0, 7); draw("Libro adaptado", 12, true, rgb(0.15, 0.5, 0.57), 0, 22);
  let firstHeading = true; let imageIndex = 0;
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { if (y < pageSize[1] - margin - 20) addPage(); continue; }
    if (block.type === "image") {
      const image = images[imageIndex++];
      if (image) { const embedded = image.type === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes); const scale = Math.min((pageSize[0] - margin * 2) / embedded.width, 245 / embedded.height, 1); const width = embedded.width * scale; const height = embedded.height * scale; if (y - height < margin + 28) addPage(); page.drawRectangle({ x: margin - 6, y: y - height - 6, width: pageSize[0] - margin * 2 + 12, height: height + 12, color: rgb(0.94, 0.98, 0.97), borderColor: rgb(0.55, 0.76, 0.72), borderWidth: 1 }); page.drawImage(embedded, { x: (pageSize[0] - width) / 2, y: y - height, width, height }); y -= height + 18; }
    } else if (block.type === "card") {
      if (y < margin + 90) addPage(); page.drawRectangle({ x: margin + 25, y: y - 62, width: pageSize[0] - margin * 2 - 50, height: 62, color: rgb(1, 0.96, 0.84), borderColor: rgb(0.88, 0.6, 0.18), borderWidth: 1.5, borderDashArray: [5, 4] }); draw(block.text, 11, true, rgb(0.15, 0.2, 0.2), 42, 18);
    } else if (block.type === "checkbox") {
      if (y < margin + 35) addPage(); page.drawRectangle({ x: margin + 8, y: y - 2, width: 11, height: 11, borderColor: rgb(0.15, 0.5, 0.57), borderWidth: 1.5 }); draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 28, 7);
    } else if (block.type === "tableRow") {
      const lines = wrapText(block.text, pageSize[0] - margin * 2 - 20, 9.5, regular); const boxHeight = Math.max(28, lines.length * 13 + 12); if (y - boxHeight < margin + 28) addPage(); page.drawRectangle({ x: margin, y: y - boxHeight + 5, width: pageSize[0] - margin * 2, height: boxHeight, color: rgb(0.95, 0.98, 0.97), borderColor: rgb(0.72, 0.84, 0.81), borderWidth: .7 }); draw(block.text, 9.5, false, rgb(0.18, 0.25, 0.26), 10, 8);
    } else if (block.type === "heading") { if (!firstHeading && block.level === 1 && y < pageSize[1] - margin - 80) addPage(); firstHeading = false; y -= block.level === 1 ? 10 : 4; if (/actividad|producto final|demuestro|repaso|juego|taller/i.test(block.text)) { if (y < margin + 55) addPage(); page.drawRectangle({ x: margin - 8, y: y - 8, width: pageSize[0] - margin * 2 + 16, height: 30, color: rgb(0.99, 0.9, 0.84) }); } draw(block.text, block.level === 1 ? 18 : block.level === 2 ? 15 : 12, true, block.level === 1 ? rgb(0.15, 0.5, 0.57) : rgb(0.09, 0.17, 0.19), 0, 8); }
    else if (block.type === "bullet") draw(`- ${block.text}`, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 4);
    else if (block.type === "number") draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 4);
    else draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 0, 8);
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
  const selected: SourceImage[] = [];
  for (const [index, row] of rows.results.entries()) {
    const unitNumber = index + 1; if (requested.length && !requested.includes(unitNumber)) continue; const needed = needs.get(unitNumber) || 0; if (!needed) continue;
    try {
      const bytes = await readStoredFile(row.storage_key);
      if (/image\/jpe?g/i.test(row.content_type)) { selected.push({ bytes, width: 1200, height: 800, type: "jpg" }); continue; }
      if (/image\/png/i.test(row.content_type)) { selected.push({ bytes, width: 1200, height: 800, type: "png" }); continue; }
      if (!/pdf/i.test(row.content_type)) continue;
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true }); const candidates: SourceImage[] = [];
      for (const [, object] of source.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream)) continue;
        const subtype = object.dict.get(PDFName.of("Subtype")); const filter = object.dict.get(PDFName.of("Filter"));
        if (String(subtype) !== "/Image") continue;
        const width = object.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() || 0; const height = object.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() || 0;
        if (width < 240 || height < 160) continue;
        if (String(filter) === "/DCTDecode") candidates.push({ bytes: object.getContents(), width, height, type: "jpg" });
        else if (String(filter) === "/FlateDecode" && width * height <= 5000000) {
          const decoded = decodePDFRawStream(object).decode(); const colorSpace = String(object.dict.get(PDFName.of("ColorSpace"))); const pixels = width * height; const rgba = new Uint8Array(pixels * 4);
          if (colorSpace === "/DeviceRGB" && decoded.length >= pixels * 3) for (let pixel = 0; pixel < pixels; pixel += 1) { rgba[pixel * 4] = decoded[pixel * 3]; rgba[pixel * 4 + 1] = decoded[pixel * 3 + 1]; rgba[pixel * 4 + 2] = decoded[pixel * 3 + 2]; rgba[pixel * 4 + 3] = 255; }
          else if (colorSpace === "/DeviceGray" && decoded.length >= pixels) for (let pixel = 0; pixel < pixels; pixel += 1) { rgba[pixel * 4] = decoded[pixel]; rgba[pixel * 4 + 1] = decoded[pixel]; rgba[pixel * 4 + 2] = decoded[pixel]; rgba[pixel * 4 + 3] = 255; }
          else continue;
          candidates.push({ bytes: new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0)), width, height, type: "png" });
        }
      }
      candidates.sort((a, b) => b.width * b.height - a.width * a.height); selected.push(...candidates.slice(0, needed));
    } catch { /* Un PDF sin imágenes JPEG utilizables no bloquea la descarga. */ }
  }
  return selected;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT title, result FROM jobs WHERE id = ? AND owner_email = ? AND status = 'completed'").bind(id, owner).first<{ title: string; result: string }>();
  if (!job?.result) return jsonError("El documento aún no está disponible.", 404);
  const url = new URL(request.url); const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf"; const requested = (url.searchParams.get("units") || "").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0); const result = studentSafeMarkdown(selectUnits(repairIndex(job.result), requested)); const suffix = requested.length ? `-UDI-${requested.join("-")}` : ""; const filename = `${safeFilename(job.title)}${suffix}`; const images = await sourceImages(id, owner, requested, requiredImages(result));
  if (format === "docx") { const blob = await makeWord(job.title, result, images); return new Response(blob, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename}.docx"`, "Cache-Control": "private, no-store" } }); }
  const bytes = await makePdf(job.title, result, images); const body = bytes.slice().buffer as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
}
