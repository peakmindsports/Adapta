import { ensureSchema, jsonError, ownerFrom, runtime, safeFilename } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id: jobId } = await context.params;
  const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT id FROM jobs WHERE id = ? AND owner_email = ?").bind(jobId, owner).first();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  const form = await request.formData();
  const category = String(form.get("category") || "material");
  const incoming = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!incoming.length) return jsonError("No se ha recibido ningún archivo.");
  if (incoming.length > 1) return jsonError("Envía los archivos de uno en uno.");
  if (incoming.some((file) => file.size > 8 * 1024 * 1024)) return jsonError("Cada archivo debe ocupar menos de 8 MB.", 413);
  const saved = [];
  for (const file of incoming) {
    const fileId = crypto.randomUUID();
    const key = `${owner}/${jobId}/${fileId}-${safeFilename(file.name)}`;
    await runtime().FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { owner, jobId, category, filename: file.name } });
    await runtime().DB.prepare("INSERT INTO job_files (id, job_id, owner_email, category, filename, content_type, storage_key, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(fileId, jobId, owner, category, file.name, file.type || "application/octet-stream", key, file.size, Date.now()).run();
    saved.push({ id: fileId, filename: file.name, category, size: file.size });
  }
  return Response.json({ files: saved }, { status: 201 });
}
