# Lantern

An AI-powered knowledge exploration tool. Ask any topic and navigate it as a graph of interconnected slides — branch into subtopics, chat about selected text, link ideas together, and build a personal "second brain" of learning.

Powered by Claude Opus 4.6 via OpenRouter. Slides are persisted in SQLite so your knowledge graph survives across sessions.

## Features

- **Graph-based navigation** — slides form a DAG with parent-child relationships; right arrow continues the main path, action buttons create branches, left arrow returns to parent
- **Pre-generation** — the next slide is generated in the background while you read, so right-arrow clicks are instant
- **Text selection chat** — select any text on a slide to chat about it; chatted text gets a dotted underline for easy revisiting
- **Chat to slide** — turn any chat conversation into a new branch slide
- **Bidirectional links** — link any two slides together; both show the connection
- **20 block types** — stats, charts, timelines, quizzes, code, HTML sandboxes, and more
- **Persistent storage** — SQLite database preserves all slides, chats, and links across sessions
- **Landing page** — resume where you left off or revisit any previous topic
- **No scrolling** — strict 16:9 viewport, all content fits on screen
- **Web search** — fact verification via Brave Search / DuckDuckGo fallback

## Quick Start

```bash
# Install
npm install

# Configure (required)
cp .env.example .env.local
# Add your OPENROUTER_API_KEY

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Claude API access via OpenRouter |
| `BRAVE_SEARCH_API_KEY` | No | Web search (falls back to DuckDuckGo) |
| `UNSPLASH_ACCESS_KEY` | No | Photo search (falls back to gray placeholder) |

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **Claude Opus 4.6** via OpenRouter (Anthropic SDK)
- **SQLite** + **better-sqlite3** + **Drizzle ORM**
- **Tailwind CSS 4** + **shadcn/ui** + **Framer Motion**
- Server-Sent Events for streaming generation

## How It Works

1. User enters a topic on the landing page (or resumes a previous session)
2. Claude generates the first slide as structured JSON via tool use (`render_slide`)
3. React renders the slide with animated blocks and action buttons
4. The next main-path slide pre-generates in the background
5. **Right arrow** → continue the main path (instant if pre-generated)
6. **Action buttons** → branch into a subtopic (quiz, deep dive, example)
7. **Left arrow** → return to parent slide
8. **Select text** → chat about it, then optionally turn the chat into a new slide
9. **Link button** → search and connect any two slides bidirectionally

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page + slide viewport
│   └── api/
│       └── slides/                 # REST + SSE API (14 routes)
│           ├── route.ts            # GET list / POST create root
│           ├── [id]/route.ts       # GET node / PATCH update
│           ├── [id]/continue/      # POST → generate main child
│           ├── [id]/branch/        # POST → generate branch child
│           ├── [id]/chat/          # POST → text selection chat
│           ├── [id]/chat/[chatId]/ # GET messages / POST to-slide
│           ├── [id]/links/         # POST add / DELETE remove
│           └── search/             # GET search by title
├── components/
│   ├── slide-renderer.tsx          # SlideNode → React (blocks, nav, chat)
│   ├── chat-panel.tsx              # Floating chat for text selection
│   └── link-modal.tsx              # Search + link creation modal
└── lib/
    ├── db/                         # SQLite persistence layer
    │   ├── schema.ts               # Drizzle table definitions
    │   ├── index.ts                # DB singleton + auto-create
    │   └── queries.ts              # CRUD operations
    ├── generate-slide.ts           # Shared Claude generation logic
    ├── system-prompt.ts            # LLM instructions
    ├── tools.ts                    # render_slide + web_search schemas
    ├── types.ts                    # UISlide, SlideNode, SSEEvent
    └── post-processors.ts          # Force light bg, HTML fixups
```

See [COLLABORATION.md](./COLLABORATION.md) for detailed architecture, data flows, and database schema.
