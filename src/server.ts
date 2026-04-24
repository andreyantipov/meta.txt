import { readdir, readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import pkg from "../package.json" with { type: "json" };
import CHANGELOG from "../CHANGELOG.md" with { type: "text" };
import { ASSETS } from "./assets.ts";
import { ACPAgent, type ChatEvent } from "./acp.ts";

export const VERSION: string = (pkg as { version: string }).version;
import {
  loadHistory,
  saveHistory,
  type ChatHistory,
  type ChatMessage,
} from "./chat-history.ts";
import { searchContent } from "./search.ts";
import { RefIndex } from "./refs/index.ts";

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

export type Root = { name: string; path: string };

export type ServerOptions = {
  roots: string[];
  port: number;
  host?: string;
};

function makeRoots(paths: string[]): Root[] {
  const resolved = paths.map((p) => resolve(p));
  const unique = [...new Set(resolved)];
  const used = new Set<string>();
  const roots: Root[] = [];
  for (const path of unique) {
    const base = basename(path) || path;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    roots.push({ name, path });
  }
  return roots;
}

export async function walkMarkdown(
  root: string,
  onFile?: (rel: string, count: number) => void,
): Promise<string[]> {
  const out: string[] = [];
  let count = 0;
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
      } else if (
        entry.isFile() &&
        /\.(md|mdx|markdown|txt|html?)$/i.test(entry.name)
      ) {
        const rel = relative(root, full).split(sep).join("/");
        out.push(rel);
        count++;
        onFile?.(rel, count);
      }
    }
  }
  await walk(root);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function readGitInfo(rootPath: string): Promise<
  | { ok: false }
  | { ok: true; branch: string | null; sha: string | null; dirty?: boolean }
> {
  // Walk up from rootPath looking for a `.git` directory or file.
  let dir = rootPath;
  let gitDir: string | null = null;
  for (let i = 0; i < 30; i++) {
    const candidate = join(dir, ".git");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) {
        gitDir = candidate;
        break;
      }
      if (s.isFile()) {
        // worktree/submodule: .git is a file pointing at the real gitdir
        const txt = await readFile(candidate, "utf8");
        const m = txt.match(/^gitdir:\s*(.+)$/m);
        if (m) {
          const target = m[1]!.trim();
          gitDir = target.startsWith("/") ? target : resolve(dir, target);
          break;
        }
      }
    } catch {}
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  if (!gitDir) return { ok: false };

  try {
    const head = (await readFile(join(gitDir, "HEAD"), "utf8")).trim();
    const refMatch = head.match(/^ref:\s*(.+)$/);
    if (refMatch) {
      const refPath = refMatch[1]!.trim();
      const branch = refPath.replace(/^refs\/heads\//, "");
      let sha: string | null = null;
      try {
        sha = (await readFile(join(gitDir, refPath), "utf8")).trim();
      } catch {
        // packed-refs fallback
        try {
          const packed = await readFile(join(gitDir, "packed-refs"), "utf8");
          const line = packed
            .split("\n")
            .find((l) => l.endsWith(` ${refPath}`));
          if (line) sha = line.split(" ")[0]!;
        } catch {}
      }
      return { ok: true, branch, sha };
    }
    // detached HEAD: bare sha
    if (/^[0-9a-f]{40}$/i.test(head)) {
      return { ok: true, branch: null, sha: head };
    }
    return { ok: true, branch: null, sha: null };
  } catch {
    return { ok: false };
  }
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !rel.startsWith("..") && !resolve(rel).startsWith("..");
}

type Subscriber = (evt: ServerEvent) => void;

type ServerEvent =
  | { type: "ready" }
  | { type: "docs:changed" }
  | { type: "doc:changed"; root: string; path: string }
  | { type: "refs:changed"; root: string; path: string };

function startWatcher(root: Root, emit: Subscriber) {
  const mdRe = /\.(md|mdx|markdown|txt|html?)$/i;
  let pending: NodeJS.Timeout | null = null;
  const queue: ServerEvent[] = [];

  const flush = () => {
    pending = null;
    const seen = new Set<string>();
    for (const evt of queue) {
      const key =
        evt.type === "doc:changed"
          ? `${evt.type}:${evt.root}:${evt.path}`
          : evt.type;
      if (seen.has(key)) continue;
      seen.add(key);
      emit(evt);
    }
    queue.length = 0;
  };

  const schedule = (evt: ServerEvent) => {
    queue.push(evt);
    if (!pending) pending = setTimeout(flush, 50);
  };

  try {
    const watcher = watch(
      root.path,
      { recursive: true, persistent: false },
      (eventType, filename) => {
        if (!filename) {
          schedule({ type: "docs:changed" });
          return;
        }
        const rel = filename.split(sep).join("/");
        const segments = rel.split("/");
        if (segments.some((s) => s.startsWith(".") || IGNORED.has(s))) return;
        if (!mdRe.test(rel)) return;
        schedule({ type: "doc:changed", root: root.name, path: rel });
        if (eventType === "rename") schedule({ type: "docs:changed" });
      },
    );
    return () => watcher.close();
  } catch {
    return () => {};
  }
}

