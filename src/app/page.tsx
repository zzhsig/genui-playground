"use client";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlideRenderer } from "@/components/slide-renderer";
import { PromptInput } from "@/components/prompt-input";
import { GenerationProgress } from "@/components/generation-progress";
import { Button } from "@/components/ui/button";
import type { UISlide, SSEEvent, ConversationMessage } from "@/lib/types";

// ── Types ──

interface SlideEntry {
  _id: number;
  slide: UISlide;
  history: ConversationMessage[];
}

interface PregenEntry {
  slide: UISlide | null;
  history: ConversationMessage[] | null;
  done: boolean;
  claimed: boolean;
  entryId?: number;
}

// ── SSE stream helper ──

async function fetchSSE(
  prompt: string,
  conversationHistory: ConversationMessage[],
  signal: AbortSignal,
  cb: {
    onStatus?: (msg: string, step?: string) => void;
    onSlide?: (slide: UISlide) => void;
    onDone?: (history: ConversationMessage[]) => void;
    onError?: (msg: string) => void;
  },
) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, conversationHistory }),
    signal,
  });
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
        const ev: SSEEvent = JSON.parse(line.slice(6));
        switch (ev.type) {
          case "status": cb.onStatus?.(ev.message, ev.step); break;
          case "thinking": cb.onStatus?.(ev.text.slice(0, 120), "thinking"); break;
          case "slide": cb.onSlide?.(ev.slide); break;
          case "done": cb.onDone?.(ev.conversationHistory); break;
          case "error": cb.onError?.(ev.message); break;
        }
      } catch { /* skip malformed */ }
    }
  }
}

// ── Component ──

let entryCounter = 0;

