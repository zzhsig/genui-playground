"use client";

import { useEffect, useRef } from "react";

interface HtmlSandboxProps {
  content: string;
  height?: string;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
}

export function HtmlSandbox({
  content,
  height = "500px",
  onAction,
}: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "genui-action" && onAction) {
        onAction(event.data.action, event.data.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onAction]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={content}
      sandbox="allow-scripts"
      style={{ width: "100%", height, border: "none", borderRadius: "8px" }}
      title="Custom widget"
    />
  );
}
