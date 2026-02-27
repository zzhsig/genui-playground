"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LinkModalProps {
  slideId: string;
  dark: boolean;
  onClose: () => void;
  onLinked: () => void;
}

export function LinkModal({ slideId, dark, onClose, onLinked }: LinkModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/slides/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.filter((s: any) => s.id !== slideId));
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, slideId]);

  const addLink = async (toSlideId: string) => {
    await fetch(`/api/slides/${slideId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toSlideId }),
    });
    onLinked();
    onClose();
  };

  const bg = dark ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.95)";
  const textColor = dark ? "#e5e7eb" : "#1f2937";
  const mutedColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const inputBg = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";
  const borderColor = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-96 max-h-[60%] rounded-xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        style={{ background: bg, border: `1px solid ${borderColor}`, color: textColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div className="text-sm font-medium mb-2">Link to another slide</div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slides by title..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: inputBg, border: `1px solid ${borderColor}` }}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <div className="text-xs text-center py-4" style={{ color: mutedColor }}>Searching...</div>}
          {!loading && results.length === 0 && query.trim() && (
            <div className="text-xs text-center py-4" style={{ color: mutedColor }}>No slides found</div>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => addLink(s.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-all"
            >
              {s.title || "Untitled slide"}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
