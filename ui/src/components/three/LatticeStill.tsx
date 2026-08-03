import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * Static SVG rendition of the ink lattice, for browsers without WebGL.
 *
 * Deliberately not a raster poster: it stays crisp at any size, costs a few
 * hundred bytes, themes itself from CSS variables, and — critically — pulls in
 * no three.js, which is the entire point of having a fallback.
 */

const VIEW = 900;
const DOCS = 7;
const CHUNKS = 14;
const CITATIONS = 26;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Projected {
  x: number;
  y: number;
  r: number;
  fade: number;
}

function build() {
  const rand = mulberry32(0x5e1f);
  const rx = 0.32;
  const ry = 0.6;

  const project = (
    px: number,
    py: number,
    pz: number,
    radius: number,
  ): Projected => {
    // Y then X rotation, matching the WebGL group's resting pose.
    const x1 = px * Math.cos(ry) + pz * Math.sin(ry);
    const z1 = -px * Math.sin(ry) + pz * Math.cos(ry);
    const y2 = py * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = py * Math.sin(rx) + z1 * Math.cos(rx);

    const dist = 7.1;
    const scale = 620 / (dist - z2);
    return {
      x: VIEW / 2 + x1 * scale,
      y: VIEW / 2 - y2 * scale,
      r: (radius * scale) / 210,
      fade: Math.max(0, Math.min(1, 1 - (dist - z2 - 3.4) / 8.1)),
    };
  };

  const hubs: Projected[] = [];
  const nodes: Projected[] = [];
  const structural: [Projected, Projected][] = [];
  const chunksByDoc: Projected[][] = [];

  for (let i = 0; i < DOCS; i++) {
    const y = 1 - (i / (DOCS - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * 2.399963229728653;
    const hx = Math.cos(theta) * r * 2.05;
    const hy = y * 2.05;
    const hz = Math.sin(theta) * r * 2.05;
    const hub = project(hx, hy, hz, 2.9);
    hubs.push(hub);

    const owned: Projected[] = [];
    for (let c = 0; c < CHUNKS; c++) {
      let dx = rand() - 0.5;
      let dy = rand() - 0.5;
      let dz = rand() - 0.5;
      const len = Math.hypot(dx, dy, dz) || 1;
      const spread = 0.35 + rand() * 0.95;
      dx = (dx / len) * spread;
      dy = (dy / len) * spread;
      dz = (dz / len) * spread;
      const jitter = 1 + (rand() - 0.5) * 0.12;
      const node = project(
        (hx + dx) * jitter,
        (hy + dy) * jitter,
        (hz + dz) * jitter,
        0.85 + rand() * 0.7,
      );
      nodes.push(node);
      owned.push(node);
      structural.push([hub, node]);
    }
    chunksByDoc.push(owned);
  }

  const citations: [Projected, Projected][] = [];
  for (let i = 0; i < CITATIONS; i++) {
    const a = Math.floor(rand() * DOCS);
    let b = Math.floor(rand() * DOCS);
    if (b === a) b = (b + 1) % DOCS;
    citations.push([
      chunksByDoc[a][Math.floor(rand() * CHUNKS)],
      chunksByDoc[b][Math.floor(rand() * CHUNKS)],
    ]);
  }

  return { hubs, nodes, structural, citations };
}

export default function LatticeStill({ className }: { className?: string }) {
  const { hubs, nodes, structural, citations } = useMemo(build, []);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={cn("h-full w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="var(--ink)" strokeWidth="0.6">
        {structural.map(([a, b], i) => (
          <line
            key={`s${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            opacity={0.16 * b.fade}
          />
        ))}
      </g>
      <g stroke="var(--copper)" strokeWidth="0.9">
        {citations.map(([a, b], i) => (
          <line
            key={`c${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            opacity={0.5 * ((a.fade + b.fade) / 2)}
          />
        ))}
      </g>
      <g fill="var(--ink)">
        {nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} opacity={0.8 * n.fade} />
        ))}
        {hubs.map((h, i) => (
          <circle key={`h${i}`} cx={h.x} cy={h.y} r={h.r} opacity={0.9 * h.fade} />
        ))}
      </g>
    </svg>
  );
}
