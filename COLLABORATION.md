# Architecture & Collaboration Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 19 + Next.js 16)                        │
│                                                         │
│  page.tsx                                               │
│  ├─ State: entries[], viewIndex, generating              │
│  ├─ Pre-generation cache (pregenMap)                    │
│  ├─ SSE stream consumer (fetchSSE)                      │
│  └─ Action routing (handleAction)                       │
│       ↓                              ↑                  │
│  SlideRenderer                  GenerationProgress      │
│  ├─ BlockRenderer (20 types)   (animated loading orb)   │
│  ├─ AnimatedBlock (Framer)                              │
│  └─ ActionButtons                                       │
└──────────────┬──────────────────────────────────────────┘
               │ POST /api/generate (SSE)
               ▼
┌─────────────────────────────────────────────────────────┐
│  Server (Next.js API Routes)                            │
│                                                         │
│  generate/route.ts                                      │
│  ├─ Claude Opus 4.6 (via OpenRouter)                    │
│  ├─ Multi-turn tool loop (max 10 turns)                 │
│  ├─ Tool: render_slide → post-process → SSE "slide"     │
│  └─ Tool: web_search → Brave/DuckDuckGo                │
│                                                         │
│  image/route.ts  → Unsplash photo proxy                 │
│  gen/route.ts    → DALL-E 3 image generation            │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Initial Generation

```
User types "Explain quantum computing"
  → page.tsx: generate(prompt)
    → POST /api/generate { prompt, conversationHistory: [] }
      → Claude API call with system prompt + tools
      → Claude calls render_slide tool with UISlide JSON
      → SSE: { type: "status", message: "Thinking..." }
      → SSE: { type: "slide", slide: {...} }
      → SSE: { type: "done", conversationHistory: [...] }
    → page.tsx: addSlide(slide, history)
    → page.tsx: pregenActions(slide, history)  // start background fetches
```

### 2. Pre-generation

When a slide arrives with actions like `["Continue →", "Quiz me", "Try it"]`:

```
pregenActions(slide, history)
  → For EACH action:
      fetchSSE(action.prompt, history, abortSignal, {
        onSlide: cache in pregenMap
        onDone: cache history, chain pre-gen for THAT slide's actions
      })
```

### 3. Action Click

```
User clicks "Quiz me"
  → handleAction("generate a quiz about this")
    → Check pregenMap:
      ✓ Cached & ready  → addSlide instantly, start next pre-gen chain
      ~ In flight        → set pendingAction, show loading bar
      ✗ No cache         → generate(prompt) from scratch
```

### 4. Branching (going back)

```
User is on slide 5, navigates back to slide 2, clicks a different action
  → Truncate entries to [slide-1, slide-2]
  → Cancel all pre-generations
  → generate(prompt, slide2.history)  // fresh generation from that point
```

## Key Files

| File | Role |
|------|------|
| `src/app/page.tsx` | App orchestration: state, SSE streaming, pre-gen cache, navigation |
| `src/components/slide-renderer.tsx` | Renders UISlide → React: all 20 block types, action buttons |
| `src/app/api/generate/route.ts` | SSE endpoint: Claude multi-turn loop, tool execution |
| `src/lib/system-prompt.ts` | LLM instructions: design rules, content limits, interactivity |
| `src/lib/tools.ts` | Tool schemas: `render_slide` (JSON structure) and `web_search` |
| `src/lib/types.ts` | TypeScript interfaces: UISlide, UIBlock, SSEEvent, etc. |
| `src/lib/post-processors.ts` | HTML block fixups: DOCTYPE, Tailwind CDN, viewport meta |
| `src/lib/search.ts` | Web search: Brave API with DuckDuckGo fallback |

## Block Types

### Content
- `heading` — h1–h6 with responsive sizing
- `text` — markdown-lite (**bold**, *italic*, links)
- `image` — photos via `/api/image?query=...`
- `list` — bulleted/numbered, max 5 items rendered
- `quote` — left-border styled with optional author
- `callout` — info/warning/success/tip with accent color
- `card` — title + description + optional image + tags

### Layout
- `grid` — 2–4 column grid with children blocks
- `columns` — custom ratio (1:1, 1:2, 2:1) with children
- `divider` — subtle horizontal line

### Data
- `stats` — value/label cards with optional trend indicators
- `chart` — bar/line/pie/donut (custom SVG, no dependencies)
- `timeline` — vertical timeline, max 4 items rendered
- `table` — headers + rows, max 5 rows rendered
- `progress` — labeled progress bars with colors

### Interactive
- `quiz` — multiple choice with correct/incorrect feedback + explanation
- `counter` — numeric +/- stepper

### Rich
- `code` — monospace pre block with optional title
- `html` — sandboxed iframe (allow-scripts) with Tailwind CSS injected

## Pre-generation Cache

```typescript
// Cache structure (useRef, not state — no re-renders on cache updates)
pregenMap: Map<string, PregenEntry>

interface PregenEntry {
  slide: UISlide | null           // Generated slide content
  history: ConversationMessage[]  // Conversation state after this slide
  done: boolean                   // Stream completed
  claimed: boolean                // User clicked this action
  entryId?: number                // Linked SlideEntry ID
}
```

**Lifecycle:**
1. `pregenActions()` creates entries for each action, starts parallel fetches
2. `onSlide` callback caches the slide; if user is waiting (`pendingAction`), displays immediately
3. `onDone` callback caches conversation history; if already claimed, chains to next pre-gen
4. On new slide display, all previous pre-gens are aborted and cache is cleared
5. Entry IDs link pre-gen entries to the `entries[]` state array for history updates

## Design Constraints (enforced via system prompt)

- **No scrolling** — 16:9 fixed viewport, overflow clipped
- **Solid backgrounds only** — no gradients
- **Max 2–3 blocks per slide** — title/subtitle are separate
- **Text max 30 words** — lists max 4 items, tables max 4 rows
- **Interactivity every ~3 slides** — quiz, counter, or html widget
- **Actions on every slide** — 1–3 buttons, always including "Continue →"

## Adding a New Block Type

1. Add the type name to `BlockType` union in `src/lib/types.ts`
2. Add rendering logic in `BlockRenderer` switch in `src/components/slide-renderer.tsx`
3. Document the props schema in the `render_slide` tool description in `src/lib/tools.ts`
4. Optionally mention it in the system prompt in `src/lib/system-prompt.ts`

## SSE Event Protocol

The `/api/generate` endpoint streams newline-delimited JSON:

```
data: {"type":"status","message":"Thinking..."}

data: {"type":"status","message":"Searching: quantum computing basics"}

data: {"type":"slide","slide":{"id":"slide-1","title":"...","blocks":[...],"actions":[...]}}

data: {"type":"done","conversationHistory":[{"role":"user","content":"..."},{"role":"assistant","content":[...]}]}
```

Client parses via `fetchSSE()` helper which splits on `\n`, finds `data: ` prefixed lines, and dispatches to callbacks.
