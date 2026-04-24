export type DocKind = "md" | "html" | "text";

export type RawLink = {
  href: string;
  anchor?: string;
  line: number;
  context: string;
  kind: "link" | "ref";
};

export type Source = {
  root: string;
  path: string;
  kind: DocKind;
};

export type Document = {
  source: Source;
  frontmatter: Record<string, unknown>;
  body: string;
  links: RawLink[];
  headings: string[];
};

export interface Parser {
  kind: DocKind;
  canParse(path: string): boolean;
  parse(text: string, source: Source): Document;
}
