#!/usr/bin/env bun
import { startServer } from "../src/server.ts";

function parseArgs(argv: string[]) {
  const opts: { port: number; dirs: string[]; open: boolean; help: boolean } = {
    port: Number(process.env.META_PORT ?? 4242),
    dirs: [],
    open: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--port") opts.port = Number(argv[++i]);
    else if (a === "-d" || a === "--dir") {
      const v = argv[++i];
      if (v) opts.dirs.push(v);
    } else if (a === "--open") opts.open = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a && !a.startsWith("-")) opts.dirs.push(a);
  }
  if (opts.dirs.length === 0) opts.dirs.push(process.cwd());
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(`meta.txt — markdown docs viewer

Usage:
  npx meta.txt [dir...]         serve .md files from one or more <dir> (default: cwd)
  npx meta.txt docs/ api/       serve multiple directories
  npx meta.txt -d docs -d api   same, via flags
  npx meta.txt -p 4000          use port 4000
  npx meta.txt --open           open browser on start

Bun users: replace npx with bunx.
`);
  process.exit(0);
}

const server = startServer({ port: opts.port, roots: opts.dirs });
const url = `http://${server.hostname}:${server.port}`;
console.log(`meta.txt  ${url}`);
for (const d of opts.dirs) console.log(`  docs: ${d}`);

if (opts.open) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([cmd, url]).exited.catch(() => {});
}
