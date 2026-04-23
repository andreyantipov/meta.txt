#!/usr/bin/env bun
// Spin up the API server (watch mode) and Vite HMR together.
// Positional args go to the meta.txt server so you can point it at a target
// repo:  `bun dev /path/to/some/repo`.
// `--port N` (or `-p N`) sets the browser-facing Vite port; the API always
// runs on 4242 in dev (Vite proxies to it).

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

const rawArgs = process.argv.slice(2);
let uiPort: string | undefined;
const serverArgs: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]!;
  if (a === "--port" || a === "-p") {
    uiPort = rawArgs[++i];
  } else if (a.startsWith("--port=")) {
    uiPort = a.slice("--port=".length);
  } else {
    serverArgs.push(a);
  }
}

const server = spawn(
  "bun",
  ["run", "--watch", "bin/meta.ts", ...serverArgs],
  { cwd: root, stdio: "inherit" },
);

const ui = spawn("bun", ["run", "dev"], {
  cwd: resolve(root, "ui"),
  stdio: "inherit",
  env: { ...process.env, ...(uiPort ? { META_DEV_PORT: uiPort } : {}) },
});

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of [server, ui]) {
    if (!p.killed) p.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 150);
};

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

server.on("exit", (code) => shutdown(code ?? 0));
ui.on("exit", (code) => shutdown(code ?? 0));
