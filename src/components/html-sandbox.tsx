"use client";

import { useEffect, useRef, useMemo } from "react";

const REACT_SCRIPTS = `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`;

function prepareContent(content: string): string {
  // Content with <head> — inject React scripts into head
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${REACT_SCRIPTS}`);
  }

  // Content with <html> but no <head> — add head with scripts
  if (/<html[\s>]/i.test(content)) {
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${REACT_SCRIPTS}</head>`);
  }

  // Plain content — wrap in full document with React available
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<script src="https://cdn.tailwindcss.com"></script>
${REACT_SCRIPTS}
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}#root{width:100%;height:100%}</style>
</head><body><div id="root"></div>
${content}
</body></html>`;
}

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
  const preparedContent = useMemo(() => prepareContent(content), [content]);

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
      srcDoc={preparedContent}
      sandbox="allow-scripts"
      style={{ width: "100%", height, border: "none", borderRadius: "8px" }}
      title="Custom widget"
    />
  );
}
