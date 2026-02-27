// Shared generation logic used by all slide-generating endpoints

import Anthropic from "@anthropic-ai/sdk";
import { tools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { postProcessSlide } from "./post-processors";
import { webSearch } from "./search";
import type { UISlide, SSEEvent, ConversationMessage } from "./types";

const anthropic = new Anthropic({
  baseURL: "https://openrouter.ai/api",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export type SendFn = (event: SSEEvent) => void;

export interface GenerationResult {
  slide: UISlide;
  conversationHistory: ConversationMessage[];
}

export async function generateSlide(
  prompt: string,
  conversationHistory: ConversationMessage[],
  send: SendFn,
): Promise<GenerationResult | null> {
  const systemPrompt = buildSystemPrompt();
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content as Anthropic.MessageParam["content"] });
  }

  messages.push({ role: "user", content: prompt });
  send({ type: "status", message: "Thinking..." });

  let resultSlide: UISlide | null = null;

  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: "anthropic/claude-opus-4-6",
      max_tokens: 16384,
      system: systemPrompt,
      messages,
      tools,
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        send({ type: "thinking", text: block.text });
      } else if (block.type === "tool_use") {
        if (block.name === "render_slide") {
          send({ type: "status", message: "Building slide..." });
          const slide = postProcessSlide((block.input as any).slide as UISlide);
          resultSlide = slide;
          send({ type: "slide", slide });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Slide rendered. Wait for the user to click an action button." });
        } else if (block.name === "web_search") {
          const query = (block.input as any).query as string;
          send({ type: "status", message: `Searching: ${query}` });
          const result = await webSearch(query);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}` });
        }
      }
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn" || toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  if (!resultSlide) return null;

  const history = messages.map((m) => ({ role: m.role, content: m.content })) as ConversationMessage[];
  return { slide: resultSlide, conversationHistory: history };
}

// Create an SSE ReadableStream with a generation callback
export function createSSEStream(
  run: (send: SendFn) => Promise<void>,
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send: SendFn = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await run(send);
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Unknown error" });
      }
      controller.close();
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
