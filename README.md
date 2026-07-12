# ocraft

A personal **offline knowledge + scripts app**: a flat, link-based set of HTML **docs** (the knowledge base), runnable **scripts** (Vue / Solid / vanilla experiments), and **bins** (downloadable binary assets) — all discovered from disk and served by a tiny, framework-free Node.js backend. Navigation is **hyperlinks, not folders**; docs are editable in place.

A Vue 3 + Vite + Tailwind/daisyUI frontend on top of a plain Node.js runtime written in **TypeScript** (ESM, run via Node's native type stripping — no build step for the backend). Single-user, local-first.

> **Lineage.** ocraft began as a multi-user *node-OS* — a typed-node store (Postgres) with a visual tree editor, Google/email auth, and a tasks/scheduler layer. That backend still lives in `runtime/` (node CRUD, auth, pg), but it's **paused**: prod Postgres is deleted and the current frontend doesn't use it. Today ocraft *is* the offline app; the node-store is legacy, kept for reference / possible revival.

## The app (`frontend/`)

A Vite single-page app. The sidebar lists three kinds of thing under one filter; the right pane runs or renders the selection. In-app links (`/doc/<name>`, `/script/<name>`, `/bin/<name>`) navigate without a reload and work as deep links. Nothing here needs a login.

- **docs** (`frontend/docs/*.{html,md}`) — the knowledge base: hand-authored **HTML fragments or Markdown**, discovered by `import.meta.glob` (md is compiled to html on load via `marked` and rendered through the same pane, so wikilinks/styling/editing are shared; use html only where you need markup md can't hold — inline color, tables, embeds). **Flat namespace, no folders** — you organize by **hyperlinks** (`/doc/<name>` wikilinks) and hand-curated *index / hub* docs (Maps of Content), so one doc can sit under many indexes. Rendered read-only, but **editable in place in dev**: an *edit* button swaps the doc for a raw-source textarea, and *save* writes back to the file (via a Vite middleware — see below). The deployed static build stays read-only.
- **scripts** (`frontend/scripts/*.{vue,js,ts,jsx,tsx}`) — runnable experiments, told apart by extension: `.vue` = a Vue component; `.js`/`.ts` = vanilla (`export default (host) => cleanup?`, handed a host `<div>`); `.jsx`/`.tsx` = a Solid component. Vite compiles them; cross-script reuse is plain ES `import`. Some talk to the live backend (a harness → `/api/claude`, the ws testers → `/api/ws`).
- **bins** (`frontend/public/bins/`) — binary / large / downloadable assets, opened by a type-aware viewer: **gz-text** is inflated in the browser via `DecompressionStream` (no server round-trip), **txt** shown as-is, images/audio/video get a native element, anything else is a download link. Served as static files (not bundled), fetched on open. The listing at `/bins/manifest.json` is **generated from the folder** by a Vite plugin (dev-served + written at build) — drop a file in and it appears, type inferred from extension; no hand-kept manifest. Gzip assets use a **`.gzip`** extension (not `.gz`) so servers don't force `Content-Encoding` — we inflate them ourselves.

Styling is Tailwind v4 + daisyUI v5, with a light/dark theme toggle.

## The backend (`runtime/`)

A tiny, framework-free Node.js server in **TypeScript** — ESM, run directly via native type stripping (`--experimental-strip-types`, no build step), typechecked with **TypeScript 7**.

- **serves app + API on one origin.** In prod the same process serves the built frontend (`frontend/dist`) for every non-`/api` GET plus the `/api/*` routes on one port (`PORT`/`BIND_HOST` configurable; prod binds `0.0.0.0:80` behind Cloudflare for TLS). The static bundle is served without auth.
- **`/api/ws` — the WebSocket exchange.** A dumb meeting point: each client joins a **room** chosen by the **token** it presents on connect — the token *is* the room key, there's no server-side registry. Same-room clients get join/leave presence and DM each other by a unique auto-assigned name; different rooms are mutually invisible; **a connection with no token is refused**; a room is freed when its last client leaves. The token rides in the `Sec-WebSocket-Protocol` header (`new WebSocket(url, [token])`), an `x-ws-channel` header, or `?channel=`.
- **tasks, scheduler & services** — the automation layer, split by lifecycle: **tasks** are finite (run to completion via the executor; the scheduler fires them on a cadence), **services** are long-running processes the service manager supervises. Route recurring work through these, not a system cron / `nohup`.
- **legacy node-store + auth (paused)** — the old multi-user backend: typed-node CRUD (`/api/nodes*`), a Postgres store (`runtime/store/pg.ts`), and email/Google sessions (`runtime/auth.ts`). Still compiled in, but prod pg is deleted and the frontend doesn't call it — don't build on it without reviving Postgres first.

## MCP servers (`mcp-servers/`)

Standalone Model Context Protocol servers for an AI assistant's external I/O — **telegram** (read/search a TG account over MTProto), **gmail**, **gcal** (read-only), **digitalocean** (manage droplets). Each has its own `README.md` + `.env.example`; registered in [`.mcp.json`](.mcp.json).

> **Secrets** live only in git-ignored `.env` files (plus TG session strings / Google service-account keys) — never committed. The `.env.example` files are placeholders.

## Layout

```
ocraft/
  frontend/           # the app (Vite + Vue 3 + Tailwind/daisyUI)
    docs/             #   knowledge base — *.html / *.md, cross-linked by /doc/<name>
    scripts/          #   runnable experiments — *.vue / *.ts / *.jsx (Vue / vanilla / Solid)
    public/bins/      #   binary assets, served as-is (manifest auto-generated by a Vite plugin)
    src/              #   App.vue (router + sidebar) + AssetView.vue (bin viewer)
    vite.config.ts    #   dev /__save-doc middleware + bins-manifest generator
  runtime/            # Node/TS backend — api.ts (serves app + /api) + wsServer.ts (/api/ws rooms)
                      #   + cli.ts + tasks/ + services/ + scheduler + store/ (legacy pg) + auth.ts
  mcp-servers/        # Telegram / Gmail / GCal / DigitalOcean MCP servers
  plans/              # longer-form design notes, roadmap, rejected/out-of-scope
  CLAUDE.md           # pointer to this README (working rules live below)
```

## Quick start

Requirements: Node 22.18+ / 23.6+ (native type stripping is on by default; the npm scripts pass `--experimental-strip-types` regardless), and a `.env` at the repo root.

```bash
npm install                        # root deps (backend, tasks, MCP SDK, prettier, TS)
npm --prefix frontend install      # frontend deps

# dev
npm --prefix frontend run dev      # Vite on :5173, proxies /api → :3001
npm run cli -- service start api   # (optional) backend on :3001 — needed for /api/ws + /api/claude

# build + prod
npm --prefix frontend run build    # → frontend/dist (static; docs bundled as lazy chunks)
node --experimental-strip-types runtime/api.ts   # one process serves dist + /api
```

Typecheck: `npm run typecheck` (runtime `tsc` + frontend `vue-tsc`). Format: `npm run format` (Prettier; the frontend has its own `npm run format` scoped to docs/src).

**Editing docs.** In dev, *edit* on any doc opens its raw source (HTML or Markdown); *save* POSTs to a `/__save-doc` Vite middleware that writes `frontend/docs/<name>.<ext>` (name confined to that folder, `apply: 'serve'` so it's dev-only). The deployed build has no such endpoint and stays read-only.

**Adding a bin.** Drop any file into `frontend/public/bins/` — it's listed automatically (type inferred from extension), no manifest edit. To shrink audio into a tiny lo-fi preview like the sample opus (~12 kbps stereo Ogg/Opus), transcode with:

```bash
ffmpeg -i input.mp3 -c:a libopus -b:a 12k output.opus
```

## Working in this repo

Working rules — follow them when editing here. Everything is **TypeScript** now (ESM; the backend runs via native type stripping, the frontend via Vite):

- **TypeScript `.ts` / `.vue`, never `.mjs`.** Every package is ESM (`"type": "module"`). The backend + tooling are `.ts` (no build step — type stripping); the frontend is `.vue`/`.ts` (built by Vite).
- **Develop on `main` — no feature branches.** Build features directly on `main`; don't `git checkout -b`. (Overrides the generic "branch before committing on the default branch" default for this repo.)
- **No single-letter names** except `i`/`j`/`k` as numeric loop counters. Every binding — including `.map`/`.filter`/`.find` args and regex matches — gets a name that says what it *is*.
- **No boolean flag parameters.** `fn(…, true)` is opaque — split into two intention-named functions (`editRich()` / `editSource()`) or a named mode, not `enterEdit(true)`.
- **Simplest condition that reads plainly — don't over-guard.** Destructure up front, then test the fields (`const { width, height } = obj ?? {}; if (!width || !height) …`). Prefer `!value` / `value < n` / `!list.length` over negated comparisons. Guard the failure that can *actually* occur (missing / zero / empty), not impossible inputs; keep thrown messages short. If you deviate for a real reason, say why in one line.
- **No chained ternaries** — one flat `?:` max, and only for a trivial value pick.
- **No unsolicited comments in doc bodies** — content only, no explanatory headers unless asked; pull the current body before patching it.
- **Frontend UI = Tailwind v4 + daisyUI v5 classes.** Action buttons use daisyUI `btn` classes (`btn btn-sm`, `btn-primary`, `btn-ghost`); no hand-rolled button styling, and no naive-ui (that was the old, retired editor).
- **Legacy pg store (only if you revive it):** never `DELETE` from `users`/`accounts` — soft-delete only (they anchor FK identity); "show / list the rows" is one read-only `SELECT … ORDER BY … LIMIT`, shown plainly — never an `UPDATE` on a show request.
- **Automate through ocraft's own runtime** — recurring work is a scheduler **task** (`runtime/tasks/<name>.ts` wired into `runtime/scheduler.ts`), a long-running process is a **service** (`runtime/services/`), a one-off is `npm run cli -- run <name>`. Not a system cron line, `nohup`, or a hand-rolled systemd unit — so it stays observable, versioned, and consistent.

## Direction

ocraft is a **local-first personal knowledge + scripts workspace**: docs are the durable, link-organized memory; scripts are runnable tools beside them; bins hold data. The runtime supplies the WS exchange, automation (tasks/scheduler), and MCP I/O; an assistant supplies the language/judgment step. The multi-user node-store is a paused lineage that may revive. Longer-form notes live in `plans/`.

## License

[MIT](LICENSE) © 2026 Nick Aliferov.

## Roadmap · Rejected / out-of-scope

The roadmap (a parking lot + recently-shipped log) and the cut/parked ideas (with the *why* for each — check it before proposing features) live in **[plans/](plans/)** (`roadmap.txt`, `rejected-out-of-scope.txt`).
