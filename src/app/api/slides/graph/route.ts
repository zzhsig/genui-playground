// GET /api/slides/graph — return all slides and relationships for graph visualization

import { db, schema } from "@/lib/db";

export async function GET() {
  const nodes = db
    .select({
      id: schema.slides.id,
      title: schema.slides.title,
      parentId: schema.slides.parentId,
    })
    .from(schema.slides)
    .all();

  const links = db
    .select({
      from: schema.slideLinks.fromSlideId,
      to: schema.slideLinks.toSlideId,
    })
    .from(schema.slideLinks)
    .all();

  return Response.json({ nodes, links });
}
