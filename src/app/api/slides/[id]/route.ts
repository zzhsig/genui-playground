// GET /api/slides/:id — get single slide with all relationships
// PATCH /api/slides/:id — update slide metadata

import { NextRequest } from "next/server";
import { getSlide } from "@/lib/db/queries";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = getSlide(id);
  if (!node) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(node);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.mainChildId !== undefined) updates.mainChildId = body.mainChildId;

  if (Object.keys(updates).length > 0) {
    db.update(schema.slides).set(updates).where(eq(schema.slides.id, id)).run();
  }

  return Response.json({ ok: true });
}
