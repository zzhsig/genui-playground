"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { UISlide, UIBlock, SlideAction, SlideNode } from "@/lib/types";
import { AnimatedBlock } from "./animated-block";
import { HtmlSandbox } from "./html-sandbox";
import { ChatPanel } from "./chat-panel";
import { LinkModal } from "./link-modal";

// ── Main Slide Renderer ──

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface SlideRendererProps {
  node: SlideNode;
  loading: boolean;
  autoPlayAudio: boolean;
  onAutoPlayChange: (value: boolean) => void;
  onNavigate: (slideId: string) => void;
  onContinue: () => void;
  onBranch: (prompt: string) => void;
  onRefresh: () => void;
}

export function SlideRenderer({ node, loading, autoPlayAudio, onAutoPlayChange, onNavigate, onContinue, onBranch, onRefresh }: SlideRendererProps) {
  const { slide, parentId, mainChildId, links, backlinks } = node;
  const dark = slide.dark ?? false;
  const bg = slide.background || "#ffffff";
  const textColor = dark ? "#f3f4f6" : "#111827";
  const mutedColor = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";

  const [chatState, setChatState] = useState<{
    selectedText: string;
    blockId: string | null;
    existingChatId?: string;
    existingMessages?: ChatMessage[];
  } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Annotate chatted text with dotted underlines
  useEffect(() => {
    if (!node.chats.length || !contentRef.current) return;
    const container = contentRef.current;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    for (const chat of node.chats) {
      for (const textNode of textNodes) {
        const content = textNode.textContent || "";
        const idx = content.indexOf(chat.selectedText);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + chat.selectedText.length);
          const mark = document.createElement("mark");
          mark.setAttribute("data-chat-id", chat.id);
          mark.setAttribute("data-chat-text", chat.selectedText);
          mark.style.cssText =
            "background:none;border-bottom:2px dotted rgba(99,102,241,0.6);cursor:pointer;padding-bottom:1px;color:inherit";
          try {
            range.surroundContents(mark);
          } catch {
            // Skip if range spans across elements
          }
          break;
        }
      }
    }

    return () => {
      container.querySelectorAll("mark[data-chat-id]").forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
          parent.normalize();
        }
      });
    };
  }, [node.chats, node.id]);

  // Click handler for chat annotations
  const handleContentClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest("mark[data-chat-id]");
      if (!mark) return;

      const chatId = mark.getAttribute("data-chat-id");
      const chatText = mark.getAttribute("data-chat-text");
      if (!chatId || !chatText) return;

      // Fetch existing messages
      try {
        const res = await fetch(`/api/slides/${node.id}/chat/${chatId}`);
        const messages = await res.json();
        setChatState({
          selectedText: chatText,
          blockId: null,
          existingChatId: chatId,
          existingMessages: messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        });
      } catch {
        setChatState({ selectedText: chatText, blockId: null, existingChatId: chatId });
      }
    },
    [node.id],
  );

  // Text selection handler
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 2 && text.length < 500) {
      // Check if this matches an existing chat — if so, the click handler covers it
      const anchor = sel?.anchorNode?.parentElement;
      if (anchor?.closest("mark[data-chat-id]")) return;

      let el = anchor;
      let blockId: string | null = null;
      while (el) {
        if (el.dataset.blockId) {
          blockId = el.dataset.blockId;
          break;
        }
        el = el.parentElement;
      }
      setChatState({ selectedText: text, blockId });
    }
  }, []);

  // Filter out "Continue" type actions — the right arrow handles this
  const branchActions = (slide.actions || []).filter((a) => {
    const label = a.label.toLowerCase();
    return !label.startsWith("continue") && !label.startsWith("next");
  });

  const isComplete = (slide.actions || []).some((a) => a.label.toLowerCase().includes("start over"));

  return (
    <motion.div
      key={node.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: bg, color: textColor }}
    >
      {/* Audio controls - top left */}
      <div className="absolute top-3 left-3 z-20">
        <AudioControls slide={slide} autoPlay={autoPlayAudio} onAutoPlayChange={onAutoPlayChange} />
      </div>

      {/* Content area */}
      <div
        ref={contentRef}
        className="flex-1 flex flex-col items-center justify-center px-16 py-8 gap-3 overflow-hidden min-h-0"
        onMouseUp={handleMouseUp}
        onClick={handleContentClick}
      >
        {slide.title && (
          <AnimatedBlock animation={{ entrance: "fade-in", delay: 0, duration: 0.5 }} currentTime={999} playing={false}>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-center leading-tight max-w-3xl">
              {slide.title}
            </h1>
          </AnimatedBlock>
        )}
        {slide.subtitle && (
          <AnimatedBlock animation={{ entrance: "fade-in", delay: 0.15, duration: 0.4 }} currentTime={999} playing={false}>
            <p className="text-base text-center max-w-2xl leading-relaxed" style={{ color: mutedColor }}>
              {slide.subtitle}
            </p>
          </AnimatedBlock>
        )}

        <div className="flex flex-col items-center w-full max-w-4xl gap-4 mt-4 overflow-hidden min-h-0">
          {slide.blocks.map((block) => (
            <AnimatedBlock
              key={block.id}
              animation={block.animation}
              currentTime={999}
              playing={false}
              className="w-full"
            >
              <div data-block-id={block.id}>
                <BlockRenderer block={block} dark={dark} mutedColor={mutedColor} />
              </div>
            </AnimatedBlock>
          ))}
        </div>

        {/* Links/backlinks are shown in the LinkModal via the link button below */}
      </div>

      {/* Bottom bar: ◀ [branch actions + link btn] ▶ */}
      <div className="flex items-end justify-between px-6 pb-6 pt-2">
        {/* Left — back arrow + link button */}
        <div className="flex items-center gap-2">
          {parentId ? (
            <NavButton onClick={() => onNavigate(parentId)} disabled={loading} direction="left" />
          ) : (
            <div className="w-10" />
          )}
          <button
            onClick={() => setShowLinkModal(true)}
            className="relative h-8 rounded-lg px-2 flex items-center gap-1.5 transition-all hover:scale-[1.04] cursor-pointer"
            style={{
              background: links.length + backlinks.length > 0 ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.04)",
              color: links.length + backlinks.length > 0 ? "#6366f1" : mutedColor,
            }}
            title="Linked slides"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            {links.length + backlinks.length > 0 && (
              <span className="text-[10px] font-semibold">{links.length + backlinks.length}</span>
            )}
          </button>
        </div>

        {/* Center — branch actions */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {branchActions.map((action, i) => (
            <ActionButton key={i} action={action} onClick={() => onBranch(action.prompt)} disabled={loading} />
          ))}
        </div>

        {/* Right arrow — continue main path (hidden on completion slides) */}
        <div className="w-24 flex justify-end">
          {!isComplete && <NavButton onClick={onContinue} disabled={loading} direction="right" />}
        </div>
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {chatState && (
          <ChatPanel
            slideId={node.id}
            selectedText={chatState.selectedText}
            blockId={chatState.blockId}
            existingChatId={chatState.existingChatId}
            existingMessages={chatState.existingMessages}
            dark={dark}
            onClose={() => {
              setChatState(null);
              window.getSelection()?.removeAllRanges();
              onRefresh();
            }}
            onTurnIntoSlide={async (chatId) => {
              setChatState(null);
              try {
                const res = await fetch(`/api/slides/${node.id}/chat/${chatId}/to-slide`, { method: "POST" });
                const reader = res.body!.getReader();
                const decoder = new TextDecoder();
                let buf = "";
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  for (const line of buf.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                      const ev = JSON.parse(line.slice(6));
                      if (ev.type === "done" && ev.slideId) onNavigate(ev.slideId);
                    } catch {
                      /* skip */
                    }
                  }
                  buf = buf.endsWith("\n") ? "" : buf.split("\n").pop() || "";
                }
              } catch {
                /* error */
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Link modal */}
      <AnimatePresence>
        {showLinkModal && (
          <LinkModal
            slideId={node.id}
            links={links}
            backlinks={backlinks}

            onClose={() => setShowLinkModal(false)}
            onLinked={onRefresh}
            onNavigate={(id) => {
              setShowLinkModal(false);
              onNavigate(id);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Nav Arrows ──

function NavButton({ onClick, disabled, direction }: { onClick: () => void; disabled: boolean; direction: "left" | "right" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-110 hover:bg-black/10 active:scale-95 cursor-pointer"
      style={{
        background: "rgba(0,0,0,0.05)",
        color: "rgba(0,0,0,0.5)",
      }}
    >
      {direction === "left" ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
}

// ── Action Button ──

function ActionButton({ action, onClick, disabled }: { action: SlideAction; onClick: () => void; disabled: boolean }) {
  const v = action.variant || "secondary";

  if (v === "primary") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 hover:scale-[1.04] hover:shadow-md active:scale-[0.97] cursor-pointer"
        style={{ background: "#111827", color: "#ffffff" }}
      >
        {disabled ? "Loading..." : action.label}
      </button>
    );
  }

  if (v === "secondary") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 hover:scale-[1.04] hover:bg-black/10 active:scale-[0.97] cursor-pointer"
        style={{ background: "rgba(0,0,0,0.06)", color: "#374151" }}
      >
        {action.label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-2 rounded-lg text-sm font-medium border transition-all duration-200 disabled:opacity-40 hover:scale-[1.04] hover:bg-black/5 active:scale-[0.97] cursor-pointer"
      style={{ borderColor: "rgba(0,0,0,0.15)", color: "rgba(0,0,0,0.5)", background: "transparent" }}
    >
      {action.label}
    </button>
  );
}

// ── Block Renderer ──

export function BlockRenderer({ block, dark, mutedColor }: { block: UIBlock; dark: boolean; mutedColor: string }) {
  const p = block.props as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const children = block.children;
  const cardBg = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
  const cardBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  switch (block.type) {
    case "heading": {
      const level = (p.level as number) || 2;
      const sizes: Record<number, string> = {
        1: "text-3xl md:text-4xl",
        2: "text-2xl md:text-3xl",
        3: "text-xl md:text-2xl",
        4: "text-lg md:text-xl",
        5: "text-base md:text-lg",
        6: "text-sm md:text-base",
      };
      return <div className={`${sizes[level]} font-bold tracking-tight`}>{p.text as string}</div>;
    }

    case "text":
      return (
        <div
          className="text-sm md:text-base leading-relaxed max-w-3xl"
          style={{ color: dark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)" }}
          dangerouslySetInnerHTML={{ __html: mdLite(p.content as string) }}
        />
      );

    case "image":
      return (
        <figure
          className={`${p.size === "full" ? "w-full" : p.size === "lg" ? "max-w-3xl" : p.size === "sm" ? "max-w-xs" : "max-w-xl"} mx-auto`}
        >
          <img src={p.src as string} alt={(p.alt as string) || ""} className="w-full h-auto rounded-xl" loading="lazy" />
          {p.caption && (
            <figcaption className="mt-2 text-xs text-center" style={{ color: mutedColor }}>
              {p.caption as string}
            </figcaption>
          )}
        </figure>
      );

    case "list":
      return (
        <ul className="space-y-2 text-sm md:text-base" style={{ color: dark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)" }}>
          {(p.items as string[]).slice(0, 5).map((item, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="mt-0.5 opacity-40 select-none">{p.icon || (p.ordered ? `${i + 1}.` : "\u2022")}</span>
              <span dangerouslySetInnerHTML={{ __html: mdLite(item) }} />
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <div className="border-l-2 pl-5 py-1 max-w-2xl" style={{ borderColor: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}>
          <p className="text-lg italic leading-relaxed" style={{ color: dark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)" }}>
            {p.text as string}
          </p>
          {p.author && (
            <p className="mt-2 text-sm" style={{ color: mutedColor }}>
              — {p.author as string}
            </p>
          )}
        </div>
      );

    case "callout": {
      const accents: Record<string, string> = { info: "#3b82f6", warning: "#f59e0b", success: "#10b981", tip: "#8b5cf6" };
      const accent = accents[(p.type as string) || "info"];
      return (
        <div className="rounded-lg px-5 py-4 w-full" style={{ background: cardBg, borderLeft: `3px solid ${accent}` }}>
          {p.title && <div className="font-semibold mb-1 text-sm">{p.title as string}</div>}
          <div
            className="text-sm"
            style={{ color: dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}
            dangerouslySetInnerHTML={{ __html: mdLite(p.content as string) }}
          />
        </div>
      );
    }

    case "card":
      return (
        <div className="rounded-xl overflow-hidden w-full" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          {p.image && <img src={p.image as string} alt="" className="w-full h-32 object-cover" loading="lazy" />}
          <div className="p-4">
            <div className="font-semibold text-sm mb-1">{p.title as string}</div>
            {p.description && (
              <div className="text-xs" style={{ color: mutedColor }} dangerouslySetInnerHTML={{ __html: mdLite(p.description as string) }} />
            )}
            {p.tags && (
              <div className="flex gap-1.5 mt-2">
                {(p.tags as string[]).map((t, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", color: mutedColor }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );

    case "grid":
      return (
        <div className="grid gap-4 w-full" style={{ gridTemplateColumns: `repeat(${Math.min(p.columns || 3, 4)}, minmax(0, 1fr))` }}>
          {children?.map((child) => <BlockRenderer key={child.id} block={child} dark={dark} mutedColor={mutedColor} />)}
        </div>
      );

    case "columns": {
      const template = ((p.ratio as string) || "1:1")
        .split(":")
        .map((c: string) => `${c}fr`)
        .join(" ");
      return (
        <div className="grid gap-6 w-full" style={{ gridTemplateColumns: template }}>
          {children?.map((child) => <BlockRenderer key={child.id} block={child} dark={dark} mutedColor={mutedColor} />)}
        </div>
      );
    }

    case "divider":
      return <div className="w-16 h-px mx-auto my-2" style={{ background: cardBorder }} />;

    case "stats":
      return (
        <div
          className="grid gap-4 w-full"
          style={{ gridTemplateColumns: `repeat(${p.columns || (p.items as any[]).length}, minmax(0, 1fr))` }}
        >
          {(p.items as any[]).map((item: any, i: number) => (
            <div key={i} className="rounded-xl p-5 text-center" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="text-2xl md:text-3xl font-bold">{item.value}</div>
              <div className="text-xs mt-1" style={{ color: mutedColor }}>
                {item.label}
              </div>
              {item.change && (
                <div className={`text-xs mt-1 font-medium ${item.trend === "down" ? "text-red-500" : "text-emerald-500"}`}>
                  {item.trend === "down" ? "\u2193" : "\u2191"} {item.change}
                </div>
              )}
            </div>
          ))}
        </div>
      );

    case "chart":
      return (
        <ChartBlock
          type={p.type as string}
          title={p.title as string}
          data={p.data as any[]}
          height={p.height as number}
          dark={dark}
          mutedColor={mutedColor}
          cardBg={cardBg}
          cardBorder={cardBorder}
        />
      );

    case "timeline":
      return (
        <div className="relative pl-6 w-full max-w-2xl">
          <div className="absolute left-2 top-1 bottom-1 w-px" style={{ background: cardBorder }} />
          {(p.items as any[]).slice(0, 4).map((item: any, i: number) => (
            <div key={i} className="relative mb-5 last:mb-0">
              <div
                className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full border-2"
                style={{
                  borderColor: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)",
                  background: dark ? "#111827" : "#ffffff",
                }}
              />
              <div className="text-xs font-medium" style={{ color: mutedColor }}>
                {item.date}
              </div>
              <div className="font-semibold text-sm">{item.title}</div>
              {item.description && (
                <p className="text-xs mt-0.5" style={{ color: mutedColor }} dangerouslySetInnerHTML={{ __html: mdLite(item.description) }} />
              )}
            </div>
          ))}
        </div>
      );

    case "table":
      return (
        <div className="rounded-xl overflow-hidden w-full" style={{ border: `1px solid ${cardBorder}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: cardBg }}>
                {(p.headers as string[]).map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 font-semibold text-xs">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(p.rows as string[][]).slice(0, 5).map((row, ri) => (
                <tr key={ri} style={{ borderTop: `1px solid ${cardBorder}` }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-xs">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "progress":
      return (
        <div className="space-y-3 w-full max-w-lg">
          {(p.items as any[]).map((item: any, i: number) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1">
                <span>{item.label}</span>
                <span style={{ color: mutedColor }}>{item.value}%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color || "#6366f1" }} />
              </div>
            </div>
          ))}
        </div>
      );

    case "quiz":
      return (
        <QuizBlock
          question={p.question as string}
          options={p.options as any[]}
          explanation={p.explanation as string}
          dark={dark}
          cardBg={cardBg}
          cardBorder={cardBorder}
          mutedColor={mutedColor}
        />
      );

    case "counter":
      return (
        <CounterBlock
          label={p.label as string}
          value={p.value as number}
          min={p.min as number}
          max={p.max as number}
          step={p.step as number}
          dark={dark}
          cardBg={cardBg}
          cardBorder={cardBorder}
        />
      );

    case "code":
      return (
        <div className="rounded-xl overflow-hidden w-full" style={{ border: `1px solid ${cardBorder}` }}>
          {p.title && (
            <div
              className="px-4 py-2 text-xs font-medium"
              style={{ background: cardBg, color: mutedColor, borderBottom: `1px solid ${cardBorder}` }}
            >
              {p.title as string}
            </div>
          )}
          <pre className="p-4 overflow-x-auto text-xs font-mono" style={{ background: dark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.02)" }}>
            <code>{p.code as string}</code>
          </pre>
        </div>
      );

    case "html":
      return <HtmlSandbox content={p.content as string} height={(p.height as string) || "280px"} />;

    default:
      return (
        <div className="text-xs" style={{ color: mutedColor }}>
          Unknown: {block.type}
        </div>
      );
  }
}

// ── Stateful Blocks ──

function QuizBlock({ question, options, explanation, dark, cardBg, cardBorder, mutedColor }: any) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  return (
    <div className="rounded-xl p-5 w-full max-w-xl" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
      <div className="font-semibold text-sm mb-3">{question}</div>
      <div className="space-y-2">
        {options.map((opt: any, i: number) => {
          let bg = "transparent",
            border = cardBorder;
          if (answered && opt.correct) {
            bg = "rgba(16,185,129,0.15)";
            border = "#10b981";
          } else if (answered && selected === i) {
            bg = "rgba(239,68,68,0.15)";
            border = "#ef4444";
          }
          return (
            <button
              key={i}
              onClick={() => !answered && setSelected(i)}
              disabled={answered}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all hover:bg-black/5 cursor-pointer"
              style={{ background: bg, border: `1px solid ${border}` }}
              dangerouslySetInnerHTML={{ __html: mdLite(opt.text) }}
            />
          );
        })}
      </div>
      {answered && explanation && (
        <div
          className="mt-3 text-xs p-3 rounded-lg"
          style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)", color: mutedColor }}
        >
          {explanation}
        </div>
      )}
    </div>
  );
}

function CounterBlock({ label, value: init, min, max, step, cardBg, cardBorder }: any) {
  const [value, setValue] = useState(init || 0);
  const s = step || 1;
  return (
    <div className="rounded-xl px-5 py-3 inline-flex items-center gap-4" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
      <span className="text-sm font-medium">{label}</span>
      <button
        onClick={() => setValue((v: number) => Math.max(min ?? -Infinity, v - s))}
        className="w-7 h-7 rounded-md flex items-center justify-center text-sm transition-all hover:bg-black/10 active:scale-90 cursor-pointer"
        style={{ border: `1px solid ${cardBorder}` }}
      >
        −
      </button>
      <span className="w-10 text-center font-mono font-bold text-sm">{value}</span>
      <button
        onClick={() => setValue((v: number) => Math.min(max ?? Infinity, v + s))}
        className="w-7 h-7 rounded-md flex items-center justify-center text-sm transition-all hover:bg-black/10 active:scale-90 cursor-pointer"
        style={{ border: `1px solid ${cardBorder}` }}
      >
        +
      </button>
    </div>
  );
}

// ── Chart ──

function ChartBlock({ type, title, data, height, dark, mutedColor, cardBg, cardBorder }: any) {
  const h = height || 160;
  const colors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

  if (type === "pie" || type === "donut") {
    const total = data.reduce((s: number, d: any) => s + d.value, 0);
    let cum = 0;
    const slices = data.map((d: any, i: number) => {
      const start = cum / total;
      cum += d.value;
      return { ...d, start, end: cum / total, color: d.color || colors[i % colors.length] };
    });
    return (
      <div className="rounded-xl p-5" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
        {title && <div className="font-semibold text-sm mb-3">{title}</div>}
        <div className="flex items-center gap-6">
          <svg width={h} height={h} viewBox="-1 -1 2 2" className="shrink-0">
            {slices.map((s: any, i: number) => {
              const sa = s.start * Math.PI * 2 - Math.PI / 2,
                ea = s.end * Math.PI * 2 - Math.PI / 2,
                la = s.end - s.start > 0.5 ? 1 : 0,
                ir = type === "donut" ? 0.6 : 0;
              const path =
                type === "donut"
                  ? `M${Math.cos(sa)} ${Math.sin(sa)} A1 1 0 ${la} 1 ${Math.cos(ea)} ${Math.sin(ea)} L${Math.cos(ea) * ir} ${Math.sin(ea) * ir} A${ir} ${ir} 0 ${la} 0 ${Math.cos(sa) * ir} ${Math.sin(sa) * ir}Z`
                  : `M0 0 L${Math.cos(sa)} ${Math.sin(sa)} A1 1 0 ${la} 1 ${Math.cos(ea)} ${Math.sin(ea)}Z`;
              return <path key={i} d={path} fill={s.color} stroke={dark ? "#111827" : "#ffffff"} strokeWidth="0.03" />;
            })}
          </svg>
          <div className="flex flex-col gap-1.5">
            {slices.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
                <span style={{ color: mutedColor }}>({Math.round((s.value / total) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d: any) => d.value));
  const pad = { top: 10, right: 10, bottom: 28, left: 36 },
    cw = 400;
  const bw = (cw - pad.left - pad.right) / data.length;
  const gridColor = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const labelColor = mutedColor;

  return (
    <div className="rounded-xl p-5" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
      {title && <div className="font-semibold text-sm mb-3">{title}</div>}
      <svg viewBox={`0 0 ${cw} ${h}`} className="w-full max-w-sm">
        {[0, 0.5, 1].map((f) => {
          const y = pad.top + (1 - f) * (h - pad.top - pad.bottom);
          return (
            <g key={f}>
              <line x1={pad.left} x2={cw - pad.right} y1={y} y2={y} stroke={gridColor} />
              <text x={pad.left - 5} y={y + 3} textAnchor="end" fontSize="8" fill={labelColor}>
                {Math.round(maxVal * f)}
              </text>
            </g>
          );
        })}
        {type === "line" ? (
          <>
            <polyline
              fill="none"
              stroke={colors[0]}
              strokeWidth="2"
              strokeLinejoin="round"
              points={data
                .map(
                  (d: any, i: number) =>
                    `${pad.left + bw * i + bw / 2},${pad.top + (1 - d.value / maxVal) * (h - pad.top - pad.bottom)}`,
                )
                .join(" ")}
            />
            {data.map((d: any, i: number) => (
              <circle
                key={i}
                cx={pad.left + bw * i + bw / 2}
                cy={pad.top + (1 - d.value / maxVal) * (h - pad.top - pad.bottom)}
                r="3"
                fill={d.color || colors[0]}
              />
            ))}
          </>
        ) : (
          data.map((d: any, i: number) => {
            const bh = (d.value / maxVal) * (h - pad.top - pad.bottom);
            return (
              <rect
                key={i}
                x={pad.left + bw * i + bw * 0.15}
                y={h - pad.bottom - bh}
                width={bw * 0.7}
                height={bh}
                rx="3"
                fill={d.color || colors[i % colors.length]}
              />
            );
          })
        )}
        {data.map((d: any, i: number) => (
          <text key={i} x={pad.left + bw * i + bw / 2} y={h - pad.bottom + 12} textAnchor="middle" fontSize="8" fill={labelColor}>
            {d.label.length > 8 ? d.label.slice(0, 7) + "\u2026" : d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Audio Controls ──

function extractSlideText(slide: UISlide): string {
  const parts: string[] = [];
  if (slide.title) parts.push(slide.title);
  if (slide.subtitle) parts.push(slide.subtitle);
  for (const block of slide.blocks) {
    const p = block.props as Record<string, any>;
    switch (block.type) {
      case "text": parts.push(p.content); break;
      case "heading": parts.push(p.text); break;
      case "list": if (p.items) parts.push((p.items as string[]).join(". ")); break;
      case "quote": parts.push(p.text); break;
      case "callout": if (p.content) parts.push(p.content); break;
      case "card": parts.push(p.title); if (p.description) parts.push(p.description); break;
    }
  }
  return parts.join(". ").replace(/\*\*/g, "").replace(/\*/g, "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ");
}

function AudioControls({ slide, autoPlay, onAutoPlayChange }: { slide: UISlide; autoPlay: boolean; onAutoPlayChange: (v: boolean) => void }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const text = useMemo(() => extractSlideText(slide), [slide]);

  useEffect(() => {
    if (autoPlay && !muted && text && typeof window !== "undefined" && window.speechSynthesis) {
      const timer = setTimeout(() => speak(text), 500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function speak(t: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(t);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  function togglePlay() {
    if (!window.speechSynthesis) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      speak(text);
    }
  }

  function toggleMute() {
    if (!muted && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    }
    setMuted(!muted);
  }

  if (!text) return null;

  const btnStyle = "h-7 w-7 rounded-md flex items-center justify-center transition-all hover:bg-black/8 cursor-pointer";

  return (
    <div className="flex items-center gap-0.5 rounded-lg px-1 py-0.5" style={{ background: "rgba(0,0,0,0.04)" }}>
      <button
        onClick={toggleMute}
        className={btnStyle}
        title={muted ? "Unmute" : "Mute"}
        style={{ color: muted ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.5)" }}
      >
        {muted ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        )}
      </button>
      <button
        onClick={togglePlay}
        disabled={muted}
        className={btnStyle}
        title={playing ? "Pause" : "Play"}
        style={{ color: muted ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.5)" }}
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>
      <button
        onClick={() => onAutoPlayChange(!autoPlay)}
        className={`${btnStyle} text-[9px] font-semibold`}
        title={autoPlay ? "Disable auto-play" : "Enable auto-play"}
        style={{ color: autoPlay ? "#6366f1" : "rgba(0,0,0,0.3)", background: autoPlay ? "rgba(99,102,241,0.1)" : "transparent", width: "auto", padding: "0 6px" }}
      >
        AUTO
      </button>
    </div>
  );
}

// ── Helpers ──

function mdLite(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="text-decoration:underline;text-underline-offset:2px">$1</a>',
    )
    .replace(/\n/g, "<br/>");
}
