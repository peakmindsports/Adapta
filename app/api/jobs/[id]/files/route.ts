import { authenticationError, ensureSchema, jsonError, activeOwnerFrom, runtime, safeFilename } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id: jobId } = await context.params;
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const job = await runtime().DB.prepare("SELECT id FROM jobs WHERE id = ? AND owner_email = ?").bind(jobId, owner).first();
  if (!job) return jsonError("Trabajo no encontrado.", 404);
  const form = await request.formData();
  const category = String(form.get("category") || "material");
  const uploadId = String(form.get("uploadId") || "");
  const chunkIndex = Number(form.get("chunkIndex"));
  const chunkTotal = Number(form.get("chunkTotal"));
  const originalName = String(form.get("originalName") || "archivo");
  const originalType = String(form.get("originalType") || "application/octet-stream");
  const totalSize = Number(form.get("totalSize"));
  const incoming = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!incoming.length) return jsonError("No se ha recibido ningún archivo.");
  if (incoming.length > 1) return jsonError("Envía los archivos de uno en uno.");
  if (incoming.some((file) => file.size > 1024 * 1024)) return jsonError("El fragmento supera el límite permitido.", 413);
  if (uploadId && Number.isInteger(chunkIndex) && Number.isInteger(chunkTotal)) {
    if (totalSize > 60 * 1024 * 1024) return jsonError("Cada documento debe ocupar menos de 60 MB.", 413);
    const file = incoming[0]; const prefix = `${owner}/${jobId}/chunks/${uploadId}/`; const key = `${prefix}${String(chunkIndex).padStart(4, "0")}`;
    await runtime().FILES.put(key, file.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
    if (chunkIndex === chunkTotal - 1) {
      await runtime().DB.prepare("INSERT INTO job_files (id, job_id, owner_email, category, filename, content_type, storage_key, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(uploadId, jobId, owner, category, originalName, originalType, `chunks:${prefix}`, totalSize, Date.now()).run();
    }
    return Response.json({ chunk: chunkIndex + 1, total: chunkTotal }, { status: 201 });
  }
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
