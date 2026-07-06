# ocraft

A personal **node OS**: one addressable tree where a node can be **anything from a note to a running program**. Everything is a node (`/node/:id`) — `html` nodes hold notes/data, `script` nodes are programs that call each other (and can render — a canvas "collage" is just a script), `category` nodes are folders — and the visual editor, the scheduler, and the MCP servers are all just **clients of one node store**. The decisive part, and the real difference from a notes app: *data and behavior live in the same tree* — a page can also run.

Built framework-free on plain Node.js in **TypeScript** (ESM, run via Node's native type stripping — no build step), with a Vue 3 editor on top. A single-user local environment — and the substrate for a longer-term personal life-management system (see [Direction](#direction)).

> **Where it honestly stands:** ocraft is **open in its data plane** — any node, any `type`, created live — but **closed in its behavior plane**: the node *types* are a fixed set of built-in handlers compiled into the app, so adding a genuinely new type still means a source edit, not an in-app action. Making a handler *itself a node* — so you can craft new types from inside — is the keystone item on the [Roadmap](#roadmap).

## The idea — a filesystem of typed nodes

Everything in ocraft is a **node**. On disk a node is a small folder, `data/nodes/<id>/`, holding:

- **metadata** in `state.json` (`name`, `type`, `parentId`, …), and
- an optional **body** sidecar — the "file contents" — resolved by type: `script.js` for a `script` node, `content.html` for an `html` node. Bodies are kept out of the node-list payload and fetched on open.

Four properties make this a small OS-like substrate rather than just a document store:

- **It nests like a filesystem.** Each node points to its parent via `parentId`; `category` nodes are folders. The editor gives you the whole tree: create, rename, delete (with an undo pool), and drag-to-reparent (cycle-guarded).
- **Types are handlers** — a node's `type` decides how it's interpreted and rendered, like a file association:

  | type | what it's for | body |
  |------|---------------|------|
  | `html` | documents / notes — the knowledge base | `content.html` |
  | `script` | a **program** — JavaScript, run on demand (visual/creative things — a canvas "collage", etc. — are just scripts) | `script.js` |
  | `category` | a folder that just holds children | — |

- **Nodes are addressable.** Each node has a stable numeric id and is reachable at `/node/:id`. Notes link to each other by `/node/:id`; scripts call each other by id. The id is the address; `name` is only a label.
- **Data and code share one tree.** A folder can hold a note next to a runnable script next to a canvas "app" — no separate "files" vs "programs" worlds.

```
notes/                 (category — a folder)
  daily/               (category)
    2026-06-17         (html — a note)
  tech-ideas           (html — links to → /node/100)
scripts/
  websocket-tester     (script — a program with its own UI)
  collage              (script — renders + animates SVG clipart on a canvas)
```

*(Shape is real; names are illustrative.)*

## Running nodes

A `script` node is a module: `export default async (x) => { … }`. When you Run it, it executes — in the browser, via blob import — and is handed a small **context `x`**, effectively the node's syscalls:

- **`x.x(id, args)`** — call another node by its id and get its result back. This is composition: programs built from programs. Re-entry is caught as a cycle, not infinite recursion.
- **`x.ui`** — mount real DOM controls (inputs, buttons, a canvas, a live log) above the editor, so a script node can be a little **app** (the WebSocket tester and the `collage` are ones).
- **`x.args`, `x.log`** — invocation arguments and labelled logging.

> **Scope, honestly:** node scripts run in the **browser** today, with no sandbox and no resource limits — composition and a UI surface exist; isolation does not. A headless runner (so the scheduler can execute nodes) and sandboxed, resource-capped execution are on the [Roadmap](#roadmap), not built. The `x` context is kept deliberately small so it can be re-implemented backend-side later.

## The system around the nodes

Four surfaces, one node store. They're independent; the editor reaches the store over `/api/*` (HTTP, port 3001), while runtime tasks can also touch the node files directly:

- **Node store + API** (`runtime/api.js` + `data/`) — the source of truth: a tiny, framework-free HTTP server doing CRUD on the node folders. Everything else is a client of it.
- **Visual editor** (`frontend/`) — *one* client: a Vue 3 tree browser plus a per-type editor/preview (a code editor for scripts, rich text for html), with a node-aware **command terminal** (`Terminal.vue`) docked full-width along the bottom. The app is literally a node router — just `/` and `/node/:id`.
- **Tasks, scheduler & services** (`runtime/cli.js` + `runtime/`) — the automation layer, split by lifecycle: **tasks** are finite (run to completion via the executor; the scheduler fires them on a cadence), **services** are long-running processes the service manager supervises (start/stop/restart/status/logs). A task *must terminate*; a service *stays up*.
- **MCP servers** (`mcp-servers/`) — external I/O for an AI assistant: Telegram, Gmail, Google Calendar, DigitalOcean. Registered in `.mcp.json`, unrelated to the scheduler.

### Layout

```
ocraft/
  data/             # the node store — nodes/ (each a folder), assets/, concept-db.json (source of truth)
  runtime/          # API server (api.js) + WebSocket hub (wsServer.js, /ws) + CLI entrypoint (cli.js) + automation engine — runners (AI), task executor/scheduler, service supervisor, tasks/, services/, state/
  frontend/         # Vue 3 visual editor — one client of the node store
  mcp-servers/      # Standalone MCP servers
    telegram-mcp/   #   read/search a Telegram account (GramJS / MTProto)
    gmail-mcp/      #   read/search Gmail
    gcal-mcp/       #   read Google Calendar (service account, read-only)
    digitalocean-mcp/ # manage DigitalOcean droplets / infra
  .claude/skills/   # Reusable agent skills (daily-report, youtube-transcribe, …)
  plans/            # Longer-form design notes
  CLAUDE.md         # Guidance for AI coding agents (roadmap lives in plans/roadmap.txt)
```

## Quick start

### Requirements

- Node.js 22.6+ (native ESM + `node:` built-ins + `--experimental-strip-types` for the TS runtime; the npm scripts pass the flag, so Node 22.18+ / 23.6+ — where type stripping is on by default — can also run the `.ts` entrypoints directly)
- A `.env` file at the repo root (loaded via `dotenv`)

### Setup

```bash
npm install                 # root deps — API server, tasks (sharp), MCP SDK, lint
cd frontend && npm install  # editor deps
```

### Run the editor

```bash
node runtime/cli.js service start api   # node API server (runtime/api.js) on :3001
cd frontend && npm run dev          # Vite dev server; proxies /api to :3001
npm run build
```

The node API server (`runtime/api.js`) reads/writes node JSON under `data/nodes/` and can also run standalone with `node runtime/api.js`. It runs as a managed service (`api`); Vite only proxies `/api` to it.

**In production there's no Vite.** Build the editor once (`cd frontend && npm run build` → `frontend/dist/`), and the same `api` process serves that static bundle for every non-`/api` request — hashed assets cached immutably, an `index.html` history-fallback so `/node/:id` resolves on refresh — alongside the `/api` routes on one port. So prod is a **single process** serving app + API from **one origin** (which the `SameSite=Strict` session cookie requires); front it with Cloudflare/Caddy for HTTPS and set `COOKIE_SECURE=true`. The static bundle is served *without* auth (it holds no secrets — nothing sensitive is baked into the build, and the login page must load first); only `/api/*` is gated. The CI deploy (`.github/workflows/ci.yml`) runs `npm run build` in `frontend/` on the box as part of each deploy.

### Multi-user — Postgres + Google sign-in

The store moved from local files to **Postgres**, with sign-in by **email + password** (the default —
Node `scrypt`, no deps) or **Google** (optional, shown only when configured). Sign-in *is* sign-up:
the first time creates your account. The node store is swappable — set `DATABASE_URL` and the api
uses Postgres, unset it and it falls back to the local file store (`runtime/store/`).

**1 · Postgres (local dev).** Quickest is Docker — local dev only; **prod uses a native
`apt install postgresql`** on the box, not Docker:

```bash
docker run -d --name ocraft-pg -e POSTGRES_PASSWORD=ocraft -e POSTGRES_DB=ocraft -p 5432:5432 postgres:16
```

Then add `DATABASE_URL` to `.env`, create the schema, and (optionally) import your existing file tree:

```bash
# .env
DATABASE_URL=postgresql://postgres:ocraft@localhost:5432/ocraft

node runtime/cli.js migrate        # apply runtime/store/migrations/*.sql
node runtime/cli.js import-nodes   # one-off: copy data/nodes/* into pg under your account
```

**2 · Google sign-in (optional).** Set the two `GOOGLE_*` vars and the "Sign in with Google" button
appears — same flow locally as in prod, just a localhost redirect URI:

- **Google Cloud Console** → a project → *APIs & Services → OAuth consent screen*: **External**,
  app name + your email, and add yourself as a **Test user** (so you can sign in while it's in testing).
- *Credentials → Create credentials → OAuth client ID → Web application* → **Authorized redirect URIs**:
  - local: `http://localhost:5173/api/auth/google/callback`  (the Vite dev server proxies `/api`)
  - prod:  `https://<your-domain>/api/auth/google/callback`
- Put the client id/secret in `.env`:

  ```
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  ```

- Open the app → **Sign in with Google** → consent → you're in. A `users` + `accounts` + `sessions`
  row is created and a session cookie keeps you logged in. No passwords are stored, and Google gates
  bots/spam, so no reCAPTCHA is needed.

Prod (`NODE_ENV=production`) is **Google-only** — the email routes are disabled there and it fails
closed without Google. The old single-user `API_TOKEN` is gone.

## Reference

### Tasks vs services

The automation layer splits cleanly by **lifecycle**:

- A **task** is **finite** — it runs to completion and exits. It lives in `runtime/tasks/<name>.js` (exports `run(ctx)`), is run by the executor (which writes a record to `runtime/state/taskExecutions/` and enforces a timeout — *a task must terminate*), and the **scheduler** (`runtime/scheduler.js`) fires it on an interval / cron-like schedule via `jobs[]`.
- A **service** is **long-running** — it stays up until stopped. It lives in `runtime/services/<id>.js` (a `{ cmd, args, cwd, env }` config) and is supervised by the service manager; runtime state + logs live in `runtime/state/services/`.

```bash
# tasks (finite)
node runtime/cli.js run <task-name> [args...]    # run one task to completion
node runtime/cli.js start-scheduler              # run all due tasks once (call from cron)
node runtime/cli.js scheduler-loop               # run the scheduler as a daemon (the `scheduler` service)
node runtime/cli.js list-executions              # print recent task executions

# services (long-running)
node runtime/cli.js service list                 # configured services + status
node runtime/cli.js service <start|stop|restart|status> <id>
node runtime/cli.js service logs <id> [lines]    # tail the service log
node runtime/cli.js service clear-logs <id>
```

Each task receives a `ctx`: `args`, `env`, `log(msg)`, persistent `state.load()/save()`, and `time.now()` (and may export `timeoutMs` to widen its budget). Existing tasks: `telegram-reminder`, `telegram-poll`, `img-optimize[-dir]`, `do-droplet-up` / `do-droplet-down`, `deploy`, `every-hour`, `test`. Configured services: `api` (the node API server), `frontend` (Vite), `scheduler` (the daemon), `ticker`.

### MCP servers

Standalone Model Context Protocol servers in `mcp-servers/`, registered in [`.mcp.json`](.mcp.json). Each has its own `README.md` and `.env.example`; copy that to `.env` and fill in credentials.

- **telegram-mcp** — read/search a Telegram user account over MTProto (GramJS). Run `npm run login` once to create a session string.
- **gmail-mcp** — read/search a Gmail account.
- **gcal-mcp** — read-only Google Calendar access via a Google Cloud **service account**. Share the target calendar with the service account email, then point `GOOGLE_APPLICATION_CREDENTIALS` at the JSON key.
- **digitalocean-mcp** — manage DigitalOcean droplets and infrastructure via the DO API (token in `.env`).

> **Secrets:** `.env` files, Telegram session strings, and the Google service-account JSON key are git-ignored and must never be committed. The `.env.example` files are placeholders only. The AI run path (`POST /api/runs` with `kind: 'ai'`, and the terminal's `ai` / `minimal-txt` commands) runs the Claude Agent SDK with **bypassed permissions** — full Read/Write/Edit/Bash, cwd = repo root — so it can edit files and run shell commands on this machine. Because of that the `'ai'` runner is **disabled by default**: it's left unregistered in `runtime/api.js`, so `POST /api/runs {kind:'ai'}` returns *"unknown kind"* (the intended refusal). Re-enable it only behind an explicit, off-by-default env gate (`OCRAFT_ENABLE_AGENT`) and only on a sandboxed host (see the Roadmap's *sandboxed execution*); it stays **single-user / trusted only** and must never face a network.
>
> **Auth:** every `/api` request needs a session — sign in at **`/login`** with **email + password** (hashed with Node `scrypt`, no deps) or **Google** (when `GOOGLE_CLIENT_ID/SECRET` are set). The session id rides in an **HttpOnly, `SameSite=Lax`** cookie (JS never holds anything secret); sessions are stored in Postgres. In prod set `COOKIE_SECURE=true` (implied by `NODE_ENV=production`), which also makes prod **Google-only** and fails closed without Google. See `runtime/auth.js`. (The old `API_TOKEN` is gone.)

## Working in this repo

Working rules for editing this repo — conventions, coding rules, DB invariants, and agent behaviour. Follow these when writing or editing code here (it's `.js` everywhere — every package is ESM):

- **Never use the `.mjs` extension.** Every package here is ESM already (`"type": "module"` in package.json), so plain `.js` is ESM. Use `.js` for all JavaScript files — scripts, helpers, one-offs, everything.
- **Develop on `main` — don't create feature branches.** Build features directly on `main`; do not `git checkout -b` a feature/topic branch for development. (This overrides the generic "branch before committing on the default branch" default for this repo.)
- **No single-letter variable names — except `i`/`j`/`k` as numeric loop counters.** Use a descriptive name for every binding — including callback parameters, `.map`/`.filter`/`.find` args, and regex matches. Write `const droplet = await getDroplet(id)`, not `const d = …`; `images.filter((image) => …)`, not `(i) => …`. The name should say what the value *is*. The one allowed exception: a classic numeric loop index may be `i` (nested loops: `j`, `k`), e.g. `for (let i = 0; i < count; i++)` — ESLint's `id-length` exempts `i`/`j`/`k`. Still prefer a descriptive name when iterating a *named* collection: `for (const droplet of droplets)`, not `for (const d of droplets)`.
- **No boolean flag parameters.** A `fn(…, true)` call site is opaque — the reader can't tell what `true` selects. When a flag would switch between two behaviours, prefer the most minimal split that removes the boolean: usually **two intention-named functions**, otherwise a named mode/strategy (e.g. a string `'rich'`/`'source'`, a passed-in handler, or a small factory). Write `editRich()` / `editSource()`, not `enterEdit(true)` / `enterEdit(false)`. This applies to new code and to flags you touch while editing.
- **Write the simplest condition that reads plainly — don't over-guard.** Destructure up front, then test the fields: `const { width, height } = obj ?? {}; if (!width || !height) …`, not `if (!obj || !(obj.width > 0) || !(obj.height > 0))`. Prefer `!value`, `value < n`, or `!list.length` over negated comparisons like `!(a > b)`. Guard the failure that can *actually* occur (missing / zero / empty), not theoretical inputs that can't (a negative or `NaN` dimension that nothing produces). Keep thrown messages short — name the thing and the bad value, skip the lecture. If you deviate from the obvious form for a real reason (e.g. `!width` to also catch `undefined`), say why in a one-line comment rather than silently complicating it.
- **Use the shared naive-ui `<n-button size="small">` for action buttons — don't hand-roll a plain `<button>`.** Save / Run / Edit / Refresh / Send-style actions in node editors and views go through the one button component (see `NodeItem.vue`'s Save, `Script.vue`'s Run, `Html.vue`'s Edit/Add link) so every action button looks the same. A plain styled `<button>` is reserved for compact **chrome / transport / icon** controls that intentionally have their own look — the tree's rename/delete (`NodeTree.vue`), the sidebar's `+ node` (`App.vue`), the html editor's rich-text toolbar (`Html.vue`'s `.tool` buttons). Default a new button to `n-button`; only drop to a plain element for those icon/chrome cases, and say why.
- **Never `DELETE` rows in `users` or `accounts` — deactivate, never delete.** Both anchor identity: `users` is referenced by `nodes` / `accounts` / `sessions` (FK `user_id`), and `accounts` maps each provider login (google / email) to its user. A hard delete cascade-wipes or orphans that data and leaves id gaps — it breaks DB consistency. To remove someone, soft-delete (a `deleted_at` / `status` flag) and keep the row. Don't spin up throwaway placeholder users to delete later either — import/reassign onto a real user. Holds in every environment, prod and local.
- **"Show / list the rows" is read-only — just show them.** When asked to display rows from a DB table, run **one plain `SELECT … ORDER BY … LIMIT …`** and present the result — nothing else. Don't join in extra tables, add computed/analysis columns, or editorialize; **never `UPDATE` or "fix" data on a show request**. For `bytea`/large columns show `octet_length(…)` instead of dumping the blob (offer the raw bytes if asked); use `psql -x` for wide rows. Put the rows in the reply so they're actually visible — don't make the user re-ask.
- **Automate through ocraft's own runtime instruments — don't bolt on a parallel mechanism.** Recurring / scheduled work (backups, polls, cleanups) is a **task** (`runtime/tasks/<name>.js`) wired into the **scheduler** (`runtime/scheduler.js` `jobs[]`) — *not* a system `cron` line calling a standalone shell script. A long-running process is a **service** under `serviceManager` (`runtime/services/`), not a hand-rolled `nohup`/systemd unit. A one-off is a task run via `node runtime/cli.js run <name>`, not an ad-hoc script. A task reuses the executor's scheduling, execution records, `ctx.log`, persistent `ctx.state`, and timeout — a foreign cron/shell reinvents all of that and forks the system into two drifting worlds. ocraft *is* the automation substrate; route automation through it so it stays observable, versioned, and consistent. The one exception is genuine pre-app **bootstrap** that must run before the runtime exists (e.g. `scripts/deploy-cutover.sh`, which CI runs on the box to ship + pre-flight the app itself).

Longer-form design notes are in `plans/` — including the **monetization & marketing lens** (`plans/monetization-marketing-lens.txt`), a habit to apply whenever you propose or build a feature.

## Direction

The node store is the substrate; the long-term goal is a **personal life-management system** built on it: the node tree is the durable memory (notes, plans, logs), the scheduler decides *when/what*, the MCP servers are the I/O channels, and an assistant supplies the language/judgment step. This is a direction, not a spec — see the [Roadmap](#roadmap) below (a parking lot), `plans/` for longer-form design notes (TypeScript/lint adoption, YouTube content, the multi-user pivot), and the **UI-UX & usage research** note (in the `analytics` category) for competitive/positioning research.

## License

[MIT](LICENSE) © 2026 Nick Aliferov.

## Roadmap

The roadmap — a parking lot of things to explore, learn, or build later, plus the recently-shipped log — lives in **[plans/roadmap.txt](plans/roadmap.txt)**.

## Rejected / out-of-scope

Cut and parked ideas (with the *why* for each) live in **[plans/rejected-out-of-scope.txt](plans/rejected-out-of-scope.txt)** — check it before proposing features so they don't get resurfaced.
