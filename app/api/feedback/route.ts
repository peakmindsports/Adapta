import { activeOwnerFrom, authenticationError, ensureSchema, isSiteAdmin, jsonError, runtime } from "../_shared";

const categories = new Set(["Funcionamiento", "Diseño y accesibilidad", "Adaptaciones", "Proyectos", "Documentos y descargas", "Otra"]);

export async function POST(request: Request) {
  await ensureSchema();
  const owner = await activeOwnerFrom(request); if (!owner) return authenticationError();
  const body = await request.json() as { category?: string; message?: string };
  const category = body.category?.trim() || "Otra";
  const message = body.message?.trim() || "";
  if (!categories.has(category) || message.length < 10 || message.length > 3000) return jsonError("Escribe una propuesta de entre 10 y 3000 caracteres.");
  const proposal = { id: crypto.randomUUID(), owner, category, message, createdAt: Date.now() };
  await runtime().DB.prepare("INSERT INTO improvement_proposals (id, owner_email, category, message, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(proposal.id, owner, category, message, proposal.createdAt).run();
  return Response.json({ saved: true, proposal }, { status: 201 });
}

export async function GET(request: Request) {
  await ensureSchema();
  if (!isSiteAdmin(request)) return jsonError("Solo la persona administradora puede consultar las propuestas.", 403);
  const rows = await runtime().DB.prepare("SELECT id, owner_email AS ownerEmail, category, message, status, created_at AS createdAt FROM improvement_proposals ORDER BY created_at DESC").all();
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Fecha", "Correo", "Categoría", "Propuesta", "Estado"].map(escape).join(";"),
      ...rows.results.map((row: any) => [new Date(row.createdAt).toISOString(), row.ownerEmail, row.category, row.message, row.status].map(escape).join(";")),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="propuestas-mejora-adapta-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return Response.json({ proposals: rows.results });
}