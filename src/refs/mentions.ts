import type { Document } from "../parsers/types.ts";

export type MentionHit = {
  token: string;
  line: number;
  context: string;
};

// File-like tokens in plain text: scheduler.md, docs/foo.mdx, notes/x.txt, file.html.
// We require a known doc extension so we don't over-match arbitrary dotted words.
const MENTION_RE = /(?<![a-zA-Z0-9_/.\-])([\w.\-]+(?:\/[\w.\-]+)*\.(?:md|mdx|markdown|txt|html?))\b/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const MD_LINK_RE = /\[[^\]]*\]\([^)]*\)/g;
const HTML_ATTR_RE = /<[^>]+>/g;

export function findMentions(doc: Document): MentionHit[] {
  const hits: MentionHit[] = [];
  const { body, links } = doc;
  const taken = new Set<string>();
  for (const l of links) taken.add(l.href);

  const lines = body.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const sanitized = raw
      .replace(INLINE_CODE_RE, (s) => " ".repeat(s.length))
      .replace(MD_LINK_RE, (s) => " ".repeat(s.length))
      .replace(HTML_ATTR_RE, (s) => " ".repeat(s.length));

    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(sanitized)) !== null) {
      const token = m[1]!;
      if (taken.has(token)) continue;
      hits.push({ token, line: i + 1, context: raw.trim().slice(0, 200) });
    }
  }
  return hits;
}
