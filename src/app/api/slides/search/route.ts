// GET /api/slides/search?q=... — search slides by title

import { NextRequest } from "next/server";
import { searchSlides } from "@/lib/db/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return Response.json([]);
  const results = searchSlides(q);
  return Response.json(results);
}
