"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface NodeData {
  id: string;
  title: string | null;
  parentId: string | null;
}

interface LinkData {
  from: string;
  to: string;
}

interface SimNode extends NodeData {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SimEdge {
  from: string;
  to: string;
  type: "child" | "link";
}

interface SlideGraphProps {
  onNavigate: (slideId: string) => void;
  onClose: () => void;
  currentSlideId?: string;
}

export function SlideGraph({ onNavigate, onClose, currentSlideId }: SlideGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const animRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const alphaRef = useRef(1.0);
  const [loaded, setLoaded] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);

  // Fetch graph data
  useEffect(() => {
    fetch("/api/slides/graph")
      .then((r) => r.json())
      .then((data: { nodes: NodeData[]; links: LinkData[] }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;

        const nodes: SimNode[] = data.nodes.map((n) => ({
          ...n,
          x: cx + (Math.random() - 0.5) * Math.min(rect.width * 0.5, 500),
          y: cy + (Math.random() - 0.5) * Math.min(rect.height * 0.5, 350),
          vx: 0,
          vy: 0,
        }));

        const edges: SimEdge[] = [];
        for (const n of data.nodes) {
          if (n.parentId) edges.push({ from: n.parentId, to: n.id, type: "child" });
        }
        for (const l of data.links) {
          edges.push({ from: l.from, to: l.to, type: "link" });
        }

        nodesRef.current = nodes;
        edgesRef.current = edges;
        alphaRef.current = 1.0;
        setNodeCount(nodes.length);
        setLoaded(true);
      });
  }, []);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let running = true;

    function tick() {
      if (!running) return;
      const ns = nodesRef.current;
      const es = edgesRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;

      if (ns.length > 0) {
        const alpha = alphaRef.current;

        if (alpha > 0.001) {
          const nodeMap = new Map(ns.map((n) => [n.id, n]));

          // Repulsion between all nodes
          for (let i = 0; i < ns.length; i++) {
            for (let j = i + 1; j < ns.length; j++) {
              const dx = (ns[j].x - ns[i].x) || 0.1;
              const dy = (ns[j].y - ns[i].y) || 0.1;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = Math.min(3000 / (dist * dist), 8) * alpha;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              ns[i].vx -= fx;
              ns[i].vy -= fy;
              ns[j].vx += fx;
              ns[j].vy += fy;
            }
          }

          // Edge attraction
          for (const e of es) {
            const a = nodeMap.get(e.from);
            const b = nodeMap.get(e.to);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const target = e.type === "child" ? 120 : 180;
            const force = (dist - target) * 0.02 * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }

          // Center gravity
          for (const n of ns) {
            n.vx += (w / 2 - n.x) * 0.0008 * alpha;
            n.vy += (h / 2 - n.y) * 0.0008 * alpha;
          }

          // Apply velocity
          for (const n of ns) {
            if (dragRef.current?.nodeId === n.id) continue;
            n.vx *= 0.85;
            n.vy *= 0.85;
            n.x += n.vx;
            n.y += n.vy;
          }

          alphaRef.current *= 0.997;
        }
      }

      // ── Render ──
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);

      // Grid dots
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      const gridSize = 40 * scaleRef.current;
      const ox = ((panRef.current.x % gridSize) + gridSize) % gridSize;
      const oy = ((panRef.current.y % gridSize) + gridSize) % gridSize;
      for (let gx = ox; gx < w; gx += gridSize) {
        for (let gy = oy; gy < h; gy += gridSize) {
          ctx.fillRect(gx, gy, 1, 1);
        }
      }

      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(scaleRef.current, scaleRef.current);

      const nodeMap = new Map(ns.map((n) => [n.id, n]));
      const hovered = hoveredRef.current;

