import { activeOwnerFrom, authenticationError, ensureSchema, isSiteAdmin, jsonError, runtime } from "../_shared";

const categories = new Set(["Funcionamiento", "Diseño y accesibilidad", "Adaptaciones", "Proyectos", "Documentos y descargas", "Otra"]);
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "imagen";

export async function POST(request: Request) {
  await ensureSchema();
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const form = await request.formData();
  const category = String(form.get("category") || "Otra").trim();
  const message = String(form.get("message") || "").trim();
  const images = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (!categories.has(category) || message.length < 10 || message.length > 3000) return jsonError("Escribe una propuesta de entre 10 y 3000 caracteres.");
  if (images.length > MAX_IMAGES) return jsonError(`Puedes adjuntar un máximo de ${MAX_IMAGES} imágenes.`);
  if (images.some((image) => !allowedImageTypes.has(image.type) || image.size > MAX_IMAGE_BYTES)) return jsonError("Cada imagen debe ser JPG, PNG, WEBP o GIF y ocupar como máximo 8 MB.");

  const proposal = { id: crypto.randomUUID(), owner, category, message, createdAt: Date.now() };
  await runtime().DB.prepare("INSERT INTO improvement_proposals (id, owner_email, category, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(proposal.id, owner, category, message, proposal.createdAt).run();
  try {
    await Promise.all(images.map((image, index) => runtime().FILES.put(`feedback/${proposal.id}/${index + 1}-${safeFilename(image.name)}`, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: { owner, proposalId: proposal.id, filename: image.name },
    })));
  } catch (error) {
    await runtime().DB.prepare("DELETE FROM improvement_proposals WHERE id = ?").bind(proposal.id).run();
    throw error;
  }
  return Response.json({ saved: true, proposal, imageCount: images.length }, { status: 201 });
}

export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar las propuestas.", 403);
  const url = new URL(request.url);
  const imageKey = url.searchParams.get("image");
  if (imageKey) {
    if (!imageKey.startsWith("feedback/") || imageKey.includes("..")) return jsonError("Imagen no válida.", 400);
    const object = await runtime().FILES.get(imageKey);
    if (!object) return jsonError("Imagen no encontrada.", 404);
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("Cache-Control", "private, max-age=300");
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
    return { ...row, attachments: listed.objects.map((object) => ({ key: object.key, name: object.customMetadata?.filename || object.key.split("/").pop() || "Imagen" })) };
  }));
  return Response.json({ proposals });
}
