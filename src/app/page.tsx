"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlideRenderer } from "@/components/slide-renderer";
import { SlideGraph } from "@/components/slide-graph";
import { PromptInput } from "@/components/prompt-input";
import { GenerationProgress } from "@/components/generation-progress";
import type { SlideNode, UISlide } from "@/lib/types";

// ── SSE stream helper ──

async function fetchSSE(
  url: string,
  options: RequestInit,
  cb: {
    onStatus?: (msg: string, step?: string) => void;
    onSlide?: (slide: any) => void;
    onSlidePartial?: (slide: any) => void;
    onDone?: (data: any) => void | Promise<void>;
    onError?: (msg: string) => void;
  },
) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
        const ev = JSON.parse(line.slice(6));
        switch (ev.type) {
          case "status":
            cb.onStatus?.(ev.message, ev.step);
            break;
          case "thinking":
            cb.onStatus?.(ev.text?.slice(0, 120), "thinking");
            break;
          case "slide":
            cb.onSlide?.(ev.slide);
            break;
          case "slide_partial":
            cb.onSlidePartial?.(ev.slide);
            break;
          case "done":
            await cb.onDone?.(ev);
            break;
          case "error":
            cb.onError?.(ev.message);
            break;
        }
      } catch {
        /* skip */
      }
    }
  }
}

// ── PregenHandle: subscribe to partial slides during pre-generation ──

interface PregenHandle {
  promise: Promise<string | null>;
  partialSlide: UISlide | null;
  subscribe(cb: (slide: UISlide) => void): () => void;
}

function createPregenHandle(fetchPromise: Promise<Response>): PregenHandle {
  let latestPartial: UISlide | null = null;
  const subscribers = new Set<(slide: UISlide) => void>();

  const notify = (slide: UISlide) => {
    latestPartial = slide;
    for (const cb of subscribers) cb(slide);
  };

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await fetchPromise;
      const ct = res.headers.get("content-type") || "";

      // JSON response — already cached
      if (ct.includes("application/json")) {
        const data = await res.json();
        return (data.slideId as string) || null;
      }

      // SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let resultId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "slide_partial" && ev.slide) notify(ev.slide);
            if (ev.type === "slide" && ev.slide) notify(ev.slide);
            if (ev.type === "done" && ev.slideId) resultId = ev.slideId;
          } catch {
            /* skip */
          }
        }
      }
      return resultId;
    } catch {
      return null;
    }
  })();

  return {
    promise,
    get partialSlide() { return latestPartial; },
    subscribe(cb) {
      subscribers.add(cb);
      return () => { subscribers.delete(cb); };
    },
  };
}

// Create a minimal SlideNode wrapper for preview rendering
function syntheticNode(slide: UISlide): SlideNode {
  return {
    id: "preview",
    slide,
    parentId: null,
    mainChildId: null,
    conversationHistory: [],
    children: [],
    links: [],
    backlinks: [],
    chats: [],
    createdAt: Date.now(),
  };
}

// ── Types ──

interface SlideListItem {
  id: string;
  title: string | null;
  parentId: string | null;
  createdAt: number | null;
}

// ── Component ──

