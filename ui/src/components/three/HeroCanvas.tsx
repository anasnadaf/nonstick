import { useEffect, useRef, useState } from "react";

import LatticeStill from "./LatticeStill";
import type { LatticeHandle } from "./inkLattice";
import { cn } from "@/lib/utils";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function readColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    ink: s.getPropertyValue("--ink").trim() || "#14110e",
    copper: s.getPropertyValue("--copper").trim() || "#9a5b3c",
  };
}

export interface HeroCanvasProps {
  /** Scales node counts. 1 = hero, ~0.35 = ambient. */
  density?: number;
  /** Global alpha multiplier. */
  opacity?: number;
  /** Follow the pointer with a slight parallax. */
  interactive?: boolean;
  className?: string;
}

/**
 * Mounts the three.js lattice, or the SVG plate when WebGL is unavailable.
 *
 * three is reached through a dynamic import so it lands in its own chunk and
 * never loads on the workspace routes. The RAF loop is suspended whenever the
 * canvas scrolls out of view or the tab is hidden.
 */
export default function HeroCanvas({
  density = 1,
  opacity = 1,
  interactive = false,
  className,
}: HeroCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<LatticeHandle | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!supportsWebGL()) {
      setFallback(true);
      return;
    }

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 768px)");
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("./inkLattice")
      .then(({ createLattice }) => {
        if (cancelled || !canvasRef.current) return;

        const { ink, copper } = readColors();
        const handle = createLattice(canvasRef.current, {
          inkColor: ink,
          copperColor: copper,
          // Phones get a lighter plate rather than no plate at all.
          density: density * (narrow.matches ? 0.55 : 1),
          opacity,
          interactive: interactive && !narrow.matches && !motion.matches,
          still: motion.matches,
        });
        handleRef.current = handle;
        handle.start();

        // Suspend when scrolled away or backgrounded — a hero that keeps
        // burning frames behind three screens of content is just a battery bug.
        const visible = { inView: true, tabActive: !document.hidden };
        const sync = () => {
          if (visible.inView && visible.tabActive) handle.start();
          else handle.stop();
        };

        const io = new IntersectionObserver(
          ([entry]) => {
            visible.inView = entry.isIntersecting;
            sync();
          },
          { threshold: 0 },
        );
        io.observe(canvasRef.current);

        const onVisibility = () => {
          visible.tabActive = !document.hidden;
          sync();
        };
        document.addEventListener("visibilitychange", onVisibility);

        // Follow theme flips without rebuilding the scene.
        const themeObserver = new MutationObserver(() => {
          const next = readColors();
          handle.setColors(next.ink, next.copper);
        });
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });

        cleanup = () => {
          io.disconnect();
          themeObserver.disconnect();
          document.removeEventListener("visibilitychange", onVisibility);
        };
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      cleanup?.();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [density, opacity, interactive]);

  if (fallback) {
    return <LatticeStill className={className} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full", className)}
      aria-hidden="true"
    />
  );
}
