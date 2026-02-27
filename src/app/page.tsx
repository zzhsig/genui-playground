"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlideRenderer } from "@/components/slide-renderer";
import { PromptInput } from "@/components/prompt-input";
import { GenerationProgress } from "@/components/generation-progress";
import { Button } from "@/components/ui/button";
import type { SlideNode } from "@/lib/types";

// ── SSE stream helper ──

async function fetchSSE(
  url: string,
  options: RequestInit,
  cb: {
    onStatus?: (msg: string, step?: string) => void;
    onSlide?: (slide: any) => void;
    onDone?: (data: any) => void;
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
          case "done":
            cb.onDone?.(ev);
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

// Consume a response silently (handles both JSON and SSE), return the slideId
async function consumeSSE(res: Response): Promise<string | null> {
  const ct = res.headers.get("content-type") || "";

  // JSON response — branch/continue already exists
  if (ct.includes("application/json")) {
    const data = await res.json();
    return (data.slideId as string) || null;
  }

  // SSE stream — new generation
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
        if (ev.type === "done" && ev.slideId) resultId = ev.slideId;
      } catch {
        /* skip */
      }
    }
  }
  return resultId;
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

export default function Home() {
  const [currentNode, setCurrentNode] = useState<SlideNode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<{ message: string; step?: string; time: number }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [recentSlides, setRecentSlides] = useState<SlideListItem[]>([]);
  const [lastSlideId, setLastSlideId] = useState<string | null>(null);

  const pregenRef = useRef<{ id: string; promise: Promise<string | null> } | null>(null);
  const branchPregenRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const pregenAbortRef = useRef<AbortController | null>(null);
  const started = currentNode !== null || generating;

  // Fetch recent slides and last visited on mount
  useEffect(() => {
    fetch("/api/slides")
      .then((r) => r.json())
      .then((data: SlideListItem[]) => setRecentSlides(data))
      .catch(() => {});
    setLastSlideId(localStorage.getItem(LAST_SLIDE_KEY));
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
    if (!currentNode || generating) return;
    const slideId = currentNode.id;

    // Cancel previous pre-gen cycle
    pregenAbortRef.current?.abort();
    const abort = new AbortController();
    pregenAbortRef.current = abort;
    branchPregenRef.current = new Map();

    // 1. Pre-gen main child (right arrow)
    if (!currentNode.mainChildId) {
      const promise = (async (): Promise<string | null> => {
        try {
          const res = await fetch(`/api/slides/${slideId}/continue`, {
            method: "POST",
            signal: abort.signal,
          });
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            return data.slideId as string;
          }
          return await consumeSSE(res);
        } catch {
          return null;
        }
      })();

      pregenRef.current = { id: slideId, promise };

      promise.then((childId) => {
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
      const promise = (async (): Promise<string | null> => {
        try {
          const res = await fetch(`/api/slides/${slideId}/branch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: action.prompt }),
            signal: abort.signal,
          });
          return await consumeSSE(res);
        } catch {
          return null;
        }
      })();

      branchPregenRef.current.set(action.prompt, promise);

      promise.then((childId) => {
        if (childId && !abort.signal.aborted) {
          // Silently refresh to show branch chips
          loadSlide(slideId, false);
        }
      });
    }

    return () => {
      abort.abort();
      pregenRef.current = null;
      branchPregenRef.current = new Map();
    };
  }, [currentNode?.id, generating, loadSlide]);

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
            onDone: async (data) => {
              if (data.slideId) {
                await loadSlide(data.slideId);
              }
              setGenerating(false);
            },
            onError: (msg) => {
              setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
              setGenerating(false);
            },
          },
        );
      } catch (e) {
        setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
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

    // If pre-gen is in progress for this slide, wait for it
    if (pregenRef.current?.id === currentNode.id && pregenRef.current.promise) {
      setGenerating(true);
      setSteps([{ message: "Generating next slide...", time: Date.now() }]);
      const childId = await pregenRef.current.promise;
      if (childId) {
        await loadSlide(childId);
      }
      setGenerating(false);
      return;
    }

    // Generate main child (fallback)
    setGenerating(true);
    setSteps([]);

    try {
      const res = await fetch(`/api/slides/${currentNode.id}/continue`, { method: "POST" });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.slideId) await loadSlide(data.slideId);
        setGenerating(false);
        return;
      }

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
            if (ev.type === "status") setSteps((p) => [...p, { message: ev.message, step: ev.step, time: Date.now() }]);
            if (ev.type === "thinking")
              setSteps((p) => [...p, { message: ev.text?.slice(0, 120), step: "thinking", time: Date.now() }]);
            if (ev.type === "done" && ev.slideId) {
              await loadSlide(ev.slideId);
              setGenerating(false);
            }
            if (ev.type === "error") {
              setSteps((p) => [...p, { message: `Error: ${ev.message}`, time: Date.now() }]);
              setGenerating(false);
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch (e) {
      setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
      setGenerating(false);
    }
  }, [currentNode, loadSlide]);

  // Center action — use pre-gen if available, otherwise generate
  const handleBranch = useCallback(
    async (prompt: string) => {
      if (!currentNode) return;

      // Check if pre-gen has this prompt
      const pregenPromise = branchPregenRef.current.get(prompt);
      if (pregenPromise) {
        setGenerating(true);
        setSteps([{ message: "Preparing slide...", time: Date.now() }]);
        const childId = await pregenPromise;
        if (childId) {
          await loadSlide(childId);
          setGenerating(false);
          return;
        }
        // Pre-gen failed, fall through to fresh generation
      }

      // Generate fresh (fallback)
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
            onDone: async (data) => {
              if (data.slideId) await loadSlide(data.slideId);
              setGenerating(false);
            },
            onError: (msg) => {
              setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
              setGenerating(false);
            },
          },
        );
      } catch (e) {
        setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
        setGenerating(false);
      }
    },
    [currentNode, loadSlide],
  );

  // Refresh current node (after mutation like adding a link or chat)
  const handleRefresh = useCallback(() => {
    if (currentNode) loadSlide(currentNode.id, false);
  }, [currentNode, loadSlide]);

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

  // Root slides for landing page display
  const rootSlides = recentSlides.filter((s) => s.parentId === null);

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
            className="flex flex-col items-center gap-8 px-6 max-w-2xl w-full"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                <svg
                  className="h-7 w-7 text-white/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">Generative Learning Slides</h1>
              <p className="text-white/40 text-center max-w-sm text-sm">
                Ask any topic and explore it interactively, one slide at a time.
              </p>
            </div>

            <PromptInput onSubmit={(prompt) => generateRoot(prompt)} loading={false} compact={false} />

            <div className="flex flex-wrap gap-2 justify-center">
              {["Explain quantum computing", "History of space exploration", "Build a memory game"].map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="text-xs text-white/50 border-white/10 hover:bg-white/5 hover:text-white/80"
                  onClick={() => generateRoot(s)}
                >
                  {s}
                </Button>
              ))}
            </div>

            {/* Resume last slide */}
            {lastSlideId && (
              <button
                onClick={() => loadSlide(lastSlideId)}
                className="text-sm text-white/50 hover:text-white/80 transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                Resume where you left off
              </button>
            )}

            {/* Recent slides */}
            {rootSlides.length > 0 && (
              <div className="w-full max-w-md">
                <div className="text-xs text-white/30 uppercase tracking-wider mb-2">Recent topics</div>
                <div className="flex flex-col gap-1">
                  {rootSlides.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSlide(s.id)}
                      className="text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white/90 hover:bg-white/5 transition-all flex items-center justify-between group"
                    >
                      <span className="truncate">{s.title || "Untitled"}</span>
                      <svg
                        className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
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
              {generating && !currentNode ? (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-neutral-900"
                >
                  <GenerationProgress steps={steps} active={true} />
                </motion.div>
              ) : currentNode ? (
                <SlideRenderer
                  key={currentNode.id}
                  node={currentNode}
                  loading={generating}
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

            {/* Reset button */}
            {currentNode && !generating && (
              <button
                onClick={handleReset}
                className="absolute top-3 right-3 z-20 h-8 w-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-sm"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Breadcrumb path */}
          {history.length > 1 && (
            <div className="flex items-center justify-center gap-1 py-2 overflow-x-auto">
              {history.map((id) => (
                <button
                  key={id}
                  onClick={() => loadSlide(id)}
                  className={`h-1.5 rounded-full transition-all ${
                    id === currentNode?.id ? "w-6 bg-white/70" : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
