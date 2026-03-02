// Shared generation logic used by all slide-generating endpoints

import Anthropic from "@anthropic-ai/sdk";
import { tools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { postProcessSlide } from "./post-processors";
import { webSearch } from "./search";
import type { UISlide, SSEEvent, ConversationMessage } from "./types";

export const SLIDE_MODEL = process.env.SLIDE_MODEL || "anthropic/claude-sonnet-4-6";

const anthropic = new Anthropic({
  baseURL: "https://openrouter.ai/api",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export type SendFn = (event: SSEEvent) => void;

export interface GenerationResult {
  slide: UISlide;
  conversationHistory: ConversationMessage[];
}

// ── History Trimming ──

function trimHistory(history: ConversationMessage[]): ConversationMessage[] {
  // 6 or fewer messages: pass as-is (safe for ~2 turns)
  if (history.length <= 6) return history;

  // Find a safe split point: we want to keep the tail as raw messages.
  // A "safe" tail start is a user message with text content (not tool_result),
  // so we don't orphan tool_use/tool_result pairs.
  // Walk backwards to find the start of the last 2 complete exchanges.
  let tailStart = history.length;
  let userTextCount = 0;
  for (let i = history.length - 1; i >= 1; i--) {
    const msg = history[i];
    if (msg.role === "user") {
      const content = msg.content;
      const isToolResult = Array.isArray(content) && content.some(
        (b: any) => typeof b === "object" && b !== null && b.type === "tool_result"
      );
      if (!isToolResult) {
        userTextCount++;
        tailStart = i;
        if (userTextCount >= 2) break;
      }
    }
  }

  // If we can't find a good split, return as-is
  if (tailStart <= 1) return history;

  const first = history[0]; // keep first user message (topic context)
  const tail = history.slice(tailStart); // keep raw (includes tool_use/tool_result pairs intact)
  const middle = history.slice(1, tailStart);

  // Summarize middle into a single assistant message
  const summaryParts: string[] = [];
  for (const msg of middle) {
    if (msg.role === "assistant") {
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === "object" && block !== null && "type" in block) {
            if ((block as any).type === "tool_use" && (block as any).name === "render_slide") {
              const title = (block as any).input?.slide?.title || "Untitled";
              summaryParts.push(`- Generated slide: "${title}"`);
            } else if ((block as any).type === "tool_use" && (block as any).name === "web_search") {
              summaryParts.push(`- Searched: "${(block as any).input?.query || ""}"`);
            }
          }
        }
      }
    } else if (msg.role === "user" && typeof msg.content === "string") {
      summaryParts.push(`- User asked: "${msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content}"`);
    }
  }

  if (summaryParts.length === 0) return history;

  // Build: [first user msg] [assistant summary] [tail messages...]
  const summary: ConversationMessage = {
    role: "assistant",
    content: `[Previous slides in this session:\n${summaryParts.join("\n")}]`,
  };

  return [first, summary, ...tail];
}

// ── Main Generation (streaming) ──

const PARTIAL_THROTTLE_MS = 150;

export async function generateSlide(
  prompt: string,
  conversationHistory: ConversationMessage[],
  send: SendFn,
): Promise<GenerationResult | null> {
  const systemPrompt = buildSystemPrompt();
  const trimmed = trimHistory(conversationHistory);
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of trimmed) {
    messages.push({ role: msg.role, content: msg.content as Anthropic.MessageParam["content"] });
  }

  messages.push({ role: "user", content: prompt });
  send({ type: "status", message: "Thinking..." });

  let resultSlide: UISlide | null = null;

  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let currentToolName = "";
    let lastPartialTime = 0;
    let pendingPartial: UISlide | null = null;
    let partialTimer: ReturnType<typeof setTimeout> | null = null;

    const stream = anthropic.messages.stream({
      model: SLIDE_MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages,
      tools: tools as any,
    });

    // Stream text (thinking) as it arrives for better TTFT
    stream.on("text", (text) => {
      if (text.trim()) {
        send({ type: "thinking", text });
      }
    });

    // Track which tool is currently streaming
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        currentToolName = event.content_block.name;
        if (currentToolName === "render_slide") {
          send({ type: "status", message: "Building slide..." });
        }
      }
    });

    // Stream partial slide data with throttling
    stream.on("inputJson", (_delta, snapshot) => {
      if (currentToolName !== "render_slide") return;

      try {
        const slideData = (snapshot as any)?.slide;
        if (!slideData) return;

        // Filter blocks to only those with id + type (complete enough to render)
        const blocks = Array.isArray(slideData.blocks)
          ? slideData.blocks.filter((b: any) => b && b.id && b.type)
          : [];

        const partial: UISlide = {
          id: slideData.id || "partial",
          title: slideData.title,
          subtitle: slideData.subtitle,
          background: slideData.background,
          dark: slideData.dark,
          blocks,
          actions: Array.isArray(slideData.actions)
            ? slideData.actions.filter((a: any) => a && a.label && a.prompt)
            : undefined,
        };

        // Throttle: max 1 partial per PARTIAL_THROTTLE_MS
        const now = Date.now();
        if (now - lastPartialTime >= PARTIAL_THROTTLE_MS) {
          lastPartialTime = now;
          send({ type: "slide_partial", slide: partial });
        } else {
          // Coalesce: store pending and send on timer
          pendingPartial = partial;
          if (!partialTimer) {
            partialTimer = setTimeout(() => {
              if (pendingPartial) {
                lastPartialTime = Date.now();
                send({ type: "slide_partial", slide: pendingPartial });
                pendingPartial = null;
              }
              partialTimer = null;
            }, PARTIAL_THROTTLE_MS - (now - lastPartialTime));
          }
        }
      } catch {
        // partial parse errors are expected, ignore
      }
    });

    const response = await stream.finalMessage();

    // Clear any pending partial timer
    if (partialTimer) {
      clearTimeout(partialTimer);
      partialTimer = null;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        if (block.name === "render_slide") {
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

    // Reset tool tracking for next turn
    currentToolName = "";
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
