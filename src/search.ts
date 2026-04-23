import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { walkMarkdown, type Root } from "./server.ts";

export type ContentHit = {
  root: string;
  path: string;
  line: number;
  snippet: string;
  matchStart: number;
  matchEnd: number;
};

const MAX_HITS = 80;
const MAX_PER_FILE = 3;
const SNIPPET_WINDOW = 80;

function newlineCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => "\n".repeat(newlineCount(m)))
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => "\n".repeat(newlineCount(m)))
    .replace(/<!--[\s\S]*?-->/g, (m) => "\n".repeat(newlineCount(m)))
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractSearchable(text: string, rel: string): string {
  if (/\.html?$/i.test(rel)) return htmlToText(text);
  return text;
}

export async function searchContent(
  roots: Root[],
  query: string,
): Promise<ContentHit[]> {
  const needle = query.toLowerCase();
  if (needle.length < 2) return [];

  const hits: ContentHit[] = [];

  for (const root of roots) {
    if (hits.length >= MAX_HITS) break;
    const files = await walkMarkdown(root.path);
    for (const rel of files) {
      if (hits.length >= MAX_HITS) break;
      let raw: string;
      try {
        raw = await readFile(join(root.path, rel), "utf8");
      } catch {
        continue;
      }
      const text = extractSearchable(raw, rel);
      if (text.toLowerCase().indexOf(needle) === -1) continue;

      const lines = text.split("\n");
      let fileHits = 0;
      for (let i = 0; i < lines.length && fileHits < MAX_PER_FILE; i++) {
        const raw = lines[i]!;
        const line = raw.replace(/\s+/g, " ").trim();
        if (!line) continue;
        const idx = line.toLowerCase().indexOf(needle);
        if (idx === -1) continue;

        const windowStart = Math.max(0, idx - Math.floor(SNIPPET_WINDOW / 2));
        const windowEnd = Math.min(line.length, windowStart + SNIPPET_WINDOW);
        let snippet = line.slice(windowStart, windowEnd);
        let matchStart = idx - windowStart;

        if (windowStart > 0) {
          snippet = "…" + snippet;
          matchStart += 1;
        }
        if (windowEnd < line.length) snippet += "…";

        hits.push({
          root: root.name,
          path: rel,
          line: i + 1,
          snippet,
          matchStart,
          matchEnd: matchStart + query.length,
        });
        fileHits += 1;
        if (hits.length >= MAX_HITS) break;
      }
    }
  }

  return hits;
}
