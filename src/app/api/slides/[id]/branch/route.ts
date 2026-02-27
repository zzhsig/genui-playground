// POST /api/slides/:id/branch — generate a branch child (center action)

import { NextRequest } from "next/server";
import { getSlide, saveSlide, findBranchByPrompt } from "@/lib/db/queries";
import { generateSlide, createSSEStream, SSE_HEADERS } from "@/lib/generate-slide";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prompt } = await req.json();
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  const node = getSlide(id);
  if (!node) return Response.json({ error: "Not found" }, { status: 404 });

  // If a branch with this exact prompt already exists, return it
  const existing = findBranchByPrompt(id, prompt);
  if (existing) {
    return Response.json({ slideId: existing, exists: true });
  }

  const history = node.conversationHistory;

  const stream = createSSEStream(async (send) => {
    const result = await generateSlide(prompt, history, send);
    if (!result) {
      send({ type: "error", message: "No slide generated" });
      return;
    }

    const slideId = saveSlide(result.slide, id, result.conversationHistory, false, prompt);
    send({ type: "done", slideId, conversationHistory: result.conversationHistory } as any);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
