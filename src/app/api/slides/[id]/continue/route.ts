// POST /api/slides/:id/continue — generate main child (right arrow)

import { NextRequest } from "next/server";
import { getSlide, getSlideHistory, saveSlide } from "@/lib/db/queries";
import { generateSlide, createSSEStream, SSE_HEADERS } from "@/lib/generate-slide";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const node = getSlide(id);
  if (!node) return Response.json({ error: "Not found" }, { status: 404 });

  // If main child already exists, just return its ID
  if (node.mainChildId) {
    return Response.json({ slideId: node.mainChildId, exists: true });
  }

  const history = node.conversationHistory;
  const prompt = "Continue to the next topic in the learning sequence.";

  const stream = createSSEStream(async (send) => {
    const result = await generateSlide(prompt, history, send);
    if (!result) {
      send({ type: "error", message: "No slide generated" });
      return;
    }

    const slideId = saveSlide(result.slide, id, result.conversationHistory, true);
    send({ type: "done", slideId, conversationHistory: result.conversationHistory } as any);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
