#!/usr/bin/env bun
// Spin up the API server (watch mode) and Vite HMR together, isolated.
// Positional args go to the meta.txt server so you can point it at a target
// repo:  `bun dev /path/to/some/repo`.
// `--port N` (or `-p N`) sets the browser-facing Vite port. The API port is
// auto-discovered at startup so nothing on your machine (stale npx meta.txt,
// another dev server, whatever) can collide with it.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
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

function probePort(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = createServer();
    s.once("error", () => done(false));
    s.listen(port, "127.0.0.1", () => s.close(() => done(true)));
  });
}

async function findFreePort(start: number, tries = 50): Promise<number> {
  for (let i = 0; i < tries; i++) {
    const p = start + i;
    if (await probePort(p)) return p;
  }
  throw new Error(`no free port found starting at ${start}`);
}

const apiPort = await findFreePort(4242);
console.log(`[dev] api: http://127.0.0.1:${apiPort}`);

const server = spawn(
  "bun",
  ["run", "--watch", "bin/meta.ts", "-p", String(apiPort), ...serverArgs],
  { cwd: root, stdio: "inherit" },
);

const ui = spawn("bun", ["run", "dev"], {
  cwd: resolve(root, "ui"),
  stdio: "inherit",
  env: {
    ...process.env,
    META_DEV_API_PORT: String(apiPort),
    ...(uiPort ? { META_DEV_PORT: uiPort } : {}),
  },
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
