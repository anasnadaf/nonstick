import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/markdown";
import type { Citation } from "@/types";

/** Renders assistant markdown with [n] markers turned into clickable chips.
 * The markdown is rendered as one document so chips stay inline in their
 * paragraph; clicks are handled by delegation on the container.
 *
 * The chip is an HTML string, so `.cite-chip` has to be a real CSS class
 * (see index.css) rather than utilities Tailwind would need to discover
 * inside a template literal. */
export default function CitedText({
  text,
  citations,
  onCite,
  className,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
  className?: string;
}) {
  const byRef = useMemo(
    () => new Map(citations.map((c) => [c.ref, c])),
    [citations],
  );

  const html = useMemo(
    () =>
      renderMarkdown(text, (rendered) =>
        rendered.replace(/\[(\d+)\]/g, (match, ref: string) => {
          const cite = byRef.get(Number(ref));
          if (!cite) return match;
          const label = (cite.filename ?? cite.url ?? "").replace(/"/g, "&quot;");
          return `<button class="cite-chip" data-ref="${ref}" title="${label}">${ref}</button>`;
        }),
      ),
    [text, byRef],
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".cite-chip");
    if (!chip) return;
    const cite = byRef.get(Number(chip.dataset.ref));
    if (cite) onCite(cite);
  };

  return (
    <div
      className={cn(
        "prose prose-editorial max-w-none text-[15px] leading-[1.7]",
        className,
      )}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
