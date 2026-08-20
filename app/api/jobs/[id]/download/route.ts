import { ensureSchema, jsonError, ownerFrom, runtime, safeFilename } from "../../../_shared";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSchema(); const { id } = await context.params; const owner = ownerFrom(request);
  const job = await runtime().DB.prepare("SELECT title, result FROM jobs WHERE id = ? AND owner_email = ? AND status = 'completed'").bind(id, owner).first<{ title: string; result: string }>();
  if (!job?.result) return jsonError("El documento aún no está disponible.", 404);
  return new Response(job.result, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safeFilename(job.title)}.md"`, "Cache-Control": "private, no-store" } });
}
