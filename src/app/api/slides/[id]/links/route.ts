// POST /api/slides/:id/links — add a link to another slide
// DELETE /api/slides/:id/links — remove a link

import { NextRequest } from "next/server";
import { addLink, removeLink } from "@/lib/db/queries";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { toSlideId } = await req.json();
  if (!toSlideId) return Response.json({ error: "Missing toSlideId" }, { status: 400 });
  if (id === toSlideId) return Response.json({ error: "Cannot link to self" }, { status: 400 });

  try {
    const linkId = addLink(id, toSlideId);
    return Response.json({ id: linkId });
  } catch {
    return Response.json({ error: "Link already exists" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const { linkId } = await req.json();
  if (!linkId) return Response.json({ error: "Missing linkId" }, { status: 400 });
  removeLink(linkId);
  return Response.json({ ok: true });
}
