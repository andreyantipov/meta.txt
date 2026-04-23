# meta.txt

**A local doc browser and Claude chat for your repo.**

Point `npx meta.txt` at one or more directories and get:

- a fast tree + command palette to navigate `.md` / `.mdx` / `.txt` /
  `.html` files;
- tabs for keeping multiple docs open, with a side-by-side split view
  and drag-and-drop to move tabs between panes;
- full-text search across file contents with highlighted snippets;
- a reader-mode renderer for HTML docs (Unity/Storybook/JSDoc-style);
- a Claude chat panel that can take the currently open doc as context,
  authenticated via your existing `claude login` — no API keys stored;
- live reload as you edit, resizable panels, dark mode, and a token
  counter so you know how much of a model's context window a doc eats.

The artifact is still the markdown in your repo. The tool is an optional
local viewer — nothing is built, exported, or sent anywhere except the
chat prompts you type yourself.

## Features

### Browsing

- **Multiple roots** — point at any number of directories and browse them
  side-by-side. Each root becomes a collapsible section in the sidebar.
- **Supported file types**: `.md` / `.mdx` / `.markdown` (GFM via `marked`
  with hand-rolled shadcn-matched typography), `.txt` (monospace
  pre-formatted), `.html` / `.htm` (rendered via Mozilla Readability in
  reader mode; falls back to sandboxed `<iframe>` if extraction fails).
  Images and other embedded media are stripped from the rendered output.
