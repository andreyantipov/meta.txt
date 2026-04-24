import { parse as parseHtml } from "node-html-parser";
import type { Document, Parser, RawLink, Source } from "./types.ts";
import { slugify } from "./markdown.ts";

function splitHrefAnchor(href: string): { href: string; anchor?: string } {
  const hash = href.indexOf("#");
  if (hash === -1) return { href };
  return { href: href.slice(0, hash), anchor: href.slice(hash + 1) };
}

function isExternalOrSpecial(href: string): boolean {
  if (!href) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  if (href.startsWith("//")) return true;
  if (href.startsWith("#")) return true;
  return false;
}

export class HtmlParser implements Parser {
  kind = "html" as const;

  canParse(path: string): boolean {
    return /\.html?$/i.test(path);
  }

  parse(text: string, source: Source): Document {
    const links: RawLink[] = [];
    const headings: string[] = [];
    const lineOf = buildLineIndex(text);

    let root;
    try {
      root = parseHtml(text, { lowerCaseTagName: true, comment: false });
    } catch {
      return { source, frontmatter: {}, body: text, links, headings };
    }

    for (const a of root.querySelectorAll("a")) {
      const href = a.getAttribute("href");
      if (!href || isExternalOrSpecial(href)) continue;
      const { href: target, anchor } = splitHrefAnchor(href);
      if (!target) continue;
      const pos = (a as unknown as { range?: [number, number] }).range?.[0] ?? 0;
      const line = lineOf(pos);
      const context = (a.text || "").trim().slice(0, 200) || `<a href="${href}">`;
      links.push({ href: target, anchor, line, context, kind: "link" });
    }

    for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const t = (h.text || "").trim();
      if (t) headings.push(t);
    }
    // Any element can be an anchor target via id=; rustdoc and similar
    // generators put ids on sections, spans, divs — not just headings.
    for (const el of root.querySelectorAll("[id]")) {
      const id = el.getAttribute("id");
      if (id) headings.push(id);
    }

    return { source, frontmatter: {}, body: text, links, headings };
  }
}

function buildLineIndex(text: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export { slugify };
