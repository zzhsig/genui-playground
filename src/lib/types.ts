// ── Slide-based Interactive Presentation ──

export interface SlideAction {
  label: string;
  prompt: string;   // sent to LLM when clicked
  variant?: "primary" | "secondary" | "outline";
}

export interface UISlide {
  id: string;
  title?: string;
  subtitle?: string;
  background?: string;  // simple solid color: "#ffffff", "#f8fafc", "#111827"
  dark?: boolean;       // true = light text on dark bg
  blocks: UIBlock[];
  actions?: SlideAction[];
}

export interface BlockAnimation {
  entrance: "fade-in" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale-up" | "blur-in" | "none";
  delay: number;
  duration: number;
  stagger?: number;
}

export interface UIBlock {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  animation?: BlockAnimation;
  children?: UIBlock[];
}

export type BlockType =
  | "heading" | "text" | "image" | "list" | "quote" | "callout" | "card"
  | "grid" | "columns" | "divider"
  | "table" | "stats" | "timeline" | "chart" | "progress"
  | "button" | "quiz" | "counter"
  | "code" | "map" | "html";

// ── Graph Node (returned by GET /api/slides/:id) ──

export interface SlideNode {
  id: string;
  slide: UISlide;
  parentId: string | null;
  mainChildId: string | null;
  conversationHistory: ConversationMessage[];
  children: { id: string; title: string | null; isMain: boolean }[];
  links: { id: string; slideId: string; title: string | null }[];
  backlinks: { id: string; slideId: string; title: string | null }[];
  chats: { id: string; selectedText: string; blockId: string | null; messageCount: number }[];
  createdAt: number;
}

// ── SSE Events ──

export type SSEEvent =
  | { type: "status"; message: string; step?: string }
  | { type: "slide"; slide: UISlide }
  | { type: "slide_partial"; slide: UISlide }
  | { type: "thinking"; text: string }
  | { type: "done"; slideId?: string; chatId?: string; conversationHistory?: ConversationMessage[] }
  | { type: "chat_response"; chatId: string; content: string }
  | { type: "error"; message: string };

// ── Request / Response ──

export interface GenerateRequest {
  prompt: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: unknown;
}
