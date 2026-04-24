export type EdgeKind = "link" | "ref" | "mention";
export type EdgeStatus = "ok" | "broken-target" | "broken-anchor" | "out-of-scope";

export type Edge = {
  from: { root: string; path: string; line?: number };
  to: { root: string; path: string; anchor?: string };
  kind: EdgeKind;
  status: EdgeStatus;
  context?: string;
};
