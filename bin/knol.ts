#!/usr/bin/env bun
import { startServer } from "../src/server.ts";

function parseArgs(argv: string[]) {
  const opts: { port: number; dir: string; open: boolean; help: boolean } = {
    port: Number(process.env.KNOL_PORT ?? 4343),
    dir: process.cwd(),
    open: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--port") opts.port = Number(argv[++i]);
    else if (a === "-d" || a === "--dir") opts.dir = argv[++i] ?? process.cwd();
    else if (a === "--open") opts.open = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a && !a.startsWith("-")) opts.dir = a;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(`knol — markdown docs viewer

Usage:
  bunx knol [dir]            serve .md files from <dir> (default: cwd)
  bunx knol -p 4000          use port 4000
  bunx knol --open           open browser on start
`);
  process.exit(0);
}

const server = startServer({ port: opts.port, root: opts.dir });
const url = `http://${server.hostname}:${server.port}`;
console.log(`knol  ${url}  (docs: ${opts.dir})`);

if (opts.open) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([cmd, url]).exited.catch(() => {});
}
