import { isSiteAdmin, ownerFrom } from "../_shared";

export async function GET(request: Request) {
  return Response.json({ isAdmin: isSiteAdmin(request), email: ownerFrom(request) });
}
