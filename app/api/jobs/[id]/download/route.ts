import { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ensureSchema, jsonError, ownerFrom, runtime, safeFilename } from "../../../_shared";

type Block = { type: "heading" | "bullet" | "number" | "paragraph" | "break"; text: string; level?: number };

function cleanMarkdown(value: string) {
  return value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^>\s?/, "").trim();
}

function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []; let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: cleanMarkdown(paragraph.join(" ")) }); paragraph = []; };
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const line = raw.trim(); if (!line) { flush(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/); const bullet = line.match(/^[-*+]\s+(.+)$/); const number = line.match(/^\d+[.)]\s+(.+)$/);
    if (heading) { flush(); blocks.push({ type: "heading", text: cleanMarkdown(heading[2]), level: Math.min(3, heading[1].length) }); }
    else if (bullet) { flush(); blocks.push({ type: "bullet", text: cleanMarkdown(bullet[1]) }); }
    else if (number) { flush(); blocks.push({ type: "number", text: cleanMarkdown(number[1]) }); }
    else if (/^---+$/.test(line)) { flush(); blocks.push({ type: "break", text: "" }); }
    else paragraph.push(line);
  }
  flush(); return blocks.filter((block) => block.type === "break" || block.text);
}

async function makeWord(title: string, markdown: string) {
  const children: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 240 } }), new Paragraph({ children: [new TextRun({ text: "Libro adaptado", color: "277F91", size: 24 })], spacing: { after: 360 } })];
  let firstHeading = true;
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (block.type === "heading") {
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

async function makePdf(title: string, markdown: string) {
  const pdf = await PDFDocument.create(); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89]; const margin = 54; let page = pdf.addPage(pageSize); let y = pageSize[1] - margin;
  const addPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
  const draw = (text: string, size: number, isBold = false, color = rgb(0.09, 0.17, 0.19), indent = 0, gap = 5) => {
    const font = isBold ? bold : regular; const lines = wrapText(text, pageSize[0] - margin * 2 - indent, size, font); const lineHeight = size * 1.38;
    if (y - lines.length * lineHeight < margin + 28) addPage();
    for (const line of lines) { page.drawText(line, { x: margin + indent, y, size, font, color }); y -= lineHeight; } y -= gap;
  };
  draw(title, 24, true, rgb(0.94, 0.34, 0.25), 0, 7); draw("Libro adaptado", 12, true, rgb(0.15, 0.5, 0.57), 0, 22);
  let firstHeading = true;
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "break") { if (y < pageSize[1] - margin - 20) addPage(); continue; }
    if (block.type === "heading") { if (!firstHeading && block.level === 1 && y < pageSize[1] - margin - 80) addPage(); firstHeading = false; y -= block.level === 1 ? 10 : 4; draw(block.text, block.level === 1 ? 18 : block.level === 2 ? 15 : 12, true, block.level === 1 ? rgb(0.15, 0.5, 0.57) : rgb(0.09, 0.17, 0.19), 0, 8); }
    else if (block.type === "bullet") draw(`- ${block.text}`, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 4);
    else if (block.type === "number") draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 12, 4);
    else draw(block.text, 10.5, false, rgb(0.18, 0.25, 0.26), 0, 8);
  }
  for (let index = 0; index < pdf.getPageCount(); index += 1) { const current = pdf.getPage(index); const label = `${index + 1} / ${pdf.getPageCount()}`; current.drawText(label, { x: pageSize[0] - margin - regular.widthOfTextAtSize(label, 8), y: 24, size: 8, font: regular, color: rgb(0.45, 0.5, 0.5) }); }
  return pdf.save();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT title, result FROM jobs WHERE id = ? AND owner_email = ? AND status = 'completed'").bind(id, owner).first<{ title: string; result: string }>();
  if (!job?.result) return jsonError("El documento aún no está disponible.", 404);
  const format = new URL(request.url).searchParams.get("format") === "docx" ? "docx" : "pdf"; const filename = safeFilename(job.title);
  if (format === "docx") { const blob = await makeWord(job.title, job.result); return new Response(blob, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename}.docx"`, "Cache-Control": "private, no-store" } }); }
  const bytes = await makePdf(job.title, job.result); const body = bytes.slice().buffer as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
}
