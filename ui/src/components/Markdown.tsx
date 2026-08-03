import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/markdown";

export default function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className={cn("prose prose-editorial max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
