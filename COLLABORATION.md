# Lantern — Architecture & Collaboration Guide

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Next.js 16)                              │
│                                                               │
│  page.tsx                                                     │
│  ├─ State: currentNode (SlideNode), generating, history[]     │
│  ├─ Pre-generation via useEffect (pregenRef)                  │
│  ├─ SSE stream consumers (fetchSSE, consumeSSE)               │
│  ├─ Landing page: recent slides, resume last visited          │
│  └─ Navigation: loadSlide, handleContinue, handleBranch       │
│       ↓                              ↑                        │
│  SlideRenderer                  GenerationProgress            │
│  ├─ BlockRenderer (20 types)   (animated loading orb)         │
│  ├─ AnimatedBlock (Framer)                                    │
│  ├─ Nav arrows (◀ parent, ▶ continue)                         │
│  ├─ Branch action buttons (center)                            │
│  ├─ Chat annotations (dotted underline on chatted text)       │
│  ├─ ChatPanel (text selection → explain → turn into slide)    │
│  └─ LinkModal (search + link to other slides)                 │
│                                                               │
│  localStorage: last visited slide ID                          │
└──────────────┬────────────────────────────────────────────────┘
               │ REST + SSE API
               ▼
┌───────────────────────────────────────────────────────────────┐
│  Server (Next.js API Routes)                                  │
│                                                               │
│  Slide Generation                                             │
│  ├─ generate-slide.ts — shared LLM loop (Claude Opus 4.6)    │
│  ├─ POST /api/slides — create root slide                      │
│  ├─ POST /api/slides/:id/continue — generate main child (→)   │
│  └─ POST /api/slides/:id/branch — generate branch child       │
│                                                               │
│  Slide CRUD                                                   │
│  ├─ GET  /api/slides — list all slides                        │
│  ├─ GET  /api/slides/:id — get SlideNode with relationships   │
│  ├─ PATCH /api/slides/:id — update metadata                   │
│  └─ GET  /api/slides/search?q=... — search by title           │
│                                                               │
│  Chat (text selection)                                        │
│  ├─ POST /api/slides/:id/chat — start/continue chat           │
│  ├─ GET  /api/slides/:id/chat/:chatId — get chat messages     │
│  └─ POST /api/slides/:id/chat/:chatId/to-slide — chat→slide   │
│                                                               │
│  Links                                                        │
│  ├─ POST   /api/slides/:id/links — add link                   │
│  └─ DELETE /api/slides/:id/links — remove link                │
│                                                               │
│  Assets                                                       │
│  ├─ image/route.ts → Unsplash photo proxy (gray placeholder)  │
│  └─ gen/route.ts → DALL-E 3 image generation (legacy)         │
│                                                               │
│  Database (SQLite + better-sqlite3 + Drizzle ORM)             │
│  ├─ slides — id, title, blocks, parentId, mainChildId, etc.   │
│  ├─ slide_links — bidirectional links between slides          │
│  ├─ chats — text selection conversations per slide            │
│  └─ chat_messages — individual messages within chats          │
└───────────────────────────────────────────────────────────────┘
```

## Data Model

Slides form a **directed acyclic graph (DAG)**:

```
                    ┌─────────┐
                    │  Root   │  ← User's initial prompt
                    └────┬────┘
                         │ mainChild (right arrow →)
                    ┌────▼────┐
                    │ Slide 2 │
                    └──┬───┬──┘
          branch ↙     │     ↘ branch
    ┌──────────┐  ┌────▼────┐  ┌──────────┐
    │ Quiz Me  │  │ Slide 3 │  │ Deep Dive│
    └──────────┘  └────┬────┘  └──────────┘
                       │ mainChild
                  ┌────▼────┐
                  │ Slide 4 │  ← ← ← remote link from Quiz Me
                  └─────────┘
```

- **Main path (spine):** Each slide has at most one `mainChildId` — navigated via the right arrow
- **Branch children:** Created from action buttons, stored as children with `isMain: false`
- **Remote links:** Bidirectional connections between any two slides (`slide_links` table)
- **Parent navigation:** Left arrow goes to `parentId`

## Data Flow

### 1. Initial Generation

```
User types "Explain quantum computing" on landing page
  → page.tsx: generateRoot(prompt)
    → POST /api/slides { prompt }
      → generate-slide.ts: Claude API + tool loop
      → SSE: { type: "status", message: "Thinking..." }
      → SSE: { type: "slide", slide: {...} }
      → saveSlide(slide, null, history, false)  // root, no parent
      → SSE: { type: "done", slideId: "uuid" }
    → page.tsx: loadSlide(slideId)
      → GET /api/slides/:id → returns SlideNode
    → useEffect triggers pre-generation of main child
```

### 2. Pre-generation (Background)

When a slide loads and has no `mainChildId`:

```
useEffect detects currentNode with no mainChildId
  → POST /api/slides/:id/continue (fire-and-forget)
    → Server generates next slide, saves as mainChild
    → pregenRef stores the Promise
  → On completion, silently refresh node to pick up mainChildId
  → Next right-arrow click → instant navigation (no loading)
```

### 3. Right Arrow (Continue)

```
User clicks ▶ (right arrow)
  → handleContinue()
    → If mainChildId exists → loadSlide(mainChildId) instantly
    → If pregenRef has pending promise → wait for it, then navigate
    → Else → POST /api/slides/:id/continue with loading UI
```

### 4. Branch Actions

```
User clicks "Quiz me" (center action button)
  → handleBranch("Quiz me on this topic")
    → POST /api/slides/:id/branch { prompt }
      → generates slide, saves as branch child (isMain: false)
    → loadSlide(newSlideId)
    → Left arrow on new slide returns to parent
