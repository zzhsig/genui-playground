import Anthropic from "@anthropic-ai/sdk";
import { tools } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { postProcessSlide } from "@/lib/post-processors";
import { webSearch } from "@/lib/search";
import { SLIDE_MODEL } from "@/lib/generate-slide";
import type { GenerateRequest, SSEEvent, UISlide } from "@/lib/types";

const anthropic = new Anthropic({
  baseURL: "https://openrouter.ai/api",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  const body: GenerateRequest = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const history = await runGeneration(body, send);
        send({ type: "done", conversationHistory: history });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Unknown error" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

type SendFn = (event: SSEEvent) => void;

async function runGeneration(request: GenerateRequest, send: SendFn): Promise<Anthropic.MessageParam[]> {
  const systemPrompt = buildSystemPrompt();
  const messages: Anthropic.MessageParam[] = [];

  if (request.conversationHistory) {
    for (const msg of request.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content as Anthropic.MessageParam["content"] });
    }
  }

  messages.push({ role: "user", content: request.prompt });
  send({ type: "status", message: "Thinking..." });

  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: SLIDE_MODEL,
      max_tokens: 4096,
      system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
      messages,
      tools: tools as any,
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        send({ type: "thinking", text: block.text });
      } else if (block.type === "tool_use") {
        const result = await executeTool(block, send);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: typeof result === "string" ? result : JSON.stringify(result) });
      }
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn" || toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function executeTool(block: Anthropic.ContentBlock & { type: "tool_use" }, send: SendFn): Promise<string> {
  const input = block.input as Record<string, unknown>;

  switch (block.name) {
    case "render_slide": {
      send({ type: "status", message: "Building slide..." });
      const slide = postProcessSlide(input.slide as UISlide);
      send({ type: "slide", slide });
      return "Slide rendered. Wait for the user to click an action button.";
    }
    case "web_search": {
      const query = input.query as string;
      send({ type: "status", message: `Searching: ${query}` });
      return await webSearch(query);
    }
    default:
      return `Unknown tool: ${block.name}`;
  }
}
