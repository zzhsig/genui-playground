"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface LinkModalProps {
  slideId: string;
  links: { id: string; slideId: string; title: string | null }[];
  backlinks: { id: string; slideId: string; title: string | null }[];
  onClose: () => void;
  onLinked: () => void;
  onNavigate: (slideId: string) => void;
}

interface SlideItem {
  id: string;
  title: string | null;
  parentId: string | null;
  createdAt: number | null;
}

export function LinkModal({ slideId, links, backlinks, onClose, onLinked, onNavigate }: LinkModalProps) {
  const [query, setQuery] = useState("");
  const [allSlides, setAllSlides] = useState<SlideItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    fetch("/api/slides")
      .then((r) => r.json())
      .then((data: SlideItem[]) => setAllSlides(data.filter((s) => s.id !== slideId)))
      .catch(() => {});
  }, [slideId]);

  const linkedIds = new Set(links.map((l) => l.slideId));
  const backlinkIds = new Set(backlinks.map((l) => l.slideId));

  const filtered = query.trim()
    ? allSlides.filter((s) => (s.title || "").toLowerCase().includes(query.toLowerCase()))
    : allSlides;

  const otherSlides = filtered.filter((s) => !linkedIds.has(s.id) && !backlinkIds.has(s.id));

  const addLink = async (toSlideId: string) => {
    await fetch(`/api/slides/${slideId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toSlideId }),
    });
    onLinked();
  };

  const unlinkSlide = async (linkId: string) => {
    await fetch(`/api/slides/${slideId}/links`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    onLinked();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-[420px] max-h-[70%] rounded-xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        style={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(0,0,0,0.1)", color: "#1f2937" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Slides</div>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-black/5 transition-colors cursor-pointer"
              style={{ color: "rgba(0,0,0,0.4)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slides..."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          {/* Outgoing links */}
          {links.length > 0 && (
            <div>
              <div
                className="text-[10px] uppercase tracking-wider font-semibold px-1 mb-1"
                style={{ color: "rgba(99,102,241,0.7)" }}
              >
                Linked to ({links.length})
              </div>
              {links.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-black/[0.03] group">
                  <button
                    onClick={() => {
                      onNavigate(l.slideId);
                      onClose();
                    }}
                    className="flex items-center gap-2 text-sm text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-indigo-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                    <span className="truncate">{l.title || "Untitled"}</span>
                  </button>
                  <button
                    onClick={() => unlinkSlide(l.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all cursor-pointer"
                    style={{ color: "rgba(0,0,0,0.3)" }}
                    title="Remove link"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div>
              <div
                className="text-[10px] uppercase tracking-wider font-semibold px-1 mb-1"
                style={{ color: "rgba(0,0,0,0.35)" }}
              >
                Linked from ({backlinks.length})
              </div>
              {backlinks.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    onNavigate(l.slideId);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-black/[0.03] text-left cursor-pointer"
                >
                  <svg
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: "rgba(0,0,0,0.3)" }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M17 17L7 7M17 7H7v10" />
                  </svg>
                  <span className="truncate">{l.title || "Untitled"}</span>
                </button>
              ))}
            </div>
          )}

          {/* All slides */}
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold px-1 mb-1"
              style={{ color: "rgba(0,0,0,0.35)" }}
            >
              {query.trim() ? `Results (${otherSlides.length})` : `All slides (${otherSlides.length})`}
            </div>
            {otherSlides.length === 0 && (
              <div className="text-xs text-center py-3" style={{ color: "rgba(0,0,0,0.3)" }}>
                {query.trim() ? "No matching slides" : "No other slides"}
              </div>
            )}
            {otherSlides.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-black/[0.03] group">
                <button
                  onClick={() => {
                    onNavigate(s.id);
                    onClose();
                  }}
                  className="flex-1 min-w-0 text-left text-sm truncate cursor-pointer"
                >
                  {s.title || "Untitled"}
                </button>
                <button
                  onClick={() => addLink(s.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-indigo-50 transition-all cursor-pointer"
                  style={{ color: "#6366f1" }}
                  title="Link to this slide"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