export function startServer(opts: ServerOptions) {
  const roots = makeRoots(opts.roots);
  const rootByName = new Map(roots.map((r) => [r.name, r]));
  const sockets = new Set<import("bun").ServerWebSocket<unknown>>();

  const refIndex = new RefIndex();
  refIndex.setRoots(roots);

  const stopFns = roots.map((r) =>
    startWatcher(r, async (evt) => {
      const msg = JSON.stringify(evt);
      for (const ws of sockets) {
        try {
          ws.send(msg);
        } catch {}
      }
      if (evt.type === "doc:changed") {
        let exists = false;
        try {
          const root = rootByName.get(evt.root);
          if (root) {
            const s = await stat(resolve(root.path, evt.path));
            exists = s.isFile();
          }
        } catch {}
        refIndex.noteFileChange(evt.root, evt.path, exists);
        const refsMsg = JSON.stringify({
          type: "refs:changed",
          root: evt.root,
          path: evt.path,
        });
        for (const ws of sockets) {
          try {
            ws.send(refsMsg);
          } catch {}
        }
      }
    }),
  );

  // Enumerate files per root once at startup so the index has a file list to
  // resolve hrefs against and pre-filter backrefs scans. No parsing here —
  // content is read lazily per query.
  (async () => {
    for (const r of roots) {
      try {
        const files = await walkMarkdown(r.path);
        refIndex.setFiles(r.name, files);
      } catch {}
    }
  })();

  const agent = new ACPAgent(roots[0]?.path ?? process.cwd());
  let history: ChatHistory = { messages: [] };
  loadHistory().then((h) => {
    history = h;
  });

  const broadcast = (msg: unknown) => {
    const s = JSON.stringify(msg);
    for (const ws of sockets) {
      try {
        ws.send(s);
      } catch {}
    }
  };

  let streamingAssistantId: string | null = null;
  agent.on((evt: ChatEvent) => {
    if (evt.type === "chat:update") {
      const u = evt.update;
      if (u.sessionUpdate === "agent_message_chunk" && u.content.type === "text") {
        if (!streamingAssistantId) {
          streamingAssistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const msg: ChatMessage = {
            id: streamingAssistantId,
            role: "assistant",
            content: "",
            ts: Date.now(),
          };
          history.messages.push(msg);
        }
        const last = history.messages[history.messages.length - 1];
        if (last && last.id === streamingAssistantId) {
          last.content += u.content.text;
        }
      }
    } else if (evt.type === "chat:done") {
      streamingAssistantId = null;
      saveHistory(history);
    }
    broadcast(evt);
  });

  agent.ensureStarted().catch(() => {});

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host ?? "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/api/ws") {
        if (server.upgrade(req)) return undefined;
        return new Response("Upgrade failed", { status: 400 });
      }

      return handleHttp(url, path, roots, rootByName, history, broadcast, refIndex);
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
        ws.send(JSON.stringify({ type: "ready" }));
        const modes = agent.getModes();
        if (modes.available.length > 0 || modes.currentId) {
          try {
            ws.send(
              JSON.stringify({
                type: "chat:modes",
                available: modes.available,
                currentId: modes.currentId,
              }),
            );
          } catch {}
        }
        for (const p of agent.getPendingPermissions()) {
          try {
            ws.send(
              JSON.stringify({
                type: "chat:permission",
                id: p.id,
                options: p.options,
                toolCall: p.toolCall,
              }),
            );
          } catch {}
        }
      },
      close(ws) {
        sockets.delete(ws);
      },
      async message(_ws, raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch {
          return;
        }
        const msg = parsed as { type?: string };
        if (msg.type === "chat:send") {
          const m = parsed as {
            text: string;
            contextPath?: string;
            contextRoot?: string;
          };
          const userMsg: ChatMessage = {
            id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "user",
            content: m.text,
            ts: Date.now(),
            contextPath: m.contextPath,
          };
          history.messages.push(userMsg);
          saveHistory(history);
          broadcast({ type: "chat:message", message: userMsg });

          let contextText: string | undefined;
          if (m.contextRoot && m.contextPath) {
            const r = rootByName.get(m.contextRoot);
            if (r) {
              const target = resolve(r.path, m.contextPath);
              if (isInside(r.path, target)) {
                try {
                  contextText = await readFile(target, "utf8");
                } catch {}
              }
            }
          }

          const blocks: Array<
            | { type: "text"; text: string }
            | {
                type: "resource";
                resource: { uri: string; mimeType: string; text: string };
              }
          > = [];
          if (contextText && m.contextPath) {
            blocks.push({
              type: "resource",
              resource: {
                uri: `file://${m.contextRoot}/${m.contextPath}`,
                mimeType: "text/markdown",
                text: contextText,
              },
            });
          }
          blocks.push({ type: "text", text: m.text });

          try {
            await agent.prompt(blocks as never);
          } catch (err) {
            broadcast({
              type: "chat:done",
              stopReason: "error",
              error: String((err as { message?: string })?.message ?? err),
            });
          }
        } else if (msg.type === "chat:cancel") {
          await agent.cancel();
        } else if (msg.type === "chat:clear") {
          history = { messages: [] };
          await saveHistory(history);
          broadcast({ type: "chat:cleared" });
        } else if (msg.type === "chat:permission-response") {
          const m = parsed as { id: string; optionId: string | null };
          if (typeof m.id === "string") {
            agent.resolvePermission(m.id, m.optionId ?? null);
          }
        } else if (msg.type === "chat:set-mode") {
          const m = parsed as { modeId: string };
          if (typeof m.modeId === "string") {
            try {
              await agent.setMode(m.modeId);
            } catch (err) {
              broadcast({
                type: "chat:done",
                stopReason: "error",
                error: String((err as { message?: string })?.message ?? err),
              });
            }
          }
        }
      },
    },
  });

  (server as unknown as { stopWatchers?: () => void }).stopWatchers = () => {
    for (const fn of stopFns) fn();
  };
  return server;
}

