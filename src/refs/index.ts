import { readFile, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { getParserFor, slugify, type DocKind } from "../parsers/index.ts";
import type { Document } from "../parsers/types.ts";
import { findMentions } from "./mentions.ts";
import type { Edge, EdgeStatus } from "./types.ts";

type Root = { name: string; path: string };

function docKey(root: string, path: string): string {
  return `${root} ${path}`;
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(" ");
  return [key.slice(0, i), key.slice(i + 1)];
}

function resolveRelPath(sourcePath: string, href: string): string {
  if (href.startsWith("/")) return href.replace(/^\/+/, "");
  const baseDir = posix.dirname(sourcePath);
  const joined = posix.normalize(posix.join(baseDir, href));
  return joined.replace(/^\.\/+/, "");
}

function isSafeRelPath(p: string): boolean {
  return !p.startsWith("../") && p !== "..";
}

function normalizeAnchor(a: string | undefined): string | undefined {
  return a?.toLowerCase();
}

function resolveMentionTarget(
  token: string,
  sourcePath: string,
  files: Set<string>,
): string | null {
  const rel = resolveRelPath(sourcePath, token);
  if (files.has(rel)) return rel;
  if (files.has(token)) return token;
  const base = token.includes("/") ? token.slice(token.lastIndexOf("/") + 1) : token;
  const matches: string[] = [];
  for (const f of files) {
    const fb = f.slice(f.lastIndexOf("/") + 1);
    if (fb === base) matches.push(f);
  }
  return matches.length === 1 ? matches[0]! : null;
}

const SCAN_CONCURRENCY = 32;

export class OnDemandRefs {
  private roots = new Map<string, Root>();
  private filesByRoot = new Map<string, Set<string>>();
  private headings = new Map<string, Set<string>>();
  private backrefsCache = new Map<string, Edge[]>();

  setRoots(roots: Root[]): void {
    this.roots.clear();
    for (const r of roots) this.roots.set(r.name, r);
  }

  setFiles(rootName: string, files: string[]): void {
    this.filesByRoot.set(rootName, new Set(files));
  }

  noteFileChange(rootName: string, path: string, exists: boolean): void {
    const set = this.filesByRoot.get(rootName) ?? new Set<string>();
    if (exists) set.add(path);
    else set.delete(path);
    this.filesByRoot.set(rootName, set);

    this.headings.delete(docKey(rootName, path));
    // A single file change can invalidate backrefs for any number of targets
    // (the changed file may have added/removed links). Cheapest: drop all.
    this.backrefsCache.clear();
  }

  async getRefs(rootName: string, path: string): Promise<Edge[]> {
    const doc = await this.parseFile(rootName, path);
    if (!doc) return [];
    return this.resolveOutgoing(rootName, path, doc);
  }

  async getBackrefs(rootName: string, path: string): Promise<Edge[]> {
    const key = docKey(rootName, path);
    const cached = this.backrefsCache.get(key);
    if (cached) return cached;
    const result = await this.scanCorpusForTarget(rootName, path);
    this.backrefsCache.set(key, result);
    return result;
  }

  private async parseFile(rootName: string, path: string): Promise<Document | null> {
    const r = this.roots.get(rootName);
    if (!r) return null;
    const parser = getParserFor(path);
    if (!parser) return null;
    try {
      const text = await readFile(resolve(r.path, path), "utf8");
      return parser.parse(text, { root: rootName, path, kind: parser.kind as DocKind });
    } catch {
      return null;
    }
  }

  private async getHeadings(rootName: string, path: string): Promise<Set<string>> {
    const key = docKey(rootName, path);
    const cached = this.headings.get(key);
    if (cached) return cached;
    const doc = await this.parseFile(rootName, path);
    const set = new Set<string>();
    if (doc) {
      for (const h of doc.headings) {
        const s = slugify(h);
        if (s) set.add(s);
      }
    }
    this.headings.set(key, set);
    return set;
  }

  private async resolveOutgoing(
    rootName: string,
    sourcePath: string,
    doc: Document,
  ): Promise<Edge[]> {
    const r = this.roots.get(rootName);
    const files = this.filesByRoot.get(rootName) ?? new Set<string>();
    const edges: Edge[] = [];

    for (const link of doc.links) {
      const targetPath = resolveRelPath(sourcePath, link.href);
      const inScope = isSafeRelPath(targetPath) && files.has(targetPath);
      let status: EdgeStatus = "ok";
      if (!inScope) {
        // File isn't indexed (wrong extension, or doesn't exist). Distinguish:
        // existing-on-disk → out-of-scope (not a real breakage), else broken.
        status = "broken-target";
        if (r && isSafeRelPath(targetPath)) {
          try {
            const s = await stat(resolve(r.path, targetPath));
            if (s.isFile() || s.isDirectory()) status = "out-of-scope";
          } catch {}
        }
      } else if (link.anchor) {
        const anchors = await this.getHeadings(rootName, targetPath);
        if (!anchors.has(slugify(link.anchor))) status = "broken-anchor";
      }
      edges.push({
        from: { root: rootName, path: sourcePath, line: link.line },
        to: {
          root: rootName,
          path: targetPath,
          anchor: normalizeAnchor(link.anchor),
        },
        kind: link.kind,
        status,
        context: link.context,
      });
    }

    const taken = new Set(edges.map((e) => e.to.path));
    for (const hit of findMentions(doc)) {
      const resolved = resolveMentionTarget(hit.token, sourcePath, files);
      if (!resolved || taken.has(resolved)) continue;
      taken.add(resolved);
      edges.push({
        from: { root: rootName, path: sourcePath, line: hit.line },
        to: { root: rootName, path: resolved },
        kind: "mention",
        status: "ok",
        context: hit.context,
      });
    }
    return edges;
  }

  private async scanCorpusForTarget(
    rootName: string,
    targetPath: string,
  ): Promise<Edge[]> {
    const r = this.roots.get(rootName);
    if (!r) return [];
    const files = this.filesByRoot.get(rootName);
    if (!files) return [];

    const basename = targetPath.slice(targetPath.lastIndexOf("/") + 1);
    if (!basename) return [];

    const candidates = [...files].filter((p) => p !== targetPath);
    const hits: Array<{ path: string; text: string }> = [];
    let idx = 0;

    const worker = async () => {
      while (true) {
        const i = idx++;
        if (i >= candidates.length) return;
        const p = candidates[i]!;
        try {
          const text = await readFile(resolve(r.path, p), "utf8");
          // Substring pre-filter: the target basename must appear somewhere in
          // the raw text to be a candidate. Cuts parse count from thousands to
          // dozens on large corpora; false positives get filtered by proper
          // resolution during parse.
          if (text.includes(basename)) hits.push({ path: p, text });
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));

    const edges: Edge[] = [];
    const r2 = this.roots.get(rootName);
    const targetExists = files.has(targetPath);
    let targetOutOfScope = false;
    if (!targetExists && r2 && isSafeRelPath(targetPath)) {
      try {
        const s = await stat(resolve(r2.path, targetPath));
        targetOutOfScope = s.isFile() || s.isDirectory();
      } catch {}
    }
    for (const { path, text } of hits) {
      const parser = getParserFor(path);
      if (!parser) continue;
      const doc = parser.parse(text, {
        root: rootName,
        path,
        kind: parser.kind as DocKind,
      });

      const taken = new Set<string>();
      for (const link of doc.links) {
        const resolved = resolveRelPath(path, link.href);
        if (resolved !== targetPath) continue;
        taken.add(resolved);
        let status: EdgeStatus = "ok";
        if (!targetExists) {
          status = targetOutOfScope ? "out-of-scope" : "broken-target";
        } else if (link.anchor) {
          const anchors = await this.getHeadings(rootName, targetPath);
          if (!anchors.has(slugify(link.anchor))) status = "broken-anchor";
        }
        edges.push({
          from: { root: rootName, path, line: link.line },
          to: {
            root: rootName,
            path: targetPath,
            anchor: normalizeAnchor(link.anchor),
          },
          kind: link.kind,
          status,
          context: link.context,
        });
      }

      for (const hit of findMentions(doc)) {
        const resolved = resolveMentionTarget(hit.token, path, files);
        if (resolved !== targetPath || taken.has(resolved)) continue;
        edges.push({
          from: { root: rootName, path, line: hit.line },
          to: { root: rootName, path: targetPath },
          kind: "mention",
          status: "ok",
          context: hit.context,
        });
      }
    }
    return edges;
  }
}

// Kept for compatibility with the old name used in server.ts.
export { OnDemandRefs as RefIndex };

// Silence unused imports when tree-shaken.
void splitKey;
