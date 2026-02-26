"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  compact: boolean;
}

export function PromptInput({ onSubmit, loading, compact }: PromptInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
  }, [loading]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div className={`w-full ${compact ? "max-w-xl" : "max-w-lg"}`}>
      <div className="relative group">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={compact ? "Ask a follow-up..." : "Describe an experience to create..."}
          disabled={loading}
          rows={compact ? 1 : 2}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-4 py-3 pr-12 text-sm text-white shadow-sm outline-none transition-all placeholder:text-white/35 focus:ring-2 focus:ring-white/20 focus:border-white/30 disabled:opacity-50"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60 40" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </Button>
      </div>
    </div>
  );
}