const LAST_SLIDE_KEY = "genui-last-slide";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Home() {
  const [currentNode, setCurrentNode] = useState<SlideNode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<{ message: string; step?: string; time: number }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [recentSlides, setRecentSlides] = useState<SlideListItem[]>([]);
  const [lastSlideId, setLastSlideId] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState(false);

  const [previewSlide, setPreviewSlide] = useState<UISlide | null>(null);

  const pregenRef = useRef<{ id: string; handle: PregenHandle } | null>(null);
  const branchPregenRef = useRef<Map<string, PregenHandle>>(new Map());
  const pregenAbortRef = useRef<AbortController | null>(null);
  const generatingRef = useRef(false);
  generatingRef.current = generating;
  const started = currentNode !== null || generating;

  // Fetch recent slides and last visited on mount
  useEffect(() => {
    fetch("/api/slides")
      .then((r) => r.json())
      .then((data: SlideListItem[]) => setRecentSlides(data))
      .catch(() => {});
    setLastSlideId(localStorage.getItem(LAST_SLIDE_KEY));
    setAutoPlayAudio(localStorage.getItem("genui-auto-audio") === "true");
  }, []);

  // Load a slide from the DB
  const loadSlide = useCallback(async (slideId: string, pushHistory = true) => {
    try {
      const res = await fetch(`/api/slides/${slideId}`);
      if (!res.ok) return;
      const node: SlideNode = await res.json();
      setCurrentNode(node);
      localStorage.setItem(LAST_SLIDE_KEY, slideId);
      if (pushHistory) {
        setHistory((prev) => {
          if (prev[prev.length - 1] === slideId) return prev;
          return [...prev, slideId];
        });
      }
    } catch {
      /* error loading */
    }
  }, []);

  // Pre-generate main child + branch actions when a slide loads
  useEffect(() => {
    if (!currentNode || generatingRef.current) return;
    const slideId = currentNode.id;

    // Cancel previous pre-gen cycle
    pregenAbortRef.current?.abort();
    const abort = new AbortController();
    pregenAbortRef.current = abort;
    branchPregenRef.current = new Map();

    // 1. Pre-gen main child (right arrow)
    if (!currentNode.mainChildId) {
      const handle = createPregenHandle(
        fetch(`/api/slides/${slideId}/continue`, {
          method: "POST",
          signal: abort.signal,
        })
      );

      pregenRef.current = { id: slideId, handle };

      handle.promise.then((childId) => {
        if (childId && !abort.signal.aborted && pregenRef.current?.id === slideId) {
          loadSlide(slideId, false);
        }
      });
    }

    // 2. Pre-gen branch actions
    const actions = (currentNode.slide.actions || []).filter((a) => {
      const label = a.label.toLowerCase();
      return !label.startsWith("continue") && !label.startsWith("next");
    });

    for (const action of actions) {
      const handle = createPregenHandle(
        fetch(`/api/slides/${slideId}/branch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: action.prompt }),
          signal: abort.signal,
        })
      );

      branchPregenRef.current.set(action.prompt, handle);

      handle.promise.then((childId) => {
        if (childId && !abort.signal.aborted && branchPregenRef.current.get(action.prompt) === handle) {
          loadSlide(slideId, false);
        }
      });
    }

    return () => {
      abort.abort();
      pregenRef.current = null;
      branchPregenRef.current = new Map();
    };
  }, [currentNode?.id, loadSlide]);

  // Generate a root slide (initial prompt)
  const generateRoot = useCallback(
    async (prompt: string) => {
      setGenerating(true);
      setSteps([]);
      setHistory([]);

      try {
        await fetchSSE(
          "/api/slides",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          },
          {
            onStatus: (msg, step) => setSteps((p) => [...p, { message: msg, step, time: Date.now() }]),
            onSlidePartial: (slide) => setPreviewSlide(slide),
            onDone: async (data) => {
              if (data.slideId) {
                await loadSlide(data.slideId);
              }
              setPreviewSlide(null);
              setGenerating(false);
            },
            onError: (msg) => {
              setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
              setPreviewSlide(null);
              setGenerating(false);
            },
          },
        );
      } catch (e) {
        setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
        setPreviewSlide(null);
        setGenerating(false);
      }
    },
    [loadSlide],
  );

  // Navigate to an existing slide
  const handleNavigate = useCallback(
    (slideId: string) => {
      loadSlide(slideId);
    },
    [loadSlide],
  );

  // Right arrow — continue main path (uses pre-gen if available)
  const handleContinue = useCallback(async () => {
    if (!currentNode) return;

    // If main child already exists, just navigate
    if (currentNode.mainChildId) {
      loadSlide(currentNode.mainChildId);
      return;
    }

    // If pre-gen is in progress for this slide, subscribe for progressive rendering
    if (pregenRef.current?.id === currentNode.id && pregenRef.current.handle) {
      const handle = pregenRef.current.handle;
      pregenRef.current = null; // prevent .then() from racing with navigation
      setGenerating(true);
      setSteps([{ message: "Generating next slide...", time: Date.now() }]);

      // Show partial immediately if available
      if (handle.partialSlide) setPreviewSlide(handle.partialSlide);

      // Subscribe to live updates
      const unsub = handle.subscribe((slide) => setPreviewSlide(slide));
      const childId = await handle.promise;
      unsub();

      if (childId) {
        await loadSlide(childId);
        setPreviewSlide(null);
        setGenerating(false);
        return;
      }
      setPreviewSlide(null);
      // Pre-gen failed, fall through to fresh generation
    }

    // Generate main child (fallback with progressive rendering)
    setGenerating(true);
    setSteps([]);

    try {
      await fetchSSE(
        `/api/slides/${currentNode.id}/continue`,
        { method: "POST" },
        {
          onStatus: (msg, step) => setSteps((p) => [...p, { message: msg, step, time: Date.now() }]),
          onSlidePartial: (slide) => setPreviewSlide(slide),
          onDone: async (data) => {
            if (data.slideId) await loadSlide(data.slideId);
            setPreviewSlide(null);
            setGenerating(false);
          },
          onError: (msg) => {
            setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
            setPreviewSlide(null);
            setGenerating(false);
          },
        },
      );
    } catch (e) {
      setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
      setPreviewSlide(null);
      setGenerating(false);
    }
  }, [currentNode, loadSlide]);

  // Center action — use pre-gen if available, otherwise generate
  const handleBranch = useCallback(
    async (prompt: string) => {
      if (!currentNode) return;

      // Check if pre-gen has this prompt
      const handle = branchPregenRef.current.get(prompt);
      if (handle) {
        branchPregenRef.current.delete(prompt); // prevent .then() from racing with navigation
        setGenerating(true);
        setSteps([{ message: "Preparing slide...", time: Date.now() }]);

        if (handle.partialSlide) setPreviewSlide(handle.partialSlide);
        const unsub = handle.subscribe((slide) => setPreviewSlide(slide));
        const childId = await handle.promise;
        unsub();

        if (childId) {
          await loadSlide(childId);
          setPreviewSlide(null);
          setGenerating(false);
          return;
        }
        setPreviewSlide(null);
        // Pre-gen failed, fall through to fresh generation
      }

      // Generate fresh (fallback with progressive rendering)
      setGenerating(true);
      setSteps([]);

      try {
        await fetchSSE(
          `/api/slides/${currentNode.id}/branch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          },
          {
            onStatus: (msg, step) => setSteps((p) => [...p, { message: msg, step, time: Date.now() }]),
            onSlidePartial: (slide) => setPreviewSlide(slide),
            onDone: async (data) => {
              if (data.slideId) await loadSlide(data.slideId);
              setPreviewSlide(null);
              setGenerating(false);
            },
            onError: (msg) => {
              setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
              setPreviewSlide(null);
              setGenerating(false);
            },
          },
        );
      } catch (e) {
        setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
        setPreviewSlide(null);
        setGenerating(false);
      }
    },
    [currentNode, loadSlide],
  );

  // Refresh current node (after mutation like adding a link or chat)
  const handleRefresh = useCallback(() => {
    if (currentNode) loadSlide(currentNode.id, false);
  }, [currentNode, loadSlide]);

  const handleAutoPlayChange = useCallback((value: boolean) => {
    setAutoPlayAudio(value);
    localStorage.setItem("genui-auto-audio", value.toString());
  }, []);

  const handleReset = () => {
    setCurrentNode(null);
    setGenerating(false);
    setSteps([]);
    setHistory([]);
    // Refresh recent slides list
    fetch("/api/slides")
      .then((r) => r.json())
      .then((data: SlideListItem[]) => setRecentSlides(data))
      .catch(() => {});
  };

  const [historySearch, setHistorySearch] = useState("");

  const filteredSlides = historySearch.trim()
    ? recentSlides.filter((s) => (s.title || "").toLowerCase().includes(historySearch.toLowerCase()))
    : recentSlides;

  // ── UI ──

  return (
    <div className="dark h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {!started && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-6 px-6 w-full max-w-xl"
          >
            {/* Branding */}
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center border border-white/[0.08]">
                <svg className="h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Lantern</h1>
              <p className="text-white/35 text-center text-sm">Illuminating concepts step by step in the dark.</p>
            </div>

            {/* Prompt */}
            <PromptInput onSubmit={(prompt) => generateRoot(prompt)} loading={false} compact={false} />

            {/* Suggestions */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {["Quantum computing", "Build a memory game"].map((s) => (
                <button
                  key={s}
                  onClick={() => generateRoot(s)}
                  className="px-3 py-1.5 rounded-lg text-xs text-white/40 border border-white/[0.07] hover:bg-white/5 hover:text-white/70 transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* History panel */}
            {recentSlides.length > 0 && (
              <div className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/50">Your slides</span>
                    <span className="text-[10px] text-white/25 tabular-nums">{recentSlides.length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {lastSlideId && (
                      <button
                        onClick={() => loadSlide(lastSlideId)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-indigo-400/80 hover:bg-indigo-400/10 transition-all cursor-pointer"
                        title="Resume where you left off"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => setShowGraph(true)}
                      className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
                      title="Slide map"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="6" cy="6" r="2" />
                        <circle cx="18" cy="6" r="2" />
                        <line x1="8" y1="7.5" x2="10.5" y2="10.5" />
                        <line x1="13.5" y1="10.5" x2="16" y2="7.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Scrollable list */}
                <div className="max-h-[240px] overflow-y-auto">
                  {filteredSlides.length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-white/20">
                      {historySearch.trim() ? "No matching slides" : "No slides yet"}
                    </div>
                  )}
                  {filteredSlides.map((s) => {
                    const isLast = s.id === lastSlideId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => loadSlide(s.id)}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition-all group cursor-pointer border-b border-white/[0.03] last:border-b-0"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLast ? "bg-indigo-400" : s.parentId ? "bg-white/10" : "bg-white/20"}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm truncate ${isLast ? "text-white/90" : "text-white/55"} group-hover:text-white/90 transition-colors`}>
                            {s.title || "Untitled"}
                          </div>
                          {s.createdAt && (
                            <div className="text-[10px] text-white/20 mt-0.5">{relativeTime(s.createdAt)}</div>
                          )}
                        </div>
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-white/0 group-hover:text-white/30 transition-colors"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>

                {/* Search bar at the bottom */}
                <div className="px-3 py-2 border-t border-white/[0.06]">
                  <div className="relative">
                    <svg
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20 pointer-events-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search slides..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/70 placeholder:text-white/20 outline-none focus:border-white/15 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {started && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col w-full h-full max-w-[1200px] max-h-[750px] md:my-4"
        >
          {/* Viewport */}
          <div className="relative flex-1 bg-neutral-900 md:rounded-xl overflow-hidden">
            <AnimatePresence mode="wait">
              {generating ? (
                <SlideRenderer
                  key="preview"
                  node={syntheticNode(previewSlide || { id: "loading", blocks: [], actions: [] })}
                  loading={true}
                  autoPlayAudio={false}
                  onAutoPlayChange={handleAutoPlayChange}
                  onNavigate={handleNavigate}
                  onContinue={handleContinue}
                  onBranch={handleBranch}
                  onRefresh={handleRefresh}
                  statusMessage={!previewSlide && steps.length > 0 ? steps[steps.length - 1].message : undefined}
                />
              ) : currentNode ? (
                <SlideRenderer
                  key={currentNode.id}
                  node={currentNode}
                  loading={false}
                  autoPlayAudio={autoPlayAudio}
                  onAutoPlayChange={handleAutoPlayChange}
                  onNavigate={handleNavigate}
                  onContinue={handleContinue}
                  onBranch={handleBranch}
                  onRefresh={handleRefresh}
                />
              ) : null}
            </AnimatePresence>

            {/* Loading bar */}
            {generating && currentNode && (
              <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden">
                <motion.div
                  className="h-full w-1/3 bg-white/25 rounded-full"
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                />
              </div>
            )}

            {/* Map + Reset buttons */}
            {currentNode && !generating && (
              <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
                <button
                  onClick={() => setShowGraph(true)}
                  className="h-8 w-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-sm cursor-pointer"
                  title="Slide map"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="6" cy="6" r="2" />
                    <circle cx="18" cy="6" r="2" />
                    <line x1="8" y1="7.5" x2="10.5" y2="10.5" />
                    <line x1="13.5" y1="10.5" x2="16" y2="7.5" />
                  </svg>
                </button>
                <button
                  onClick={handleReset}
                  className="h-8 w-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-sm cursor-pointer"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Breadcrumb path */}
          {history.length > 1 && (
            <div className="flex items-center justify-center gap-1 py-2 overflow-x-auto">
              {history.map((id, i) => (
                <button
                  key={`${id}-${i}`}
                  onClick={() => !generating && loadSlide(id)}
                  disabled={generating}
                  className={`h-1.5 rounded-full transition-all ${
                    id === currentNode?.id ? "w-6 bg-white/70" : "w-1.5 bg-white/20 hover:bg-white/40"
                  } ${generating ? "pointer-events-none opacity-50" : ""}`}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Graph overlay */}
      <AnimatePresence>
        {showGraph && (
          <SlideGraph
            onNavigate={(slideId) => {
              setShowGraph(false);
              loadSlide(slideId);
            }}
            onClose={() => setShowGraph(false)}
            currentSlideId={currentNode?.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
