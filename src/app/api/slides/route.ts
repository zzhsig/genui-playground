// GET /api/slides — list all slides
// POST /api/slides — generate a root slide (initial prompt)

import { NextRequest } from "next/server";
import { listSlides, saveSlide } from "@/lib/db/queries";
import { generateSlide, createSSEStream, SSE_HEADERS } from "@/lib/generate-slide";

export async function GET() {
  const slides = listSlides();
  return Response.json(slides);
}

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  const stream = createSSEStream(async (send) => {
    const result = await generateSlide(prompt, [], send);
    if (!result) {
      send({ type: "error", message: "No slide generated" });
      return;
    }

    const slideId = saveSlide(result.slide, null, result.conversationHistory, false);
    send({ type: "done", slideId, conversationHistory: result.conversationHistory } as any);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