async function handleHttp(
  url: URL,
  path: string,
  roots: Root[],
  rootByName: Map<string, Root>,
  history: ChatHistory,
  broadcast: (msg: unknown) => void,
  refIndex: RefIndex,
): Promise<Response> {
  const asset = ASSETS[path];
  if (asset) {
    return new Response(asset.body, {
      headers: { "content-type": asset.type },
    });
  }

  if (path === "/api/chat/history") {
    return Response.json(history);
  }

  if (path === "/api/changelog") {
    return new Response(CHANGELOG, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  }

  if (path === "/api/search") {
    const q = url.searchParams.get("q") ?? "";
    const results = await searchContent(roots, q);
    return Response.json({ results });
  }

  if (path === "/api/docs") {
    broadcast({
      type: "scan:start",
      roots: roots.map((r) => ({ name: r.name, path: r.path })),
    });
    const result = await Promise.all(
      roots.map(async (r) => {
        let lastEmit = 0;
        const files = await walkMarkdown(r.path, (rel, count) => {
          const now = Date.now();
          if (count === 1 || now - lastEmit >= 80) {
            lastEmit = now;
            broadcast({
              type: "scan:file",
              root: r.name,
              path: rel,
              count,
            });
          }
        });
        broadcast({
          type: "scan:root-done",
          root: r.name,
          total: files.length,
        });
        return { name: r.name, path: r.path, files };
      }),
    );
    broadcast({ type: "scan:done" });
    return Response.json({ roots: result, version: VERSION });
  }

  if (path === "/api/git") {
    const rootName = url.searchParams.get("root") ?? roots[0]?.name;
    const r = rootName ? rootByName.get(rootName) : undefined;
    if (!r) return Response.json({ ok: false });
    const info = await readGitInfo(r.path);
    return Response.json(info);
  }

  if (path === "/api/asset") {
    const rel = url.searchParams.get("path");
    const rootName = url.searchParams.get("root") ?? roots[0]?.name;
    if (!rel) return new Response("Missing path", { status: 400 });
    if (!rootName) return new Response("No roots configured", { status: 404 });
    const root = rootByName.get(rootName);
    if (!root) return new Response("Unknown root", { status: 404 });
    const target = resolve(root.path, rel);
    if (!isInside(root.path, target)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const file = Bun.file(target);
      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(file);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  if (path === "/api/refs" || path === "/api/backrefs" || path === "/api/health") {
    const rel = url.searchParams.get("path");
    const rootName = url.searchParams.get("root") ?? roots[0]?.name;
    if (!rel) return new Response("Missing path", { status: 400 });
    if (!rootName) return new Response("No roots configured", { status: 404 });
    const root = rootByName.get(rootName);
    if (!root) return new Response("Unknown root", { status: 404 });
    const target = resolve(root.path, rel);
    if (!isInside(root.path, target)) {
      return new Response("Forbidden", { status: 403 });
    }
    const edges =
      path === "/api/backrefs"
        ? await refIndex.getBackrefs(rootName, rel)
        : await refIndex.getRefs(rootName, rel);
    return Response.json({ edges });
  }

  if (path === "/api/doc") {
    const rel = url.searchParams.get("path");
    const rootName = url.searchParams.get("root") ?? roots[0]?.name;
    if (!rel) return new Response("Missing path", { status: 400 });
    if (!rootName) return new Response("No roots configured", { status: 404 });
    const root = rootByName.get(rootName);
    if (!root) return new Response("Unknown root", { status: 404 });
    const target = resolve(root.path, rel);
    if (!isInside(root.path, target)) {
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
}
