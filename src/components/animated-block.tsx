"use client";

import { motion, type Variants } from "framer-motion";
import type { BlockAnimation } from "@/lib/types";
import type { ReactNode } from "react";

interface AnimatedBlockProps {
  animation?: BlockAnimation;
  currentTime: number;
  playing: boolean;
  children: ReactNode;
  className?: string;
}

const entranceVariants: Record<string, Variants> = {
  "fade-in": {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "slide-up": {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0 },
  },
  "slide-down": {
    hidden: { opacity: 0, y: -40 },
    visible: { opacity: 1, y: 0 },
  },
  "slide-left": {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-right": {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0 },
  },
  "scale-up": {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1 },
  },
  "blur-in": {
    hidden: { opacity: 0, filter: "blur(12px)" },
    visible: { opacity: 1, filter: "blur(0px)" },
  },
  none: {
    hidden: { opacity: 1 },
    visible: { opacity: 1 },
  },
};

export function AnimatedBlock({ animation, currentTime, playing, children, className }: AnimatedBlockProps) {
  if (!animation || animation.entrance === "none") {
    return <div className={className}>{children}</div>;
  }

  const shouldShow = currentTime >= animation.delay || !playing;
  const variants = entranceVariants[animation.entrance] || entranceVariants["fade-in"];

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate={shouldShow ? "visible" : "hidden"}
      variants={variants}
      transition={{
        duration: animation.duration || 0.6,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
