import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const slides = sqliteTable("slides", {
  id: text("id").primaryKey(),
  title: text("title"),
  subtitle: text("subtitle"),
  background: text("background").default("#ffffff"),
  dark: integer("dark", { mode: "boolean" }).default(false),
  blocks: text("blocks").notNull(), // JSON
  actions: text("actions"), // JSON — center branch actions
  parentId: text("parent_id").references((): any => slides.id),
  mainChildId: text("main_child_id"),
  conversationHistory: text("conversation_history"), // JSON
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

export const slideLinks = sqliteTable("slide_links", {
  id: text("id").primaryKey(),
  fromSlideId: text("from_slide_id").notNull().references(() => slides.id),
  toSlideId: text("to_slide_id").notNull().references(() => slides.id),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  slideId: text("slide_id").notNull().references(() => slides.id),
  selectedText: text("selected_text").notNull(),
  blockId: text("block_id"),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull().references(() => chats.id),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
});
