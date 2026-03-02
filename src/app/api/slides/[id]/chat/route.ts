// POST /api/slides/:id/chat — start or continue a chat on selected text

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSlide, createChat, getChatMessages, addChatMessage } from "@/lib/db/queries";
import { createSSEStream, SSE_HEADERS } from "@/lib/generate-slide";

const CHAT_MODEL = process.env.CHAT_MODEL || "anthropic/claude-haiku-4-5";

const anthropic = new Anthropic({
  baseURL: "https://openrouter.ai/api",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { chatId, selectedText, blockId, message } = await req.json();

  const node = getSlide(id);
  if (!node) return Response.json({ error: "Slide not found" }, { status: 404 });

  // Create or get chat
  let activeChatId = chatId;
  if (!activeChatId) {
    if (!selectedText) return Response.json({ error: "Missing selectedText for new chat" }, { status: 400 });
    activeChatId = createChat(id, selectedText, blockId || null);
  }

  // Save user message
  const userMsg = message || `Explain this: "${selectedText}"`;
  addChatMessage(activeChatId, "user", userMsg);

  // Build messages for Claude
  const existingMessages = getChatMessages(activeChatId);
  const claudeMessages: Anthropic.MessageParam[] = existingMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const slideContext = `You are helping the user understand a learning slide titled "${node.slide.title || "Untitled"}". The user selected the text: "${selectedText || ""}" and is asking about it. Keep answers concise (2-3 sentences). Be direct and educational.`;

  const stream = createSSEStream(async (send) => {
    send({ type: "status", message: "Thinking..." });

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: slideContext,
      messages: claudeMessages,
    });

    let assistantText = "";
    for (const block of response.content) {
      if (block.type === "text") assistantText += block.text;
    }

    addChatMessage(activeChatId, "assistant", assistantText);

    send({
      type: "chat_response",
      chatId: activeChatId,
      content: assistantText,
    } as any);
    send({ type: "done", chatId: activeChatId } as any);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
