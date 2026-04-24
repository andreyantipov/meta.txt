# meta.txt

**A local doc browser and Claude chat for your repo.**

> **Status: alpha.** Pre-1.0, so expect breaking changes between minor
> versions and rough edges in the UI. Feedback and bug reports welcome
> via [GitHub issues](https://github.com/andreyantipov/meta.txt/issues).

Point `npx meta.txt` at one or more directories and read your docs in
a fast, focused viewer with tabs, split view, full-text search, and an
optional Claude side-panel that can take the open doc as context.

The artifact stays the markdown in your repo. The tool is an optional
local viewer — nothing is built, exported, or sent anywhere except the
chat prompts you type yourself.

## Features

### Browsing

- **Multiple roots.** Point at any number of directories; each becomes
  a section in the sidebar.
- **Markdown, text, and HTML** with Mermaid diagrams rendered inline.
  HTML pages render in reader mode when possible.
- **File tree + Outline** in one sidebar — file tree on top, heading
  outline of the current doc below it. Click a heading to scroll. Both
  panels are always visible; the outline shows an empty state when a
  doc has no headings.
- **Handles large repos** — file tree and outline are built in O(N),
  so 40k-file trees (Unity docs, llvm, etc.) open without jank. The
  outline appears instantly even on large markdown; the full parse
  happens in the background.
- **Live reload** — edits show up without refreshing.

### Search

- **`⌘K` command palette** searches both filenames and file contents
  in one list, with line numbers and highlighted snippets.

### Chat (via Claude)

- **Side panel toggled with `⌘J`**, focused on the input the moment it
  opens.
- **Uses your existing `claude login`** — no API keys to manage.
- **Open doc as context** — a checkbox attaches the current file to
  your prompt.
- **Streaming responses** rendered as markdown, with persistent chat
  history.

### Tabs & split view

- **Tabs per pane** with `⌘[` / `⌘]` to cycle, middle-click or `×` to
  close.
- **Horizontal split** for reading two docs side-by-side.
- **Drag-to-split** — drag any tab toward the right edge of the
  viewer and drop it on the highlighted zone to create a new pane.
- **Drag between panes** to rearrange. Close the secondary pane with
  its `×`.
- **Tabs survive reload** along with the split layout and active doc.

### Layout & status

- **Resizable 3-zone layout** (sidebar / viewer / chat) with `⌘B` to
  toggle the sidebar and `⌘J` for chat.
- **Status bar** shows the current git `branch (sha) → path`, file
  size, exact token count, reading time, and zoom controls for the
  active pane. Click the version to read the changelog.
- **Auto / Light / Dark theme** — follows your system by default, one
  click to pick a specific mode. HTML pages recolour with the theme.
- **Customisable keyboard shortcuts** — press `?` (or click the
  keyboard icon in the status bar) to browse every shortcut and
  rebind any of them.

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

Every global shortcut is rebindable — press `?` in the app to browse
and customise them.

| Keys             | Action                                    |
| ---------------- | ----------------------------------------- |
| `⌘K` / `Ctrl+K`  | open command palette (files + content)    |
| `⌘J` / `Ctrl+J`  | toggle chat panel                         |
| `⌘B` / `Ctrl+B`  | toggle sidebar                            |
| `⌘W` / `Ctrl+W`  | close active tab                          |
| `⌘[` / `⌘]`      | cycle tabs in the active pane             |
| `⌘=` / `⌘-`      | zoom active pane in / out                 |
| `⌘0`             | reset active pane zoom                    |
| `?`              | open the keyboard shortcuts dialog        |
| `↑` / `↓`        | navigate palette results                  |
| `↵`              | open selected result / send chat message  |
| `⇧↵`             | newline in chat input                     |
| `Esc`            | close palette / dialog                    |

## Caveats

`meta.txt` is a local-only developer tool. The server binds to
`127.0.0.1` and is meant to be run against your own repo on your own
machine.

- **HTML can run scripts.** Articles render in safe reader mode, but
  pages that aren't article-shaped fall back to an iframe with scripts
  and network enabled. Don't point `meta.txt` at directories containing
  untrusted HTML.
- **Chat goes to Anthropic.** Prompts you send travel to Claude via
  your local `claude login`, just as they would from Claude Code.

See [CHANGELOG.md](./CHANGELOG.md) for what's new, and
[CLAUDE.md](./CLAUDE.md) for the development layout, build flow, and
embedding notes.
