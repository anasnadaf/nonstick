import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

/** Render markdown to sanitized HTML. `transform` runs on the raw HTML before
 * sanitizing, so callers can inject their own markup (e.g. citation chips). */
export function renderMarkdown(
  text: string,
  transform?: (html: string) => string,
): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(transform ? transform(html) : html);
}
