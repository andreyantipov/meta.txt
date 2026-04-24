# Changelog

All notable changes to meta.txt.

## [0.7.0] — 2026-04-24

### Added

- **References panel in the sidebar.** A new stacked panel under Outline shows the document's link graph: who links to the current doc (Referenced by), where it links out to (Links to), which of those are broken, and which point at files outside meta.txt's scope (Out of scope). Each section has its own count badge; the panel header shows all four counts at a glance even when collapsed, so you can tell at a glance whether a doc is connected. The panel auto-collapses when the active doc has zero edges.
- **Confidence gradient for edges.** Explicit markdown links and `<a href>` from HTML render as normal `link` edges. Frontmatter `refs:` arrays become `ref`-kind edges with a small `ref` badge. Plain-text file mentions (e.g. writing `scheduler.md` in prose without the markdown link syntax) become muted `(~)` mention edges so implicit references are visible but clearly softer than explicit ones.
- **Broken-link detection.** Links pointing at non-existent paths are marked broken-target (strikethrough + ⚠ icon); links pointing at missing anchors within an existing doc are broken-anchor. Rust-doc and Unity-style HTML anchors resolve correctly because the HTML parser now collects `id=` attributes from every element, not just headings.
- **Out-of-scope status.** Links that point at files that exist on disk but aren't indexed by meta.txt (e.g. `flake.nix`, `.mcp.json`, `*.yaml`) are now shown as a distinct muted section instead of being lumped into "broken". They become normal `ok` edges automatically as meta.txt widens its scope later.
- **Edge endpoints.** `GET /api/refs`, `/api/backrefs`, `/api/health` — each returns `{ edges: Edge[] }` where every edge carries `kind`, `status`, `from`, `to`, `line` and a context snippet. All computed on demand per request, no background indexing. Watcher events (`doc:changed`) invalidate the backref cache and broadcast `refs:changed` so open clients refetch.
- **Parser layer.** New `src/parsers/` module with `MarkdownParser` (gray-matter frontmatter + body link regex), `HtmlParser` (`node-html-parser` with `[id]` anchor extraction), and a `TextParser` stub. Single `getParserFor(path)` registry so future source kinds (code, notebooks) slot in without touching the ref index.
- **Tab backlink indicator.** Tabs whose document has incoming references show a small `↶N` next to the filename. Subtle but gives you a global sense of which open docs are "hubs".
- **Count badges.** Outline and References panel headers now carry right-aligned badges (`shadcn/ui` Badge) so you can tell how much is inside without expanding them. Project roots in the file tree show their file count as muted text.

### Architecture

- **On-demand reference resolution.** Backrefs for a target document are computed by substring-filtering candidate files by basename, reading only the hits, and parsing them in 32-way concurrent batches — no corpus-wide indexing phase at startup. First backref query on a large corpus (Unity docs, 40k files) is a few seconds; subsequent queries are cached. Startup is instant regardless of corpus size.

## [0.6.0] — 2026-04-24

### Added

- **Approve or reject tool calls from chat.** When the chat agent asks to run a tool that needs permission, an inline card now appears in the chat with the tool name, its input preview and action buttons for each option the agent offers (allow once / always, reject once / always). Previously every permission request was silently cancelled, which made the chat unusable for any tool-using flow.
- **Chat permission-mode picker.** A new dropdown in the chat footer lets you switch between the agent's permission modes — each with its own icon (⚡ Bypass, 🛡 Default, ✏ Accept Edits, 📝 Plan, ✋ Don't Ask, ✨ Auto). Agent boots eagerly on server start so the picker is live from the first page paint, not just after your first message.
- **Stacked sticky project groups in the file tree.** When you open meta.txt with multiple roots (`meta.txt repo-a repo-b …`), each project gets an inline group header above its content. As you scroll, the headers you've passed stack up at the top of the sidebar (iOS Contacts-style), so you always see which projects are above and below where you are. Click any header to collapse / expand that project independently — any combination can be open at the same time.
- **HTML outline support.** The outline panel now extracts headings from rendered HTML documents too, not just markdown — handy for browsing Unity/JavaDoc-style reference trees alongside your own docs.

### Improved

- **File tree keeps your scroll position.** Expanding or collapsing a folder no longer snaps the viewport back to the active file — the scroll stays exactly where you left it. Page refresh also restores the previous scroll offset.
- **Chat input autofocuses on open.** Pressing ⌥J (or clicking the Chat button) now puts the cursor in the textarea so you can start typing immediately.
- **Alt-hints on header close buttons.** Holding ⌥/Alt reveals the shortcut chip next to the sidebar's and chat's close buttons, matching the other hinted controls.

### Fixed

- **Mermaid diagrams now repaint when you toggle the theme.** Previously `useTheme()` kept per-component state, so switching light ↔ dark in the status bar didn't notify the document renderer, and a stale-themed diagram would stick around until you navigated away or refreshed. Theme state is now global; the diagram re-renders on the next tick.

## [0.5.1] — 2026-04-24

### Fixed

- **Installs from npm no longer crash at startup.** `src/server.ts` imports `../CHANGELOG.md` to serve it from the status-bar version link, but CHANGELOG.md wasn't listed in `package.json#files`, so the published tarball was missing it and `bunx meta.txt` died with `Cannot find module '../CHANGELOG.md'`. Added CHANGELOG.md to the files list.

## [0.5.0] — 2026-04-24

### Added

- **Theme toggle** — Auto / Light / Dark dropdown in the status bar. Follows the system preference by default.
- **Keyboard shortcuts dialog** — press `?` or click the keyboard icon in the status bar. Browse all shortcuts, rebind any of them, reset to defaults. Tooltips and kbd-chips across the UI follow your custom bindings.
- **Drag-to-split** — drag a tab toward the right edge of the viewer. A "Drop to split" zone appears, and releasing there creates a new pane with that tab.
- **Changelog** — click the version in the status bar to see what's new.

### Improved

- **Performance on large repos** — file tree now builds in O(N) instead of O(N²). On repos with 40k+ markdown files (Unity docs, llvm, etc.) the sidebar appears almost instantly instead of stalling for hundreds of ms.
- **Outline appears instantly** — headings are extracted via a fast scan first; the full markdown parse runs in the background, so the document shell and outline render without blocking.
- **Outline panel is always visible** in the sidebar, with a clear empty state. No more layout shift as you switch between documents.
- **Chat panel** — long paths in messages now wrap correctly. Redundant `Chat · Chat` header is gone: the panel owns its own close button, like the sidebar does.
- **Status bar separator** between doc count and current file path stays visible even when there's no git branch.

## [0.4.0] — earlier

### Added

- Outline (TOC) panel in the sidebar with tree view, vertical resize and collapse.
- Status bar: git branch + sha, reading time, dedicated zoom group.
- Per-pane zoom and tab bar zoom controls.
- `bun dev` one-command dev loop with auto-isolated API and Vite ports.

## [0.3.0] and earlier

Initial public releases. Command palette, markdown viewer, file tree, chat panel via ACP, file watching with live reload, split view, tabs.
