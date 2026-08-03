import HeroCanvas from "./HeroCanvas";
import { cn } from "@/lib/utils";

/**
 * The hero plate turned right down — a watermark behind login and empty
 * states. Never mounted on a route that is streaming a chat response.
 */
export default function AmbientField({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      <HeroCanvas density={0.35} opacity={0.45} />
    </div>
  );
}
