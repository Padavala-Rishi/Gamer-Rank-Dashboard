import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/** Safe markdown with [[Wiki links]] turned into links to notes. */
export function Markdown({ text, onWikiLink }: { text: string | null | undefined; onWikiLink?: (title: string) => string | null }) {
  const html = useMemo(() => {
    const src = (text ?? "").replace(/\[\[([^\]\n]{1,200})\]\]/g, (_m, t: string) => {
      const href = onWikiLink?.(t.trim());
      return href ? `<a class="wikilink" href="${href}">${t}</a>` : `<span class="wikilink" title="No note with this title yet">${t}</span>`;
    });
    const raw = marked.parse(src, { async: false, breaks: true, gfm: true }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [text, onWikiLink]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
