import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const tools: Tool[] = [
  {
    name: "render_slide",
    description: `Add ONE slide to the presentation. Generate one slide per call.

SLIDE STRUCTURE:
{ "id": "slide-1", "title": "...", "subtitle": "...", "background": "#ffffff", "dark": false, "blocks": [...], "actions": [{ "label": "...", "prompt": "...", "variant": "secondary" }] }

BLOCK ANIMATIONS:
Every block needs "animation": { "entrance": "fade-in"|"slide-up"|"scale-up"|"blur-in"|"none", "delay": 0.1, "duration": 0.5 }
Stagger blocks: 0.1, 0.3, 0.5, 0.7s etc.

BLOCK TYPES:

CONTENT:
- heading: { text, level?: 1-6 }
- text: { content } — supports **bold**, *italic*. Keep SHORT.
- list: { items: string[], ordered?: boolean, icon?: string } — max 4 items
- quote: { text, author? }
- callout: { type: "info"|"warning"|"success"|"tip", title?, content }
- card: { title, description?, tags?: string[] }

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
- jsx: { content: "<React JSX>", height? } — for games, simulations, flashcards, interactive widgets, rich layouts, dashboards, data displays, and visual illustrations. React 18, ReactDOM, Babel, and Tailwind CSS are available. shadcn/ui component helpers are pre-loaded as globals:
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge, Progress, Separator, Tabs, TabsList, TabsTrigger, TabsContent.
  Write JSX in \`<script type="text/babel">\` and render with \`ReactDOM.createRoot(document.getElementById('root')).render(<App />)\`. A \`<div id="root">\` is provided automatically. Do NOT include \`<html>\` or \`<head>\` tags — just provide body content and scripts.
  For visual illustrations, use CSS animations, SVG, or HTML5 Canvas instead of images. Example: animated diagrams, particle effects, interactive SVG.

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
    cache_control: { type: "ephemeral" },
  } as Tool & { cache_control: { type: string } },
];
