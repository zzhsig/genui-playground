import { db, schema } from "./index";
import { eq, like, or, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { UISlide, ConversationMessage, SlideAction } from "../types";

// ── Slide CRUD ──

export interface SlideRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  background: string | null;
  dark: boolean | null;
  blocks: string;
  actions: string | null;
  parentId: string | null;
  mainChildId: string | null;
  conversationHistory: string | null;
  createdAt: number | null;
}

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

function rowToUISlide(row: SlideRow): UISlide {
  return {
    id: row.id,
    title: row.title ?? undefined,
    subtitle: row.subtitle ?? undefined,
    background: row.background ?? undefined,
    dark: row.dark ?? undefined,
    blocks: JSON.parse(row.blocks),
    actions: row.actions ? JSON.parse(row.actions) : undefined,
  };
}

export function saveSlide(
  slide: UISlide,
  parentId: string | null,
  conversationHistory: ConversationMessage[],
  isMainChild: boolean,
): string {
  const id = uuid();

  db.insert(schema.slides).values({
    id,
    title: slide.title ?? null,
    subtitle: slide.subtitle ?? null,
    background: slide.background ?? "#ffffff",
    dark: slide.dark ?? false,
    blocks: JSON.stringify(slide.blocks),
    actions: slide.actions ? JSON.stringify(slide.actions) : null,
    parentId,
    conversationHistory: JSON.stringify(conversationHistory),
    createdAt: Date.now(),
  }).run();

  // If this is the main child, update parent's mainChildId
  if (parentId && isMainChild) {
    db.update(schema.slides)
      .set({ mainChildId: id })
      .where(eq(schema.slides.id, parentId))
      .run();
  }

  return id;
}

export function getSlide(id: string): SlideNode | null {
  const row = db.select().from(schema.slides).where(eq(schema.slides.id, id)).get();
  if (!row) return null;

  // Get children
  const childRows = db.select({
    id: schema.slides.id,
    title: schema.slides.title,
  }).from(schema.slides).where(eq(schema.slides.parentId, id)).all();

  const children = childRows.map((c) => ({
    id: c.id,
    title: c.title,
    isMain: c.id === row.mainChildId,
  }));

  // Get outgoing links
  const linkRows = db.select({
    id: schema.slideLinks.id,
    slideId: schema.slideLinks.toSlideId,
  }).from(schema.slideLinks).where(eq(schema.slideLinks.fromSlideId, id)).all();

  const links = linkRows.map((l) => {
    const target = db.select({ title: schema.slides.title }).from(schema.slides).where(eq(schema.slides.id, l.slideId)).get();
    return { id: l.id, slideId: l.slideId, title: target?.title ?? null };
  });

  // Get backlinks
  const backlinkRows = db.select({
    id: schema.slideLinks.id,
    slideId: schema.slideLinks.fromSlideId,
  }).from(schema.slideLinks).where(eq(schema.slideLinks.toSlideId, id)).all();

  const backlinks = backlinkRows.map((l) => {
    const source = db.select({ title: schema.slides.title }).from(schema.slides).where(eq(schema.slides.id, l.slideId)).get();
    return { id: l.id, slideId: l.slideId, title: source?.title ?? null };
  });

  // Get chats with message counts
  const chatRows = db.select().from(schema.chats).where(eq(schema.chats.slideId, id)).all();
  const chatsWithCounts = chatRows.map((c) => {
    const msgCount = db.select().from(schema.chatMessages).where(eq(schema.chatMessages.chatId, c.id)).all().length;
    return { id: c.id, selectedText: c.selectedText, blockId: c.blockId, messageCount: msgCount };
  });

  return {
    id: row.id,
    slide: rowToUISlide(row as SlideRow),
    parentId: row.parentId,
    mainChildId: row.mainChildId,
    conversationHistory: row.conversationHistory ? JSON.parse(row.conversationHistory) : [],
    children,
    links,
    backlinks,
    chats: chatsWithCounts,
    createdAt: row.createdAt ?? Date.now(),
  };
}

export function listSlides(): { id: string; title: string | null; parentId: string | null; createdAt: number | null }[] {
  return db.select({
    id: schema.slides.id,
    title: schema.slides.title,
    parentId: schema.slides.parentId,
    createdAt: schema.slides.createdAt,
  }).from(schema.slides).orderBy(desc(schema.slides.createdAt)).all();
}

export function searchSlides(query: string): { id: string; title: string | null }[] {
  const pattern = `%${query}%`;
  return db.select({
    id: schema.slides.id,
    title: schema.slides.title,
  }).from(schema.slides).where(
    or(like(schema.slides.title, pattern), like(schema.slides.subtitle, pattern))
  ).limit(20).all();
}

export function getSlideHistory(id: string): ConversationMessage[] {
  const row = db.select({ conversationHistory: schema.slides.conversationHistory })
    .from(schema.slides).where(eq(schema.slides.id, id)).get();
  if (!row?.conversationHistory) return [];
  return JSON.parse(row.conversationHistory);
}

// ── Links ──

export function addLink(fromSlideId: string, toSlideId: string): string {
  const id = uuid();
  db.insert(schema.slideLinks).values({ id, fromSlideId, toSlideId, createdAt: Date.now() }).run();
  return id;
}

export function removeLink(linkId: string): void {
  db.delete(schema.slideLinks).where(eq(schema.slideLinks.id, linkId)).run();
}

// ── Chats ──

export function createChat(slideId: string, selectedText: string, blockId: string | null): string {
  const id = uuid();
  db.insert(schema.chats).values({ id, slideId, selectedText, blockId, createdAt: Date.now() }).run();
  return id;
}

export function getChatMessages(chatId: string): { id: string; role: string; content: string; createdAt: number | null }[] {
  return db.select().from(schema.chatMessages).where(eq(schema.chatMessages.chatId, chatId)).all();
}

export function addChatMessage(chatId: string, role: string, content: string): string {
  const id = uuid();
  db.insert(schema.chatMessages).values({ id, chatId, role, content, createdAt: Date.now() }).run();
  return id;
}
