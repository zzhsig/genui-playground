"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { UISlide, UIBlock } from "@/lib/types";

interface LinkModalProps {
  slideId: string;
  links: { id: string; slideId: string; title: string | null }[];
  backlinks: { id: string; slideId: string; title: string | null }[];
  branches: { id: string; title: string | null; isMain: boolean }[];
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

export function LinkModal({ slideId, links, backlinks, branches, onClose, onLinked, onNavigate }: LinkModalProps) {
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

            {/* Branches */}
            {branches.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "rgba(0,0,0,0.35)" }}>
                  Branches ({branches.length})
                </div>
                <div className="space-y-0.5">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { onNavigate(b.id); onClose(); }}
                      onMouseEnter={() => fetchPreview(b.id)}
                      onMouseLeave={clearPreview}
                      className="block text-xs truncate cursor-pointer underline decoration-black/20 underline-offset-2 hover:decoration-indigo-400 hover:text-indigo-600 transition-colors"
                    >
                      {b.title || "Branch"}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
          <div className="w-[260px] shrink-0 overflow-y-auto">
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

// ── Slide Preview Card ──

function SlidePreviewCard({ slide }: { slide: UISlide }) {
  const bg = slide.background || "#ffffff";
  const dark = slide.dark ?? false;
  const textColor = dark ? "#f3f4f6" : "#111827";
  const mutedColor = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";

  return (
    <div className="h-full flex flex-col">
      {/* Mini slide */}
      <div
        className="m-2 rounded-lg flex-1 flex flex-col overflow-hidden"
        style={{ background: bg, color: textColor, border: "1px solid rgba(0,0,0,0.08)" }}
      >
        <div className="p-3 flex-1 flex flex-col gap-1.5 overflow-hidden">
          {slide.title && (
            <div className="text-xs font-bold leading-tight line-clamp-2">{slide.title}</div>
          )}
          {slide.subtitle && (
            <div className="text-[10px] leading-tight line-clamp-2" style={{ color: mutedColor }}>
              {slide.subtitle}
            </div>
          )}
          <div className="flex flex-col gap-1.5 mt-1 overflow-hidden flex-1">
            {slide.blocks.slice(0, 3).map((block) => (
              <MiniBlock key={block.id} block={block} dark={dark} mutedColor={mutedColor} />
            ))}
            {slide.blocks.length > 3 && (
              <div className="text-[9px] text-center" style={{ color: mutedColor }}>
                +{slide.blocks.length - 3} more
              </div>
            )}
          </div>
        </div>
        {/* Mini actions */}
        {slide.actions && slide.actions.length > 0 && (
          <div className="px-3 pb-2 flex gap-1 flex-wrap">
            {slide.actions.slice(0, 3).map((a, i) => (
              <span
                key={i}
                className="text-[8px] px-1.5 py-0.5 rounded"
                style={{
                  background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                  color: mutedColor,
                }}
              >
                {a.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini Block Renderer (simplified for preview) ──

function MiniBlock({ block, dark, mutedColor }: { block: UIBlock; dark: boolean; mutedColor: string }) {
  const p = block.props as Record<string, any>;
  const cardBg = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";

  switch (block.type) {
    case "heading":
      return <div className="text-[10px] font-semibold leading-tight line-clamp-1">{p.text}</div>;

    case "text":
      return (
        <div
          className="text-[9px] leading-tight line-clamp-2"
          style={{ color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}
        >
          {(p.content as string).replace(/\*\*/g, "").replace(/\*/g, "").replace(/<[^>]+>/g, "")}
        </div>
      );

    case "list":
      return (
        <div className="space-y-0.5">
          {(p.items as string[]).slice(0, 3).map((item, i) => (
            <div key={i} className="text-[9px] leading-tight flex gap-1" style={{ color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}>
              <span className="opacity-40 select-none shrink-0">{"\u2022"}</span>
              <span className="line-clamp-1">{item.replace(/\*\*/g, "").replace(/\*/g, "")}</span>
            </div>
          ))}
        </div>
      );

    case "stats":
      return (
        <div className="flex gap-1">
          {(p.items as any[]).slice(0, 3).map((item: any, i: number) => (
            <div key={i} className="text-center px-1.5 py-1 rounded flex-1" style={{ background: cardBg }}>
              <div className="text-[10px] font-bold">{item.value}</div>
              <div className="text-[7px]" style={{ color: mutedColor }}>{item.label}</div>
            </div>
          ))}
        </div>
      );

    case "chart":
      return (
        <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ background: cardBg }}>
          <svg className="h-3 w-3 shrink-0" style={{ color: mutedColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          <span className="text-[9px]" style={{ color: mutedColor }}>{p.title || `${p.type} chart`}</span>
        </div>
      );

    case "quote":
      return (
        <div className="text-[9px] italic leading-tight line-clamp-2 pl-2" style={{ borderLeft: "2px solid rgba(0,0,0,0.15)", color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}>
          {p.text}
        </div>
      );

    case "callout":
      return (
        <div className="rounded px-2 py-1 text-[9px] leading-tight line-clamp-2" style={{ background: cardBg, color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}>
          {p.title && <span className="font-semibold">{p.title}: </span>}
          {(p.content as string).replace(/<[^>]+>/g, "")}
        </div>
      );

    case "code":
      return (
        <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ background: cardBg }}>
          <svg className="h-3 w-3 shrink-0" style={{ color: mutedColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="text-[9px]" style={{ color: mutedColor }}>{p.title || p.language || "code"}</span>
        </div>
      );

    case "quiz":
      return (
        <div className="rounded px-2 py-1.5" style={{ background: cardBg }}>
          <div className="text-[9px] font-medium line-clamp-1">{p.question}</div>
          <div className="text-[8px] mt-0.5" style={{ color: mutedColor }}>{(p.options as any[]).length} options</div>
        </div>
      );

    case "html":
      return (
        <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ background: cardBg }}>
          <svg className="h-3 w-3 shrink-0" style={{ color: mutedColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
          </svg>
          <span className="text-[9px]" style={{ color: mutedColor }}>Interactive widget</span>
        </div>
      );

    case "image":
      return (
        <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ background: cardBg }}>
          <svg className="h-3 w-3 shrink-0" style={{ color: mutedColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="text-[9px] line-clamp-1" style={{ color: mutedColor }}>{p.alt || p.caption || "Image"}</span>
        </div>
      );

    case "timeline":
      return (
        <div className="space-y-0.5 pl-2" style={{ borderLeft: "2px solid rgba(0,0,0,0.1)" }}>
          {(p.items as any[]).slice(0, 2).map((item: any, i: number) => (
            <div key={i}>
              <div className="text-[8px]" style={{ color: mutedColor }}>{item.date}</div>
              <div className="text-[9px] font-medium line-clamp-1">{item.title}</div>
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className="rounded px-2 py-1.5 flex items-center gap-1.5" style={{ background: cardBg }}>
          <svg className="h-3 w-3 shrink-0" style={{ color: mutedColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
          </svg>
          <span className="text-[9px]" style={{ color: mutedColor }}>
            {(p.headers as string[]).length} cols, {(p.rows as string[][]).length} rows
          </span>
        </div>
      );

    default:
      return (
        <div className="rounded px-2 py-1 text-[9px]" style={{ background: cardBg, color: mutedColor }}>
          {block.type}
        </div>
      );
  }
}
