import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { ASSETS } from "./assets.ts";

const IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

export type ServerOptions = {
  root: string;
  port: number;
  host?: string;
};

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (IGNORED.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && /\.(md|mdx|markdown)$/i.test(entry.name)) {
        out.push(relative(root, full).split(sep).join("/"));
      }
    }
  }
  await walk(root);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !rel.startsWith("..") && !resolve(rel).startsWith("..");
}

export function startServer(opts: ServerOptions) {
  const root = resolve(opts.root);

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host ?? "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      const asset = ASSETS[path];
      if (asset) {
        return new Response(asset.body, {
          headers: { "content-type": asset.type },
        });
      }

      if (path === "/api/docs") {
        const files = await walkMarkdown(root);
        return Response.json({ root, files });
      }

      if (path === "/api/doc") {
        const rel = url.searchParams.get("path");
        if (!rel) return new Response("Missing path", { status: 400 });
        const target = resolve(root, rel);
        if (!isInside(root, target)) {
          return new Response("Forbidden", { status: 403 });
        }
        try {
          const s = await stat(target);
          if (!s.isFile()) return new Response("Not a file", { status: 400 });
          const content = await readFile(target, "utf8");
          return new Response(content, {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });

  return server;
}
