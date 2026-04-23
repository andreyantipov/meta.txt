# meta.txt

**llms.txt, but for your repo.** A living markdown knowledge base for a
codebase — reasoning, decisions, architecture — that travels with the code
itself. The artifact is the markdown in the repo; the tool is an optional
web viewer invoked with `npx meta.txt` (or `bunx meta.txt` for Bun users).

## Repo layout

```
meta.txt/
├── bin/meta.ts        # CLI entry (arg parsing, starts server)
├── src/
│   ├── server.ts      # Bun.serve, /api/docs, /api/doc, static UI
│   └── assets.ts      # text-type imports of ui/dist → embedded in binary
├── ui/                # Vite + React + Tailwind v4 + shadcn/ui
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/    # sidebar, viewer + shadcn primitives under ui/
│   │   └── lib/
│   ├── components.json    # shadcn config (style=new-york, baseColor=zinc)
│   └── dist/              # built assets (gitignored, required for compile)
├── docs/              # sample markdown files for local practice
├── flake.nix          # nix devShell: bun + nodejs_20
├── .mcp.json          # shadcn MCP server for Claude Code
└── package.json       # scripts + bin
```

## Dev environment (nix)

```sh
nix develop               # drops you in a shell with bun + node + git
bun --version             # confirms bun is on PATH
```

The flake pins a single `devShells.default` that installs `bun`,
`nodejs_20`, and `git`. Nothing else — Vite/React/Tailwind/shadcn all
come from `bun install` inside `ui/`.

If you are not on nix, install Bun >= 1.1 and Node 20+ manually and
everything else works identically.

## First-time setup

```sh
bun install               # installs @types/bun in root
cd ui && bun install      # installs React, Vite, Tailwind, shadcn deps
```

## Daily workflow

Two terminals is the smoothest setup:

```sh
# terminal 1 — Bun server on :4242 (serves /api + built UI)
bun run dev:server

# terminal 2 — Vite dev server on :5173 (HMR for React), proxies /api → :4242
bun run dev:ui
```

Work against <http://localhost:5173> while iterating on the UI.
Point your browser at <http://127.0.0.1:4242> to see the production build.

## Build

```sh
bun run build:ui          # → ui/dist/{index.html, assets/app.{js,css}}
bun run build:bin         # → dist/meta (standalone binary, bundles runtime + UI)
bun run build             # both of the above
```

`src/assets.ts` imports the three UI artifacts with
`with { type: "text" }`. That causes `bun build --compile` to embed
them directly into the binary, so consumers do not need `ui/dist/` on
disk.

Consumer usage after publish:

```sh
npx meta.txt                  # Node users — fetches and runs
bunx meta.txt                 # Bun users — same, faster
./dist/meta                   # anyone — compiled single-file binary
```

## shadcn/ui

- Config lives in `ui/components.json` (style=new-york, baseColor=zinc,
  cssVariables=true, icon=lucide).
- Tokens are declared in `ui/src/index.css` as CSS variables, both in
  `:root` and `.dark`, and exposed to Tailwind via `@theme inline`.
- Components sit under `ui/src/components/ui/` and are owned by this
  repo — they are copied, not a dependency.

### Adding a shadcn component

```sh
cd ui
bunx --bun shadcn@latest add <component>
# e.g. bunx --bun shadcn@latest add dialog
```

This writes a new file into `src/components/ui/` and installs any
needed Radix deps into `ui/package.json`.

### Using the shadcn MCP (from Claude Code)

`.mcp.json` at the repo root registers the shadcn MCP server. On the
next Claude Code session in this directory it becomes available and
exposes tools for discovering and adding shadcn components. Prefer it
over running the CLI by hand when working through the agent.

## UI conventions

- **Path alias** `@/…` → `ui/src/…` (configured in both
  `vite.config.ts` and `tsconfig.app.json`).
- **Dark mode** is the default (`<html class="dark">` in
  `ui/index.html`). Flip to light by removing the class.
- **Markdown styling** lives in `ui/src/index.css` under the
  `.markdown-body` scope. No typography plugin — styles are hand-rolled
  so they match the shadcn token palette.

## API

The server exposes only two JSON endpoints plus static assets:

| method | path                                 | returns                                                             |
| ------ | ------------------------------------ | ------------------------------------------------------------------- |
| GET    | `/api/docs`                          | `{ roots: [{ name, path, files: string[] }] }` — one entry per root |
| GET    | `/api/doc?root=<name>&path=<rel>`    | raw text/plain of the file (path-traversal safe). `root` defaults to the first root if omitted. |

The CLI accepts one or more directories: `meta.txt docs/ api/`, or `-d` can be
repeated. Each root is assigned a unique name (basename, with `-2`/`-3` suffixes
on collision) used as the `root` query param and shown as a section header in
the sidebar when there are multiple roots.

Files are filtered by extension (`.md|.mdx|.markdown`). Paths starting
with `.` and the usual dependency/output dirs (`node_modules`, `.git`,
`dist`, `out`, `build`, `.next`, `.turbo`, `.cache`, `coverage`) are
skipped.

## Things to remember

- After editing UI code, run `bun run build:ui` before rebuilding the
  binary — `src/assets.ts` imports from `ui/dist/`, so stale output
  means a stale binary.
- Vite is configured with deterministic filenames (`app.js`, `app.css`).
  Do not change that unless you also update `src/assets.ts`.
- The server defaults to port `4242`. Override with `-p` on the CLI or
  the `META_PORT` env var.