export default function Home() {
  const [entries, setEntries] = useState<SlideEntry[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [steps, setSteps] = useState<{ message: string; step?: string; time: number }[]>([]);

  const pregenMap = useRef<Map<string, PregenEntry>>(new Map());
  const pregenControllers = useRef<AbortController[]>([]);
  const pendingAction = useRef<string | null>(null);
  const mainController = useRef<AbortController | null>(null);

  const currentSlide = entries[viewIndex]?.slide ?? null;
  const started = entries.length > 0 || generating;

  // ── Helpers ──

  const cancelPregens = useCallback(() => {
    pregenControllers.current.forEach((c) => c.abort());
    pregenControllers.current = [];
    pregenMap.current.clear();
    pendingAction.current = null;
  }, []);

  const addSlide = useCallback((slide: UISlide, history: ConversationMessage[]): number => {
    const id = ++entryCounter;
    setEntries((prev) => {
      const next = [...prev, { _id: id, slide, history }];
      setViewIndex(next.length - 1);
      return next;
    });
    return id;
  }, []);

  const updateEntryHistory = useCallback((entryId: number, history: ConversationMessage[]) => {
    setEntries((prev) => prev.map((e) => (e._id === entryId ? { ...e, history } : e)));
  }, []);

  // ── Pre-generation ──

  const pregenActions = useCallback(
    (slide: UISlide, history: ConversationMessage[]) => {
      cancelPregens();
      if (!slide.actions?.length) return;

      for (const action of slide.actions) {
        const entry: PregenEntry = { slide: null, history: null, done: false, claimed: false };
        pregenMap.current.set(action.prompt, entry);

        const ctrl = new AbortController();
        pregenControllers.current.push(ctrl);

        fetchSSE(action.prompt, history, ctrl.signal, {
          onSlide: (s) => {
            entry.slide = s;
            if (pendingAction.current === action.prompt) {
              pendingAction.current = null;
              entry.claimed = true;
              entry.entryId = addSlide(s, history);
              setGenerating(false);
            }
          },
          onDone: (h) => {
            entry.history = h;
            entry.done = true;
            if (entry.claimed && entry.slide) {
              if (entry.entryId) updateEntryHistory(entry.entryId, h);
              pregenActions(entry.slide, h);
            }
          },
        }).catch(() => { /* aborted */ });
      }
    },
    [cancelPregens, addSlide, updateEntryHistory],
  );

  // ── Main generation ──

  const generate = useCallback(
    async (prompt: string, baseHistory?: ConversationMessage[]) => {
      setGenerating(true);
      setSteps([]);
      cancelPregens();
      mainController.current?.abort();

      const ctrl = new AbortController();
      mainController.current = ctrl;

      const history = baseHistory || [];
      let latestSlide: UISlide | null = null;
      let latestEntryId: number | null = null;

      try {
        await fetchSSE(prompt, history, ctrl.signal, {
          onStatus: (msg, step) => setSteps((p) => [...p, { message: msg, step, time: Date.now() }]),
          onSlide: (slide) => {
            latestSlide = slide;
            latestEntryId = addSlide(slide, history);
            // Keep generating=true until onDone so actions stay disabled until pregens start
          },
          onDone: (h) => {
            setGenerating(false);
            if (latestSlide && latestEntryId) {
              updateEntryHistory(latestEntryId, h);
              pregenActions(latestSlide, h);
            }
          },
          onError: (msg) => {
            setSteps((p) => [...p, { message: `Error: ${msg}`, time: Date.now() }]);
            setGenerating(false);
          },
        });
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setSteps((p) => [...p, { message: e instanceof Error ? e.message : "Error", time: Date.now() }]);
          setGenerating(false);
        }
      }
    },
    [cancelPregens, addSlide, updateEntryHistory, pregenActions],
  );

  // ── Action handling ──

  const handleAction = useCallback(
    (prompt: string) => {
      // Branching from a past slide — truncate and generate fresh
      if (viewIndex < entries.length - 1) {
        const base = entries[viewIndex];
        setEntries((prev) => prev.slice(0, viewIndex + 1));
        cancelPregens();
        generate(prompt, base.history);
        return;
      }

      const cached = pregenMap.current.get(prompt);

      if (cached?.slide) {
        // Pre-generated slide ready — show instantly
        cached.claimed = true;
        const hist = cached.done && cached.history ? cached.history : entries[entries.length - 1]?.history || [];
        cached.entryId = addSlide(cached.slide, hist);

        if (cached.done && cached.history) {
          updateEntryHistory(cached.entryId, cached.history);
          pregenActions(cached.slide, cached.history);
        }
        // else: onDone callback will handle when it fires
      } else if (cached) {
        // Pre-generation in flight — wait
        setGenerating(true);
        setSteps([{ message: "Loading next slide...", time: Date.now() }]);
        cached.claimed = true;
        pendingAction.current = prompt;
      } else {
        // No pregen — generate fresh
        const lastHistory = entries[entries.length - 1]?.history || [];
        generate(prompt, lastHistory);
      }
    },
    [viewIndex, entries, cancelPregens, generate, addSlide, updateEntryHistory, pregenActions],
  );

  const handleReset = () => {
    cancelPregens();
    mainController.current?.abort();
    setEntries([]);
    setViewIndex(0);
    setGenerating(false);
    setSteps([]);
  };

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
            className="flex flex-col items-center gap-8 px-6"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                <svg className="h-7 w-7 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">Generative Learning Slides</h1>
              <p className="text-white/40 text-center max-w-sm text-sm">
                Ask any topic and explore it interactively, one slide at a time.
              </p>
            </div>
            <PromptInput onSubmit={(prompt) => generate(prompt)} loading={false} compact={false} />
            <div className="flex flex-wrap gap-2 justify-center">
              {["Explain quantum computing", "History of space exploration", "Build a memory game"].map((s) => (
                <Button key={s} variant="outline" size="sm" className="text-xs text-white/50 border-white/10 hover:bg-white/5 hover:text-white/80" onClick={() => generate(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {started && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col w-full h-full max-w-[1200px] max-h-[750px] md:my-4"
        >
          {/* 16:9 viewport */}
          <div className="relative flex-1 bg-neutral-900 md:rounded-xl overflow-hidden">
            <AnimatePresence mode="wait">
              {generating && !currentSlide ? (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-neutral-900"
                >
                  <GenerationProgress steps={steps} active={true} />
                </motion.div>
              ) : currentSlide ? (
                <SlideRenderer
                  key={currentSlide.id}
                  slide={currentSlide}
                  onAction={handleAction}
                  loading={generating}
                />
              ) : null}
            </AnimatePresence>

            {/* Subtle loading bar while finishing generation (slide visible but actions disabled) */}
            {generating && currentSlide && (
              <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden">
                <motion.div
                  className="h-full w-1/3 bg-white/25 rounded-full"
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                />
              </div>
            )}

            {/* Reset button */}
            {entries.length > 0 && !generating && (
              <button onClick={handleReset} className="absolute top-3 right-3 z-20 h-8 w-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-sm">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Slide navigation dots */}
          {entries.length > 1 && (
            <div className="flex items-center justify-center gap-3 py-3">
              <button
                onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
                disabled={viewIndex === 0}
                className="text-white/40 hover:text-white/80 disabled:opacity-20 transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <div className="flex gap-1.5">
                {entries.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setViewIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === viewIndex ? "w-6 bg-white/70" : "w-1.5 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setViewIndex((i) => Math.min(entries.length - 1, i + 1))}
                disabled={viewIndex === entries.length - 1}
                className="text-white/40 hover:text-white/80 disabled:opacity-20 transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
