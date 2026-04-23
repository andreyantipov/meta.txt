# Getting started

## Run the dev server

```sh
bun run dev:server
```

Then open <http://127.0.0.1:4343>.

## Run the UI in hot-reload mode

In another terminal:

```sh
bun run dev:ui
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the server on
`4343`, so API calls keep working while you iterate on the UI.

## Produce a standalone binary

```sh
bun run build
./dist/knol
```

The binary contains the UI assets and the Bun runtime — no Node, no
`npm install` required on the consumer side.
