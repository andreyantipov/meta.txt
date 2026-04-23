# Architecture

```
┌──────────────┐    GET /api/docs       ┌─────────────────┐
│ React UI     │ ────────────────────▶ │ Bun server      │
│ (ui/dist)    │    GET /api/doc       │ (src/server.ts) │
│              │ ◀──────────────────── │                 │
└──────────────┘                        └────────┬────────┘
       ▲                                         │ fs walk
       │ static assets                           ▼
       └──────── embedded via `with { type: … }` into the binary
```

## Pieces

- **`bin/knol.ts`** — CLI entry point, parses args, starts the server.
- **`src/server.ts`** — `Bun.serve`, two small APIs + static assets.
- **`src/assets.ts`** — pulls `ui/dist/*` into the bundle at build time
  using text-type imports, so `bun build --compile` embeds them.
- **`ui/`** — Vite + React + Tailwind v4 + shadcn/ui. Built into
  `ui/dist/` with deterministic filenames (`app.js`, `app.css`).

## Why this shape

- One deliverable: a single executable from `bun build --compile`.
- Consumer runs it anywhere without Node or `npm install`.
- During dev, Vite handles HMR; the Bun server still serves the API.
