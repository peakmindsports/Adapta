import { ensureSchema, jsonError, ownerFrom, runtime } from "../_shared";

export async function GET(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request);
  const rows = await runtime().DB.prepare("SELECT id, kind, title, student_name AS studentName, current_course AS currentCourse, target_course AS targetCourse, status, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE owner_email = ? ORDER BY created_at DESC LIMIT 30").bind(owner).all();
  return Response.json({ jobs: rows.results });
}

export async function POST(request: Request) {
  await ensureSchema();
  const owner = ownerFrom(request);
  const body = await request.json() as Record<string, string>;
  if (!body.kind || !["adaptation", "project"].includes(body.kind)) return jsonError("Tipo de trabajo no válido.");
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = body.kind === "adaptation" ? `Adaptación · ${body.studentName || "Sin nombre"}` : `Proyecto · ${body.theme || body.currentCourse || "Sin título"}`;
  await runtime().DB.prepare("INSERT INTO jobs (id, owner_email, kind, title, student_name, current_course, target_course, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(id, owner, body.kind, title, body.studentName || null, body.currentCourse || null, body.targetCourse || null, now, now).run();
  return Response.json({ job: { id, title, status: "draft" } }, { status: 201 });
}
