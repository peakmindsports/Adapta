import { isSiteAdmin, ownerFrom } from "../_shared";

function fullNameFrom(request: Request) {
  const value = request.headers.get("oai-authenticated-user-full-name");
  if (!value || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function GET(request: Request) {
  const email = ownerFrom(request);
  return Response.json({ authenticated: Boolean(email), isAdmin: isSiteAdmin(request), email, displayName: fullNameFrom(request) || email });
}