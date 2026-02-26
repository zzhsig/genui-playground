"use client";

import { motion, AnimatePresence } from "framer-motion";

interface GenerationProgressProps {
  steps: { message: string; step?: string; time: number }[];
  active: boolean;
}

const stepIcons: Record<string, string> = {
  thinking: "◆",
  searching: "◈",
  designing: "◇",
  building: "▣",
};

export function GenerationProgress({ steps, active }: GenerationProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] gap-8 px-6"
    >
      {/* Animated orb */}
      <div className="relative">
        <motion.div
          className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.8, 1, 0.8],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        />
        <motion.div
          className="absolute inset-5 rounded-full bg-primary/60"
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Steps list */}
      <div className="flex flex-col items-center gap-2 max-w-md">
        <AnimatePresence mode="popLayout">
          {steps.slice(-4).map((s, i) => {
            const isLatest = i === steps.slice(-4).length - 1 && active;
            const icon = stepIcons[s.step || "thinking"] || "◆";
            return (
              <motion.div
                key={`${s.time}-${s.message}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: isLatest ? 1 : 0.4, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className={`text-sm text-center flex items-center gap-2 ${isLatest ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                <span className={`text-xs ${isLatest ? "animate-pulse" : ""}`}>{icon}</span>
                <span className="truncate max-w-[300px]">{s.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
