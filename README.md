# Generative Learning Slides

An AI-powered interactive slide generation system. Claude Opus 4.6 generates one slide at a time with action buttons — users explore topics step-by-step, clicking to navigate. Next slides are pre-generated in the background so transitions feel instant.

## Features

- **Interactive learning** — each slide has action buttons ("Continue", "Quiz me", "Try it") that drive the narrative
- **Pre-generation** — background fetches for all possible next slides so clicks are instant
- **20 block types** — stats, charts, timelines, quizzes, code, HTML sandboxes, and more
- **Entrance animations** — Framer Motion staggered animations per block
- **No scrolling** — strict 16:9 viewport, all content fits on screen
- **Conversation memory** — full context preserved across the slide chain
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
| `UNSPLASH_ACCESS_KEY` | No | Photo search (falls back to placeholder) |
| `OPENAI_API_KEY` | No | DALL-E 3 image generation |

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **Claude Opus 4.6** via OpenRouter (Anthropic SDK)
- **Tailwind CSS 4** + **shadcn/ui** + **Framer Motion**
- Server-Sent Events for streaming

## How It Works

1. User enters a topic
2. Claude generates the first slide as structured JSON via tool use (`render_slide`)
3. React renders the slide with animated blocks and action buttons
4. Background pre-generation starts for each action button's prompt
5. User clicks an action → cached slide appears instantly (or waits if still generating)
6. Repeat until the topic is covered

See [COLLABORATION.md](./COLLABORATION.md) for architecture details.