```

### 5. Text Selection Chat

```
User selects text "quantum entanglement" on a slide
  → mouseUp handler detects selection
  → ChatPanel opens with "Explain this" quick action
  → POST /api/slides/:id/chat { selectedText, message }
    → Creates chat record, sends to Claude, saves response
    → SSE: { type: "chat_response", chatId, content }
  → On close, onRefresh() updates node → text gets dotted underline
  → Clicking dotted text → GET /api/slides/:id/chat/:chatId → reopens chat
  → "Turn into slide" → POST .../to-slide → new branch child
```

### 6. Remote Links

```
User clicks 🔗 link button on a slide
  → LinkModal opens with search input
  → GET /api/slides/search?q=... (debounced 300ms)
  → User selects target slide
  → POST /api/slides/:id/links { toSlideId }
    → Creates bidirectional link in slide_links table
  → Links/backlinks display as colored chips on the slide
  → Clicking a chip → loadSlide(linkedSlideId)
```

## Key Files

| File | Role |
|------|------|
| `src/app/page.tsx` | App orchestration: state, pre-gen, navigation, landing page |
| `src/components/slide-renderer.tsx` | Renders SlideNode → React: blocks, nav arrows, actions, chat annotations |
| `src/components/chat-panel.tsx` | Floating chat panel for text selection conversations |
| `src/components/link-modal.tsx` | Search modal for creating links between slides |
| `src/lib/generate-slide.ts` | Shared generation logic: Claude API loop, SSE stream creation |
| `src/lib/db/schema.ts` | Drizzle ORM schema: slides, slide_links, chats, chat_messages |
| `src/lib/db/index.ts` | SQLite singleton connection with WAL mode + busy timeout |
| `src/lib/db/queries.ts` | CRUD layer: saveSlide, getSlide (assembles SlideNode), search, links, chats |
| `src/lib/system-prompt.ts` | LLM instructions: design rules, content limits, branching actions |
| `src/lib/tools.ts` | Tool schemas: `render_slide` (JSON structure) and `web_search` |
| `src/lib/types.ts` | TypeScript interfaces: UISlide, SlideNode, SSEEvent, etc. |
| `src/lib/post-processors.ts` | Slide fixups: force light background, HTML block cleanup |
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

## Database Schema

```sql
slides (
  id TEXT PRIMARY KEY,
  title TEXT,
  subtitle TEXT,
  background TEXT DEFAULT '#ffffff',
  dark INTEGER DEFAULT 0,
  blocks TEXT NOT NULL,          -- JSON array of UIBlock
  actions TEXT,                  -- JSON array of SlideAction
  parent_id TEXT REFERENCES slides(id),
  main_child_id TEXT,            -- points to the "right arrow" child
  conversation_history TEXT,     -- JSON snapshot of Claude messages
  created_at INTEGER
)

slide_links (
  id TEXT PRIMARY KEY,
  from_slide_id TEXT REFERENCES slides(id),
  to_slide_id TEXT REFERENCES slides(id),
  created_at INTEGER
)

chats (
  id TEXT PRIMARY KEY,
  slide_id TEXT REFERENCES slides(id),
  selected_text TEXT NOT NULL,
  block_id TEXT,
  created_at INTEGER
)

chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES chats(id),
  role TEXT NOT NULL,             -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at INTEGER
)
```

## Pre-generation

```typescript
// Stored in a ref (no re-renders on updates)
pregenRef: { id: string; promise: Promise<string | null> } | null

// Lifecycle:
// 1. Slide loads → useEffect checks if mainChildId is null
// 2. Fires POST /api/slides/:id/continue in background
// 3. Server generates slide, saves to DB, sets parent.mainChildId
// 4. Promise resolves → silently refresh current node
// 5. User clicks ▶ → mainChildId now exists → instant navigation
// 6. If user clicks ▶ before pre-gen finishes → waits on the promise
```

## Design Constraints (enforced via system prompt + post-processor)

- **No scrolling** — 16:9 fixed viewport, overflow clipped
- **Light background only** — forced to `#ffffff` in post-processor
- **Max 2–3 blocks per slide** — title/subtitle are separate
- **Text max 30 words** — lists max 4 items, tables max 4 rows
- **Interactivity every ~3 slides** — quiz, counter, or html widget
- **Actions are branching only** — "Continue" filtered out (right arrow handles it)

## Adding a New Block Type

1. Add the type name to `BlockType` union in `src/lib/types.ts`
2. Add rendering logic in `BlockRenderer` switch in `src/components/slide-renderer.tsx`
3. Document the props schema in the `render_slide` tool description in `src/lib/tools.ts`
4. Optionally mention it in the system prompt in `src/lib/system-prompt.ts`

## SSE Event Protocol

All generation endpoints stream newline-delimited JSON:

```
data: {"type":"status","message":"Thinking..."}

data: {"type":"status","message":"Searching: quantum computing basics"}

data: {"type":"slide","slide":{"id":"slide-1","title":"...","blocks":[...],"actions":[...]}}

data: {"type":"done","slideId":"uuid-of-saved-slide","conversationHistory":[...]}
```

Chat endpoints add:

```
data: {"type":"chat_response","chatId":"uuid","content":"The explanation..."}

data: {"type":"done","chatId":"uuid"}
```

Client parses via `fetchSSE()` helper which splits on `\n`, finds `data: ` prefixed lines, and dispatches to callbacks.
