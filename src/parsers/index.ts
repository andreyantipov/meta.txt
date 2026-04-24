import type { DocKind, Parser } from "./types.ts";
import { MarkdownParser } from "./markdown.ts";
import { HtmlParser } from "./html.ts";
import { TextParser } from "./text.ts";

const PARSERS: Parser[] = [new MarkdownParser(), new HtmlParser(), new TextParser()];

export function getParserFor(path: string): Parser | null {
  for (const p of PARSERS) if (p.canParse(path)) return p;
  return null;
}

export function kindOf(path: string): DocKind | null {
  const p = getParserFor(path);
  return p ? p.kind : null;
}

export type { Document, Parser, RawLink, Source, DocKind } from "./types.ts";
export { slugify } from "./markdown.ts";
