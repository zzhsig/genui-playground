"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SSEEvent } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  slideId: string;
  selectedText: string;
  blockId: string | null;
  existingChatId?: string;
  existingMessages?: ChatMessage[];
  dark: boolean;
  onClose: () => void;
  onTurnIntoSlide: (chatId: string) => void;
}

export function ChatPanel({
  slideId,
  selectedText,
  blockId,
  existingChatId,
  existingMessages,
  dark,
  onClose,
  onTurnIntoSlide,
}: ChatPanelProps) {
  const [chatId, setChatId] = useState<string | null>(existingChatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>(existingMessages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/slides/${slideId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, selectedText, blockId, message: text }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev: SSEEvent = JSON.parse(line.slice(6));
            if (ev.type === "chat_response") {
              setChatId(ev.chatId);
              setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: ev.content }]);
            }
            if (ev.type === "done" && (ev as any).chatId) {
              setChatId((ev as any).chatId);
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "Error getting response." }]);
    }
    setLoading(false);
  };

  const bg = dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)";
  const textColor = dark ? "#e5e7eb" : "#1f2937";
  const mutedColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const inputBg = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";
  const borderColor = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  return (
    <motion.div
      initial={{ opacity: 0, x: 10, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 10, scale: 0.95 }}
      className="absolute right-4 top-4 bottom-20 w-80 z-30 rounded-xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
      style={{ background: bg, border: `1px solid ${borderColor}`, color: textColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: mutedColor }}>Chat about:</div>
          <div className="text-sm font-medium truncate">&ldquo;{selectedText.slice(0, 50)}{selectedText.length > 50 ? "..." : ""}&rdquo;</div>
        </div>
        <button onClick={onClose} className="ml-2 p-1 rounded-md hover:bg-white/10 transition-colors" style={{ color: mutedColor }}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <button
            onClick={() => sendMessage(`Explain this: "${selectedText}"`)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
            style={{ background: inputBg, border: `1px solid ${borderColor}` }}
          >
            Explain this
          </button>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div
                className="px-3 py-2 rounded-lg text-sm leading-relaxed"
                style={{
                  background: msg.role === "user"
                    ? (dark ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.1)")
                    : inputBg,
                }}
              >
                {msg.content}
              </div>
              {msg.role === "assistant" && chatId && (
                <button
                  onClick={() => onTurnIntoSlide(chatId)}
                  className="mt-1 text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-white/10"
                  style={{ color: mutedColor }}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10" /></svg>
                  Turn into slide
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg text-sm" style={{ background: inputBg, color: mutedColor }}>
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${borderColor}` }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMessage(input); }}
            placeholder="Ask about this..."
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${borderColor}` }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-30 transition-all"
            style={{ background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}
          >
            Send
          </button>
        </div>
      </div>
    </motion.div>
  );
}
