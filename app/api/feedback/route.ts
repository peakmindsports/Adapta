import { activeOwnerFrom, authenticationError, ensureSchema, isSiteAdmin, jsonError, runtime } from "../_shared";

const categories = new Set(["Funcionamiento", "Diseño y accesibilidad", "Adaptaciones", "Proyectos", "Documentos y descargas", "Otra"]);
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RESOURCES = 2;
const MAX_RESOURCE_BYTES = 40 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedResourceTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "archivo";
const validResource = (file: File) => allowedResourceTypes.has(file.type) || /\.(pdf|docx)$/i.test(file.name);

export async function POST(request: Request) {
  await ensureSchema();
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const form = await request.formData();
  const category = String(form.get("category") || "Otra").trim();
  const message = String(form.get("message") || "").trim();
  const images = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  const resources = form.getAll("resources").filter((item): item is File => item instanceof File && item.size > 0);
  if (!categories.has(category) || message.length < 10 || message.length > 3000) return jsonError("Escribe una propuesta de entre 10 y 3000 caracteres.");
  if (images.length > MAX_IMAGES) return jsonError(`Puedes adjuntar un máximo de ${MAX_IMAGES} imágenes.`);
  if (images.some((image) => !allowedImageTypes.has(image.type) || image.size > MAX_IMAGE_BYTES)) return jsonError("Cada imagen debe ser JPG, PNG, WEBP o GIF y ocupar como máximo 8 MB.");
  if (resources.length > MAX_RESOURCES) return jsonError(`Puedes adjuntar un máximo de ${MAX_RESOURCES} recursos generados.`);
  if (resources.some((resource) => !validResource(resource) || resource.size > MAX_RESOURCE_BYTES)) return jsonError("Cada recurso debe ser PDF o Word (.docx) y ocupar como máximo 40 MB.");

  const proposal = { id: crypto.randomUUID(), owner, category, message, createdAt: Date.now() };
  await runtime().DB.prepare("INSERT INTO improvement_proposals (id, owner_email, category, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(proposal.id, owner, category, message, proposal.createdAt).run();
  try {
    await Promise.all([
      ...images.map((file, index) => ({ file, key: `feedback/${proposal.id}/images/${index + 1}-${safeFilename(file.name)}`, kind: "image" })),
      ...resources.map((file, index) => ({ file, key: `feedback/${proposal.id}/resources/${index + 1}-${safeFilename(file.name)}`, kind: "resource" })),
    ].map(({ file, key, kind }) => runtime().FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || (kind === "resource" ? "application/octet-stream" : "image/jpeg") },
      customMetadata: { owner, proposalId: proposal.id, filename: file.name, kind },
    })));
  } catch (error) {
    await runtime().DB.prepare("DELETE FROM improvement_proposals WHERE id = ?").bind(proposal.id).run();
    throw error;
  }
  return Response.json({ saved: true, proposal, imageCount: images.length, resourceCount: resources.length }, { status: 201 });
}

export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar las propuestas.", 403);
  const url = new URL(request.url);
  const attachmentKey = url.searchParams.get("attachment") || url.searchParams.get("image");
  if (attachmentKey) {
    if (!attachmentKey.startsWith("feedback/") || attachmentKey.includes("..")) return jsonError("Archivo no válido.", 400);
    const object = await runtime().FILES.get(attachmentKey);
    if (!object) return jsonError("Archivo no encontrado.", 404);
    const filename = object.customMetadata?.filename || attachmentKey.split("/").pop() || "adjunto";
    const disposition = object.customMetadata?.kind === "resource" ? "attachment" : "inline";
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("Cache-Control", "private, max-age=300"); headers.set("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return new Response(object.body, { headers });
  }

  const rows = await runtime().DB.prepare("SELECT id, owner_email AS ownerEmail, category, message, status, created_at AS createdAt FROM improvement_proposals ORDER BY created_at DESC").all();
  if (url.searchParams.get("format") === "csv") {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Fecha", "Correo", "Categoría", "Propuesta", "Estado"].map(escape).join(";"),
      ...rows.results.map((row: any) => [new Date(row.createdAt).toISOString(), row.ownerEmail, row.category, row.message, row.status].map(escape).join(";")),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="propuestas-mejora-adapta-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const proposals = await Promise.all(rows.results.map(async (row: any) => {
    const listed = await runtime().FILES.list({ prefix: `feedback/${row.id}/`, include: ["customMetadata"] });
    return { ...row, attachments: listed.objects.map((object) => ({ key: object.key, name: object.customMetadata?.filename || object.key.split("/").pop() || "Archivo", kind: object.customMetadata?.kind || "image" })) };
  }));
  return Response.json({ proposals });
}
export async function PATCH(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede revisar las propuestas.", 403);
  const body = await request.json() as { id?: string; status?: string };
  const id = body.id?.trim();
  if (!id || body.status !== "reviewed") return jsonError("Petición no válida.", 400);
  const result = await runtime().DB.prepare("UPDATE improvement_proposals SET status = 'reviewed' WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return jsonError("Propuesta no encontrada.", 404);
  return Response.json({ id, status: "reviewed" });
}
