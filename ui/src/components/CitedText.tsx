import { useMemo } from "react";
import { renderMarkdown } from "../markdown";
import type { Citation } from "../types";

/** Renders assistant markdown with [n] markers turned into clickable chips.
 * The markdown is rendered as one document so chips stay inline in their
 * paragraph; clicks are handled by delegation on the container. */
export default function CitedText({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
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
      className="md"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
