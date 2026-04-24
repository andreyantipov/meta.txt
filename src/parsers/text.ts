import type { Document, Parser, Source } from "./types.ts";

export class TextParser implements Parser {
  kind = "text" as const;

  canParse(path: string): boolean {
    return /\.txt$/i.test(path);
  }

  parse(text: string, source: Source): Document {
    return { source, frontmatter: {}, body: text, links: [], headings: [] };
  }
}
