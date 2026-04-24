import matter from "gray-matter";
import type { Document, Parser, RawLink, Source } from "./types.ts";

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const CODE_FENCE_RE = /^(```|~~~)/;

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function splitHrefAnchor(href: string): { href: string; anchor?: string } {
  const hash = href.indexOf("#");
  if (hash === -1) return { href };
  return { href: href.slice(0, hash), anchor: href.slice(hash + 1) };
}

function isExternalOrSpecial(href: string): boolean {
  if (!href) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true; // http:, mailto:, etc.
  if (href.startsWith("//")) return true;
  if (href.startsWith("#")) return true; // pure anchor
  return false;
}

function refItemToLink(item: unknown): { href: string; anchor?: string } | null {
  if (typeof item !== "string" || !item) return null;
  // strip optional :line suffix — kept parseable for future, ignored in v1
  const cleaned = item.replace(/:\d+$/, "");
  return splitHrefAnchor(cleaned);
}

export class MarkdownParser implements Parser {
  kind = "md" as const;

  canParse(path: string): boolean {
    return /\.(md|mdx|markdown)$/i.test(path);
  }

  parse(text: string, source: Source): Document {
    let frontmatter: Record<string, unknown> = {};
    let body = text;
    try {
      const parsed = matter(text);
      frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
      body = parsed.content ?? text;
    } catch {
      body = text;
    }

    const headings: string[] = [];
    const links: RawLink[] = [];
    const lines = body.split("\n");
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (CODE_FENCE_RE.test(line.trimStart())) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const h = HEADING_RE.exec(line);
      if (h) {
        headings.push(h[2]!.trim());
        continue;
      }

      MD_LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MD_LINK_RE.exec(line)) !== null) {
        const raw = m[2]!;
        if (isExternalOrSpecial(raw)) continue;
        const { href, anchor } = splitHrefAnchor(raw);
        if (!href) continue;
        links.push({
          href,
          anchor,
          line: i + 1,
          context: line.trim().slice(0, 200),
          kind: "link",
        });
      }
    }

    const refs = frontmatter.refs;
    if (Array.isArray(refs)) {
      for (const r of refs) {
        const parsed = refItemToLink(r);
        if (!parsed || isExternalOrSpecial(parsed.href)) continue;
        links.push({
          href: parsed.href,
          anchor: parsed.anchor,
          line: 1,
          context: `frontmatter refs: ${r}`,
          kind: "ref",
        });
      }
    }

    return { source, frontmatter, body, links, headings };
  }
}
