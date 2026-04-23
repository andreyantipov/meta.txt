import { Marked, type Tokens } from "marked";

export type Heading = { depth: number; text: string; id: string };

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "heading";
}

export function makeSlugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n - 1}`;
  };
}

function stripInlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export function parseMarkdown(raw: string): {
  html: string;
  headings: Heading[];
} {
  const next = makeSlugger();
  const headings: Heading[] = [];

  const m = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading(this: { parser: { parseInline: (tokens: Tokens.Heading["tokens"]) => string } }, token: Tokens.Heading) {
        const inline = this.parser.parseInline(token.tokens);
        const id = next(token.text);
        headings.push({ depth: token.depth, text: stripInlineMd(token.text), id });
        return `<h${token.depth} id="${id}">${inline}</h${token.depth}>\n`;
      },
    },
  });

  const html = m.parse(raw) as string;
  return { html, headings };
}

export function extractHtmlHeadings(raw: string): Heading[] {
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const next = makeSlugger();
    const out: Heading[] = [];
    doc
      .querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")
      .forEach((el) => {
        const depth = Number(el.tagName.slice(1));
        const text = (el.textContent ?? "").trim();
        if (!text) return;
        const id = el.id || next(text);
        out.push({ depth, text, id });
      });
    return out;
  } catch {
    return [];
  }
}

export function injectHeadingIds(container: HTMLElement): Heading[] {
  const next = makeSlugger();
  const headings: Heading[] = [];
  const els = container.querySelectorAll<HTMLHeadingElement>(
    "h1,h2,h3,h4,h5,h6",
  );
  els.forEach((el) => {
    const depth = Number(el.tagName.slice(1));
    const text = (el.textContent ?? "").trim();
    if (!text) return;
    const id = el.id || next(text);
    el.id = id;
    headings.push({ depth, text, id });
  });
  return headings;
}