- **Mermaid diagrams** — fenced ` ```mermaid ` code blocks are rendered
  to inline SVG client-side via [mermaid](https://mermaid.js.org/),
  themed to match the app.
- **File tree + Outline** — both panels share a single `TreeRow`
  component: one indicator column (folder/file icon or heading caret),
  consistent dotted indent guides with T-connectors, same hover/active
  treatment. File-tree expand state persists per-folder; auto-expands
  ancestors of the active file.
- **Outline** — heading TOC for the active document, shown below the
  file tree. Works for `.md` / `.mdx` (from `marked` tokens) and `.html`
  (parsed from raw HTML up-front, then upgraded with live element refs
  once the page renders so click-to-scroll works in reader mode). Click
  any entry to smooth-scroll to that heading.
- **Live reload** — the server watches your roots and pushes updates over
  WebSocket; edits show up without a refresh.

### Search

- **`⌘K` / `Ctrl+K` command palette** — unified search across all roots
  with two sections:
  - **Files** — fuzzy match on filenames.
  - **Content** — substring match on file bodies, with line numbers and
    highlighted snippets (~80-char windows, up to 3 hits per file).
- Arrow keys navigate both sections in one list, `↵` opens, `esc` closes.

### Chat (via Claude)

- **Embedded chat panel** on the right, toggled with `⌘J` / `Ctrl+J`.
- **Zero-config auth** — runs
  [`@agentclientprotocol/claude-agent-acp`](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)
  as a subprocess and authenticates via your existing `claude login`. No
  API keys in the UI.
- **Context attachment** — a toggle automatically sends the currently
  open `.md` file as an ACP `resource` block alongside your prompt.
- **Smooth streaming** — incoming tokens are buffered and paced via
  `requestAnimationFrame`, so long responses reveal evenly regardless of
  burstiness on the wire. Markdown renders once on turn completion.
- **Persistent history** — chat log written to
  `/tmp/meta.txt/chat.json`, restored on page reload.

### Tabs & split view

- **Tabs per pane** — open docs stay open as tabs, click to switch,
  middle-click or hover-`×` to close. `⌘[` / `⌘]` cycle through tabs
  in the active pane.
- **Horizontal split** — the split button in the tab bar opens a second
  pane on the right with a resizable handle between them. The secondary
  pane gets an `×` close button (the primary pane intentionally does
  not — closing it would discard your original tabs); closing the last
  tab in either pane also collapses the split.
- **Drag-and-drop between panes** — grab any tab and drop it onto
  either pane's tab bar. A thin indicator shows the insert position;
  moving the last tab out of a pane auto-collapses it.
- **Persistence** — tabs, active tab per pane, active pane, and the
  split layout all survive page reload via `localStorage`.

### Layout

- **Resizable 3-zone layout** (sidebar / viewer / chat) with drag
  handles. Per-panel min/max limits, sizes saved to `localStorage`. The
  viewer zone internally hosts the tab/split view described above.
- **Collapsible panels** — `⌘B` toggles the sidebar, `⌘J` toggles chat.
- **Status bar** — shows app version, root count, current git
  `branch (sha) → path`, plus live stats for the active pane: file kind,
  byte size, exact token count (via `gpt-tokenizer`, with model context
  budgets in the tooltip), Medium-style reading time (via `reading-time`),
  and a zoom group (`−` `100%` `+`) for the active pane.
- **Dark mode by default.** Tokens via CSS variables from shadcn/ui
  (`new-york` style, zinc base).
- **Phosphor icons** throughout (tree, palette, chat, headers).

## Usage

```sh
npx meta.txt                 # current directory
npx meta.txt ./docs          # specific folder
npx meta.txt ./docs ./api    # multiple folders
npx meta.txt -d docs -d api  # same, via flags
npx meta.txt -p 4000         # custom port
npx meta.txt --open          # open browser on start
```

Bun users:

```sh
bunx meta.txt
```

Default port is `4242` (override with `-p` or `META_PORT`).

## Shortcuts

| Keys             | Action                                    |
| ---------------- | ----------------------------------------- |
| `⌘K` / `Ctrl+K`  | open command palette (files + content)    |
| `⌘J` / `Ctrl+J`  | toggle chat panel                         |
| `⌘B` / `Ctrl+B`  | toggle sidebar                            |
| `⌘[` / `⌘]`      | cycle tabs in the active pane             |
| `⌘=` / `⌘-`      | zoom active pane in / out                 |
| `⌘0`             | reset active pane zoom                    |
| `↑` / `↓`        | navigate palette results                  |
| `↵`              | open selected result / send chat message  |
| `⇧↵`             | newline in chat input                     |
| `Esc`            | close palette                             |

## Endpoints

The server exposes a small JSON API used by the web UI:

| Method | Path                                | Returns                                                |
| ------ | ----------------------------------- | ------------------------------------------------------ |
| GET    | `/api/docs`                         | `{ roots: [{ name, path, files: string[] }], version }` |
| GET    | `/api/doc?root=<name>&path=<rel>`   | raw text/plain of a file (path-traversal safe)         |
| GET    | `/api/asset?root=<name>&path=<rel>` | raw bytes for binary assets next to a doc              |
| GET    | `/api/search?q=<query>`             | `{ results: ContentHit[] }` — substring hits with line + snippet |
| GET    | `/api/git?root=<name>`              | `{ ok, branch, sha }` — best-effort `.git/HEAD` read   |
| GET    | `/api/chat/history`                 | `{ messages: ChatMessage[] }` — persisted chat log     |
| WS     | `/api/ws`                           | push events for doc/docs changes + chat streaming      |

Zero install — the artifact is the markdown in your repo. The tool is an
optional web viewer.

## Caveats

**`meta.txt` is a local-only developer tool.** The server binds to
`127.0.0.1` by default and is meant to be run against your own repo on
your own machine. A few things to keep in mind:

- **HTML files fall back to an unsandboxed iframe.** `.html` / `.htm`
  files are first passed through Mozilla Readability and rendered as
  text — no scripts, no network, no images. But if extraction fails
  (e.g. the page isn't article-shaped) we fall back to `<iframe srcdoc>`
  with scripts, styles, and network access enabled. The iframe gets a
  small dark-theme stylesheet injected so it doesn't flashbang you on
  open, but **do not point `meta.txt` at directories containing
  untrusted HTML** — the iframe fallback can execute arbitrary
  JavaScript. If this matters, avoid `.html` files in the served roots.
- **Chat uses your local Claude login.** The chat panel spawns
  `npx -y @agentclientprotocol/claude-agent-acp` and authenticates via
  your machine's existing `claude` CLI credentials. No API keys are
  managed by this tool. Prompts you send travel to Anthropic, just as
  they would from Claude Code.
- **Chat history lives in `/tmp/meta.txt/chat.json`.** Plain JSON, not
  encrypted, wiped by OS-level tmp cleanup.
- **Content search is plain substring.** Case-insensitive, no regex, no
  ranking — matches first 80 chars around each hit, capped at 3 per file
  and 80 total.
- **Not a static site generator.** Nothing is built or exported; the
  viewer is only alive while the CLI is running.

See [CLAUDE.md](./CLAUDE.md) for the development layout, build flow, and
embedding notes.
