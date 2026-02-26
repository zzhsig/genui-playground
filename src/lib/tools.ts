import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const tools: Tool[] = [
  {
    name: "render_slide",
    description: `Add ONE slide to the presentation. The user will read it at their own pace, then click an action button to trigger the next slide. Generate one slide per call.

SLIDE STRUCTURE:
{
  "id": "slide-1",
  "title": "Optional heading displayed at the top of the slide",
  "subtitle": "Optional subheading",
  "background": "#ffffff",
  "dark": false,
  "blocks": [ ... ],
  "actions": [
    { "label": "Continue →", "prompt": "continue to the next topic", "variant": "primary" },
    { "label": "Show me an example", "prompt": "show a concrete example of this", "variant": "secondary" }
  ]
}

DESIGN RULES:
- background: Use ONLY simple solid colors. Light slides: "#ffffff", "#f9fafb", "#f0f9ff". Dark slides: "#111827", "#0f172a", "#18181b". NO GRADIENTS.
- dark: Set true if background is dark, false if light. This controls text color.
- Keep text SHORT. Use bullet points, not paragraphs. Max ~30 words per text block.
- Use large, clear typography. Level 1-2 headings for titles.
- Prefer visual blocks: stats, charts, images, cards, timelines.

CRITICAL — NO SCROLLING:
The viewport is a fixed 16:9 box. Content that overflows is CLIPPED and invisible. Stay within these limits:
- Max 2-3 blocks per slide (title/subtitle are separate, not counted)
- Lists: max 4 items
- Timeline: max 3 items
- Table: max 4 rows × 4 columns
- Stats: max 4 items
- Chart data: max 6 points
Split excess content across slides using actions.

ACTIONS:
- Every slide MUST have 1-3 actions so the user can navigate.
- Always include a "Continue →" as the primary action.
- Add optional actions like "Show example", "Quiz me", "Try it", "Dive deeper", "Compare", etc.
- The last slide should have a "Start over" action with variant "outline".
- action.prompt is what gets sent to you as the next user message.

BLOCK ANIMATIONS (delays relative to slide appearance):
Every block needs an "animation":
{ "entrance": "fade-in"|"slide-up"|"scale-up"|"blur-in"|"none", "delay": 0.1, "duration": 0.5 }
Stagger blocks: 0.1, 0.3, 0.5, 0.7s etc.

BLOCK TYPES:

CONTENT:
- heading: { text, level?: 1-6 }
- text: { content } — supports **bold**, *italic*. Keep SHORT.
- image: { src, alt, caption?, size?: "sm"|"md"|"lg"|"full" }
  src: "/api/image?query=URL_ENCODED" for real-world photos only. Never use images as the sole block on a slide.
- list: { items: string[], ordered?: boolean, icon?: string } — max 4 items
- quote: { text, author? }
- callout: { type: "info"|"warning"|"success"|"tip", title?, content }
- card: { title, description?, image?, tags?: string[] }

LAYOUT:
- grid: { columns?: 2|3|4 } (with children blocks)
- columns: { ratio?: "1:1"|"1:2"|"2:1" } (with children blocks)
- divider: {}

DATA:
- stats: { items: { value, label, change?, trend?: "up"|"down" }[], columns?: 2|3|4 } — max 4 items
- chart: { type: "bar"|"line"|"pie"|"donut", title?, data: { label, value, color? }[] } — max 6 data points
- timeline: { items: { date, title, description? }[] } — max 3 items
- table: { headers: string[], rows: string[][] } — max 4 rows
- progress: { items: { label, value, max?, color? }[] }

INTERACTIVE (use often to engage the user):
- quiz: { question, options: { text, correct?: boolean }[], explanation? }
- counter: { label, value, min?, max?, step? }

RICH:
- code: { code, language?, title? }
- html: { content: "<full HTML/CSS/JS>", height? } — for games, simulations, flashcards, interactive widgets. Use this for "Try it" actions. The HTML runs in a sandboxed iframe with Tailwind CSS available.

Every block needs a unique "id".`,
    input_schema: {
      type: "object" as const,
      properties: {
        slide: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            background: { type: "string" },
            dark: { type: "boolean" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string" },
                  props: { type: "object" },
                  animation: { type: "object", properties: { entrance: { type: "string" }, delay: { type: "number" }, duration: { type: "number" } }, required: ["entrance", "delay", "duration"] },
                  children: { type: "array", items: { type: "object" } },
                },
                required: ["id", "type", "props"],
              },
            },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  prompt: { type: "string" },
                  variant: { type: "string", enum: ["primary", "secondary", "outline"] },
                },
                required: ["label", "prompt"],
              },
            },
          },
          required: ["id", "blocks", "actions"],
        },
      },
      required: ["slide"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for factual information. MANDATORY for entities, people, events, statistics.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];
