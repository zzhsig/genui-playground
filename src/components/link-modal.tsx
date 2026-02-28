"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { UISlide } from "@/lib/types";
import { BlockRenderer } from "./slide-renderer";

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

interface SlidePreview {
  id: string;
  slide: UISlide;
}

export function LinkModal({ slideId, links, backlinks, onClose, onLinked, onNavigate }: LinkModalProps) {
  const [query, setQuery] = useState("");
  const [allSlides, setAllSlides] = useState<SlideItem[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const previewCache = useRef<Map<string, SlidePreview>>(new Map());
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

  const fetchPreview = useCallback((id: string) => {
    setHoveredId(id);
    const cached = previewCache.current.get(id);
    if (cached) {
      setPreview(cached);
      return;
    }
    fetch(`/api/slides/${id}`)
      .then((r) => r.json())
      .then((data: any) => {
        const p: SlidePreview = { id: data.id, slide: data.slide };
        previewCache.current.set(id, p);
        setPreview(p);
      })
      .catch(() => {});
  }, []);

  const clearPreview = useCallback(() => {
    setHoveredId(null);
    setPreview(null);
  }, []);

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
        className="relative rounded-xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        style={{
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(0,0,0,0.1)",
          color: "#1f2937",
          width: "780px",
          height: "420px",
          maxWidth: "90vw",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div className="text-sm font-semibold">Slide Links</div>
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

        {/* 3-column body */}
        <div className="flex flex-1 min-h-0">
          {/* Left column — Links & Backlinks */}
          <div
            className="w-[200px] shrink-0 overflow-y-auto py-3 px-3 space-y-4"
            style={{ borderRight: "1px solid rgba(0,0,0,0.06)" }}
          >
            {/* Outgoing links */}
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "rgba(0,0,0,0.35)" }}>
                Links ({links.length})
              </div>
              {links.length === 0 ? (
                <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.25)" }}>None</div>
              ) : (
                <div className="space-y-0.5">
                  {links.map((l) => (
                    <div key={l.id} className="flex items-center group">
                      <button
                        onClick={() => { onNavigate(l.slideId); onClose(); }}
                        onMouseEnter={() => fetchPreview(l.slideId)}
                        onMouseLeave={clearPreview}
                        className="text-xs truncate cursor-pointer underline decoration-black/20 underline-offset-2 hover:decoration-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        {l.title || "Untitled"}
                      </button>
                      <button
                        onClick={() => unlinkSlide(l.id)}
                        className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all cursor-pointer shrink-0"
                        style={{ color: "rgba(0,0,0,0.25)" }}
                        title="Remove link"
                      >
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Backlinks */}
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "rgba(0,0,0,0.35)" }}>
                Backlinks ({backlinks.length})
              </div>
              {backlinks.length === 0 ? (
                <div className="text-[11px]" style={{ color: "rgba(0,0,0,0.25)" }}>None</div>
              ) : (
                <div className="space-y-0.5">
                  {backlinks.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { onNavigate(l.slideId); onClose(); }}
                      onMouseEnter={() => fetchPreview(l.slideId)}
                      onMouseLeave={clearPreview}
                      className="block text-xs truncate cursor-pointer underline decoration-black/20 underline-offset-2 hover:decoration-indigo-400 hover:text-indigo-600 transition-colors"
                    >
                      {l.title || "Untitled"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center column — All slides */}
          <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: "1px solid rgba(0,0,0,0.06)" }}>
            <div className="px-3 pt-2 pb-1.5 shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search slides..."
                className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <div
                className="text-[10px] uppercase tracking-wider font-semibold px-1.5 mb-1 mt-1"
                style={{ color: "rgba(0,0,0,0.35)" }}
              >
                {query.trim() ? `Results (${otherSlides.length})` : `All slides (${otherSlides.length})`}
              </div>
              {otherSlides.length === 0 && (
                <div className="text-xs text-center py-6" style={{ color: "rgba(0,0,0,0.3)" }}>
                  {query.trim() ? "No matching slides" : "No other slides"}
                </div>
              )}
              {otherSlides.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-1.5 py-1.5 rounded-md group cursor-pointer transition-colors ${hoveredId === s.id ? "bg-indigo-50/50" : "hover:bg-black/[0.03]"}`}
                  onMouseEnter={() => fetchPreview(s.id)}
                  onMouseLeave={clearPreview}
                >
                  <button
                    onClick={() => { onNavigate(s.id); onClose(); }}
                    className="flex-1 min-w-0 text-left text-xs truncate cursor-pointer"
                  >
                    {s.title || "Untitled"}
                  </button>
                  <button
                    onClick={() => addLink(s.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-indigo-50 transition-all cursor-pointer shrink-0"
                    style={{ color: "#6366f1" }}
                    title="Link to this slide"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — Preview */}
          <div className="w-[260px] shrink-0 overflow-hidden flex items-center justify-center">
            {preview && hoveredId ? (
              <SlidePreviewCard slide={preview.slide} />
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: "rgba(0,0,0,0.2)" }}>
                <div className="text-center">
                  <svg className="h-8 w-8 mx-auto mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                  <div className="text-[11px]">Hover a slide to preview</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Scaled Slide Preview ──

const VIRTUAL_W = 960;
const VIRTUAL_H = 600;
const PREVIEW_W = 244;
const SCALE = PREVIEW_W / VIRTUAL_W;

function SlidePreviewCard({ slide }: { slide: UISlide }) {
  const bg = slide.background || "#ffffff";
  const dark = slide.dark ?? false;
  const textColor = dark ? "#f3f4f6" : "#111827";
  const mutedColor = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        width: PREVIEW_W,
        height: VIRTUAL_H * SCALE,
        border: "1px solid rgba(0,0,0,0.1)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        className="flex flex-col items-center justify-center px-16 py-8 gap-3 pointer-events-none"
        style={{
          width: VIRTUAL_W,
          height: VIRTUAL_H,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
          background: bg,
          color: textColor,
          overflow: "hidden",
        }}
      >
        {slide.title && (
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-center leading-tight max-w-3xl">
            {slide.title}
          </h1>
        )}
        {slide.subtitle && (
          <p className="text-base text-center max-w-2xl leading-relaxed" style={{ color: mutedColor }}>
            {slide.subtitle}
          </p>
        )}
        <div className="flex flex-col items-center w-full max-w-4xl gap-4 mt-4 overflow-hidden">
          {slide.blocks.map((block) => (
            <div key={block.id} className="w-full">
              <BlockRenderer block={block} dark={dark} mutedColor={mutedColor} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