      // Edges
      for (const e of edgesRef.current) {
        const a = nodeMap.get(e.from);
        const b = nodeMap.get(e.to);
        if (!a || !b) continue;

        const isHighlighted = hovered != null && (e.from === hovered || e.to === hovered);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        if (e.type === "link") {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = isHighlighted ? "rgba(99,102,241,0.6)" : "rgba(99,102,241,0.15)";
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = isHighlighted ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)";
        }
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const r = 18;
        const ax = b.x - Math.cos(angle) * r;
        const ay = b.y - Math.sin(angle) * r;
        const arrowSize = 5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - arrowSize * Math.cos(angle - Math.PI / 6), ay - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ax - arrowSize * Math.cos(angle + Math.PI / 6), ay - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle =
          e.type === "link"
            ? isHighlighted ? "rgba(99,102,241,0.6)" : "rgba(99,102,241,0.15)"
            : isHighlighted ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)";
        ctx.fill();
      }

      // Nodes
      for (const n of ns) {
        const isHovered = n.id === hovered;
        const isCurrent = n.id === currentSlideId;
        const isRoot = !n.parentId;
        const radius = isHovered ? 22 : 18;

        // Glow for current node
        if (isCurrent) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 10, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(n.x, n.y, radius, n.x, n.y, radius + 10);
          grad.addColorStop(0, "rgba(99,102,241,0.25)");
          grad.addColorStop(1, "rgba(99,102,241,0)");
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? "#6366f1" : isRoot ? "#374151" : isHovered ? "#4b5563" : "#1f2937";
        ctx.fill();
        ctx.strokeStyle = isCurrent ? "#818cf8" : isHovered ? "#6b7280" : "rgba(255,255,255,0.06)";
        ctx.lineWidth = isCurrent || isHovered ? 2 : 1;
        ctx.stroke();

        // Label
        const label = n.title
          ? n.title.length > 22 ? n.title.slice(0, 20) + "\u2026" : n.title
          : "Untitled";
        ctx.fillStyle = isHovered || isCurrent ? "#ffffff" : "rgba(255,255,255,0.45)";
        ctx.font = `${isHovered ? 11 : 10}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, n.x, n.y + radius + 6);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    }

    tick();
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [loaded, currentSlideId]);

  // ── Mouse helpers ──

  const screenToWorld = useCallback((sx: number, sy: number) => ({
    x: (sx - panRef.current.x) / scaleRef.current,
    y: (sy - panRef.current.y) / scaleRef.current,
  }), []);

  const findNode = useCallback((sx: number, sy: number): SimNode | null => {
    const { x, y } = screenToWorld(sx, sy);
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy < 24 * 24) return n;
    }
    return null;
  }, [screenToWorld]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      const { x: wx, y: wy } = screenToWorld(x, y);
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) {
        node.x = wx - dragRef.current.offsetX;
        node.y = wy - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    } else if (isPanningRef.current) {
      panRef.current.x += x - lastMouseRef.current.x;
      panRef.current.y += y - lastMouseRef.current.y;
    } else {
      const node = findNode(x, y);
      hoveredRef.current = node?.id ?? null;
      canvasRef.current!.style.cursor = node ? "pointer" : "grab";
    }

    lastMouseRef.current = { x, y };
  }, [findNode, screenToWorld]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastMouseRef.current = { x, y };
    dragStartRef.current = { x, y };

    const node = findNode(x, y);
    if (node) {
      const { x: wx, y: wy } = screenToWorld(x, y);
      dragRef.current = { nodeId: node.id, offsetX: wx - node.x, offsetY: wy - node.y };
    } else {
      isPanningRef.current = true;
    }
    canvasRef.current!.style.cursor = "grabbing";
  }, [findNode, screenToWorld]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragStartRef.current.x;
    const dy = y - dragStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dragRef.current && dist < 5) {
      onNavigate(dragRef.current.nodeId);
      onClose();
    }

    dragRef.current = null;
    isPanningRef.current = false;
    const node = findNode(x, y);
    canvasRef.current!.style.cursor = node ? "pointer" : "grab";
  }, [findNode, onNavigate, onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(0.15, Math.min(4, scaleRef.current * factor));

    panRef.current.x = x - (x - panRef.current.x) * (newScale / scaleRef.current);
    panRef.current.y = y - (y - panRef.current.y) * (newScale / scaleRef.current);
    scaleRef.current = newScale;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0a0a0f" }}
    >
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onMouseLeave={() => {
            hoveredRef.current = null;
            dragRef.current = null;
            isPanningRef.current = false;
          }}
          className="absolute inset-0"
          style={{ cursor: "grab" }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all cursor-pointer"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="absolute top-4 left-4 text-white/60 text-sm font-medium pointer-events-none">
          Slide Map
          <span className="text-white/30 ml-2">{nodeCount} slides</span>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs text-white/40 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-px bg-white/30" />
            <span>Parent-Child</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-px border-t border-dashed border-indigo-400/50" />
            <span>Link</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Current</span>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          <button
            onClick={() => { scaleRef.current = Math.min(4, scaleRef.current * 1.3); }}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white text-sm transition-all cursor-pointer"
          >
            +
          </button>
          <button
            onClick={() => { scaleRef.current = Math.max(0.15, scaleRef.current / 1.3); }}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white text-sm transition-all cursor-pointer"
          >
            -
          </button>
          <button
            onClick={() => { scaleRef.current = 1; panRef.current = { x: 0, y: 0 }; }}
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white text-xs transition-all cursor-pointer"
            title="Reset view"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        {/* Empty state */}
        {loaded && nodeCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm pointer-events-none">
            No slides yet. Create your first slide to see the map.
          </div>
        )}
      </div>
    </motion.div>
  );
}
