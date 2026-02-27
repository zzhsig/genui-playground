// POST /api/slides/:id/chat/:chatId/to-slide — turn chat into a new slide

import { NextRequest } from "next/server";
import { getSlide, getChatMessages, saveSlide } from "@/lib/db/queries";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateSlide, createSSEStream, SSE_HEADERS } from "@/lib/generate-slide";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id, chatId } = await params;

  const node = getSlide(id);
  if (!node) return Response.json({ error: "Slide not found" }, { status: 404 });

  // Get chat context
  const chat = db.select().from(schema.chats).where(eq(schema.chats.id, chatId)).get();
  if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });

  const messages = getChatMessages(chatId);
  const chatSummary = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const prompt = `The user was learning about "${node.slide.title || "a topic"}" and had a conversation about the text "${chat.selectedText}". Here is the chat:\n\n${chatSummary}\n\nCreate a new slide that explains this sub-topic in detail as part of the learning sequence.`;

  const history = node.conversationHistory;

  const stream = createSSEStream(async (send) => {
    const result = await generateSlide(prompt, history, send);
    if (!result) {
      send({ type: "error", message: "No slide generated" });
      return;
    }

    const slideId = saveSlide(result.slide, id, result.conversationHistory, false);
    send({ type: "done", slideId } as any);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
