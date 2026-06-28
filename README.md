# ocraft

A personal **node OS**: one addressable tree where a node can be **anything from a note to a running program**. Everything is a node (`/node/:id`) — `html` nodes hold notes/data, `script` nodes are programs that call each other (and can render — a canvas "collage" is just a script), `category` nodes are folders — and the visual editor, the scheduler, and the MCP servers are all just **clients of one node store**. The decisive part, and the real difference from a notes app: *data and behavior live in the same tree* — a page can also run.

Built framework-free on plain Node.js (ESM), with a Vue 3 editor on top. A single-user local environment — and the substrate for a longer-term personal life-management system (see [Direction](#direction)).

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
  CLAUDE.md         # Guidance for AI coding agents (roadmap lives at the bottom of this README)
```

## Quick start

### Requirements

- Node.js 18+ (native ESM + `node:` built-ins)
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

Coding conventions, DB invariants, and agent working-rules live in **[AGENTS.md](AGENTS.md)**. Longer-form design notes are in `plans/` — including the **monetization & marketing lens** (`plans/monetization-marketing-lens.txt`), a habit to apply whenever you propose or build a feature.

## Direction

The node store is the substrate; the long-term goal is a **personal life-management system** built on it: the node tree is the durable memory (notes, plans, logs), the scheduler decides *when/what*, the MCP servers are the I/O channels, and an assistant supplies the language/judgment step. This is a direction, not a spec — see the [Roadmap](#roadmap) below (a parking lot), `plans/` for longer-form design notes (TypeScript/lint adoption, YouTube content, the multi-user pivot), and the **UI-UX & usage research** note (in the `analytics` category) for competitive/positioning research.

## License

[MIT](LICENSE) © 2026 Nick Aliferov.

## Roadmap

Scratchpad for things to explore, learn, or build later. Not a spec — just a parking lot so nothing gets lost. Move items into `CLAUDE.md` only once they become concrete, code-relevant work.

- **Self-extending node types — make a handler itself a node (the keystone).** ocraft's identity claim is *"you can create any node type you want."* Graded honestly against the code today, that splits three ways: (1) creating any node **data** — TRUE (the store is type-agnostic; `POST /api/nodes` accepts any `type` string, the tree is computed from `parentId`, `x.x(id)` composes regardless of type, and a running script can even raw-`fetch` the API to manufacture nodes at runtime); (2) a note that **is a program** — TRUE and the real differentiator (`x.x` compose, `x.ui` mount UI). (3) **"You can create any node *type* — THAT is what ocraft is" — FALSE today, and this is the load-bearing claim.** A type only becomes real once it has a **handler**, and handlers are three hardcoded compile-time Vue imports (`NodeItem.vue:28-32` — `html` / `script` / `category`); an unknown type no longer silently falls back to a renderer but draws an explicit *"no handler for type X"* card (`NodeItem.vue:110-113`), plus a small per-type `NODE_BODY` dict server-side. You cannot register a handler from inside the running app — Vue resolves components at build time, and the server has no hot-reload. So ocraft is **open in its data plane but closed/build-time in its behavior plane**: `html`/`script` aren't "mere features," they're two of exactly three privileged, hand-built handlers, and that set is closed without a source edit + rebuild.

  The elegant part: the runtime **already** dynamic-imports from the store — for script *bodies* (`useNodeScripts.js` blob-imports `script.js` from `/api/nodes/:id/body`) — just never for *views*. Closing the gap, in leverage order: (1) **kill the silent fallback** → render an explicit *"no handler for type X"* card — **shipped** (`NodeItem.vue:110-113`); the cheap follow-up is to turn that card into an authoring affordance (*"create one?"*); (2) **make the handler a node** — move the `type→renderer` map out of the hardcoded `NODE_TYPES` into the store and load handlers at runtime by reusing the existing blob-import mechanism (a render-function/component module fetched from a node body, mounted via `defineAsyncComponent`; avoid in-browser SFC compilation); (3) give the running `x` a first-class, cycle-guarded **graph-mutation** affordance (`x.create`/`x.save`/`x.tree`) instead of incidental raw fetch; (4) make `NODE_BODY` **data-driven** so a new bodied type needs no server restart; (5) pair this with a **sandbox** (Worker/iframe, capability-scoped) — loading a handler from a node body means executing arbitrary code from data, and scripts already run unsandboxed. Steps 1–2 are the whole ballgame: ship them and *"create any node type"* stops being the name's aspiration and becomes an accurate description of what ocraft is.

- **Multi-user pivot — Postgres + Google OAuth + per-user isolation.** ocraft began single-user/local (file-backed node store, one shared token). The committed next-big-step is multi-tenant: a storage abstraction (a `nodeStore` interface) behind the current file store, then a Postgres backend (`users` / `nodes` / `node_bodies` / `sessions`, with `nodes.data` as jsonb), migrate the existing file nodes in as **owned by you**, then Google OAuth login and **per-user isolation** — every node belongs to exactly one user; sharing is a later additive feature. The load-bearing blocker isn't the DB, it's **execution isolation**: node *scripts* are already safe (each runs in its author's own browser sandbox, scoped by per-user auth), but the **AI runner** needs a per-user Anthropic key/login and node-scoped tools (no Bash/fs) before it can go multi-tenant — which is exactly why it's disabled by default today. Plan: `plans/multi-user-postgres-oauth-plan.txt`. *Monetization:* this is the substrate a hosted/paid tier sits on (per-seat or metered AI), but it's enabling infra — don't gate the open-source core behind it. *Marketing:* not itself demoable; it unlocks the "share a node/subtree" features that are.

- **Flutter for cloud-driven mobile control** — build a Flutter mobile app that can be controlled / driven from "cloud code" (e.g. trigger actions, push state, or receive commands from a backend service). Explore how this could connect to the existing ocraft runtime + scheduler.

- **Autonomous dev loop** — close the loop on AI-driven development of ocraft: the `ocraft-dev-plan` skill writes a sequenced weekly plan (`dev-plans/<date>-week.md`), then a dedicated **`dev-task` entry** executes *one* task per run on a branch (Agent SDK), gates on the task's acceptance check, and opens a PR for human review — never `main`, never auto-merge. Execution must be the `dev-task` entry, **not** the bypassPermissions `'ai'` runner (`POST /api/runs {kind:'ai'}`, now disabled by default) — that path must never do git/PR even when enabled. Visual changes can be self-verified via the claude-in-chrome MCP (screenshots + DOM of the running editor) — the "eyes" already exist. Prereqs: `gh` installed + authenticated (`origin` is already set). Honest caveat: ocraft has no real test/behavior gate yet (only `node --check` + `npm run build` + screenshots), so PRs genuinely need human review until one exists.

- **Node test harness on the frontend (acceptance checks per node)** — the **literal blocker** for the autonomous dev loop above: today there is *no behavior gate*, only `node --check` + `npm run build` + a screenshot, so an AI PR is "edits hopefully," not "ships verifiably." A node script already *is* a runnable program in the browser (`runNodeCode` blob-imports it and hands it the `x` context — `useNodeScripts.js`), so a check is just another script that runs the node-under-test and asserts on its result. Make it a node: a **`test` node type** (or a `tests` body alongside a script) whose default export receives an `x.expect`/`x.assert` surface, calls `x.x("<target-id>")`, and passes/fails. A **harness panel** runs all checks for a node (or the whole store) in the browser and renders a green/red pass list — reusing `createScriptUi`'s log surface. Because checks are nodes, they're authored, versioned, and composed like everything else, and a future headless runner can execute the same `x`-context check with no `x.ui`. Open bits: where checks live (own type vs. paired body), the assertion surface (`x.expect(v).toBe(...)` vs. a thrown `x.assert`), **module mocking** (stub a dependency node's `x.x` return — already flagged under *Multi-project & tooling*), and how the dev-task entry shells a single node's checks headlessly to gate a PR. Plan: `plans/node-test-harness-plan.txt`.

- **`stream` node type (removed — reimplement later)** — the `stream` node type was removed (frontend `Stream.vue` preview, its type registration, and the `sample stream` node) to keep the type list to things that actually work. When revisiting, it needs two halves: (1) a real **frontend** editor/preview — the old one was a placeholder black canvas using the shared `Stage` chrome; and (2) a **backend run model** — today nodes are just stored JSON with no run semantics, so define how a stream node is configured and actually *executed* on the backend side.

- **`binary` node type — image / video / audio bodies.** A node whose body is **raw bytes**, not text: one polymorphic `binary` type that branches on a stored **MIME** (`image/*` → `<img>`, `video/*` → `<video>`, `audio/*` → `<audio>`) rather than three separate `image`/`video`/`audio` types — so "drop a file into the tree, it becomes an addressable node" stays one handler. This would be the first **non-text body**, and that's where the real work is: `NODE_BODY` (`runtime/api.js:141`) already carries a per-type `{ file, contentType }`, but the body read/write path is hardcoded UTF-8 (`fs.readFile(…, 'utf-8')` on GET, `readText(req)` on POST), so binary needs a **Buffer** read/write path that serves raw bytes under the node's own MIME — essentially what the existing `/api/assets/` handler (`runtime/api.js:73-96`) already does for the clipart dir, reused for a node body. A fixed per-type filename also doesn't fit variable media (`png`/`mp4`/`mp3`), so a binary node must store its `mime` (+ original ext/filename) in `state.json` and resolve the body spec from there — a concrete forcing case for the keystone's *"make `NODE_BODY` data-driven"* sub-item. Frontend: register `binary` in `NODE_TYPES` (`NodeItem.vue:28-32`) with a MIME-branching preview (the explicit *"no handler for type X"* card already exists — `NodeItem.vue:110-113` — so an unregistered `binary` degrades gracefully, not into a broken view). The payoff for *"data and behavior share one tree"*: a binary node is callable — `x.x(id)` returns a blob URL / bytes — so a `script` can pull in a sprite, sample, or clip **by node id** instead of an asset path, folding the `/api/assets/` pipeline into the node tree. It's also the storage substrate the **MediaRecorder capture** idea (under *New node types*) and the **pixel-art SVG** assets would write into. Honest caveats: node bodies are git-tracked, so video/audio will bloat the repo — needs a size cap, a git-ignore for large binary bodies, or LFS; `<video>` scrubbing wants **HTTP range requests**, which the body endpoint doesn't do today; and the overlap with the existing `/api/assets/` pipeline (supersede vs. coexist) is an open call. *Monetization:* no standalone angle — nobody pays to "store an image"; it's enabling infra. It *enables* the **paid asset/template packs** already on this roadmap (media-as-nodes is the format those ship as) and, only if ocraft ever goes hosted, a natural **storage + bandwidth metering** line — moot while single-user/local. Don't charge for it directly. *Marketing:* highly demoable — a ~20s clip: drag a sprite / loop / clip into the tree → it's now a node → a script pulls it in by `x.x(id)`. Hook: *"every file is just a node."* Pairs with the generative-art wedge and the MediaRecorder demo.

- **Mount the filesystem — an `fs` node tree rooted at Google Drive.** Make ocraft's "a filesystem of typed nodes" *literal* by **mounting a real directory as nodes** — a live view, not a copy. An `fs` *mount* node points at a root path — the **Google Drive Desktop local sync folder** (e.g. `~/Library/CloudStorage/GoogleDrive-…/My Drive`), so gdrive is "just a directory": **zero Drive API, local-first**, and edits sync to the cloud for free. Its children lazy-render the dir's files/subdirs as nodes, and each file opens by extension into an existing viewer (`.md`/`.html` → html editor, image → `<img>`, `.mp3` → audio, `.js` → a runnable script). **Mirror, don't own** is the load-bearing rule: files stay in gdrive (the source of truth); ocraft only layers on top — the better version of the `binary` node above (*mirrored* instead of *imported*, so no second copy / sync nightmare). This is the **producer's asset-management backbone** (samples / stems / clips / footage / projects as nodes where they already live), and the value over Finder is what ocraft *adds*: **notes attached to a file** (kept in ocraft's store, keyed by path, so you annotate a clip without touching it), **search across files *and* notes** in one tree, **automation over folders** (transcode/render/rename/publish tasks — `img-optimize` generalized), and **AI + `x.x` composition** over a folder of clips. Architecturally it's ocraft's first **mount** — an external namespace grafted into the otherwise id-addressed tree; fs nodes are **path**-addressed, so the store goes hybrid (ocraft-owned id-nodes + a path-mirrored fs subtree). gdrive is mount #1; the same pattern later mounts a git repo / S3 / a remote box (the *Distributed node OS / "an ip is just an object key"* item below, in miniature). **Security:** an fs endpoint reopens the arbitrary-read risk the auth pass just closed — confine every read/write to the configured root with the `path.resolve` + `startsWith(ROOT)` traversal guard already used for `/api/assets` and the dist server; never escape the mount. **MVP:** `OCRAFT_FS_ROOT` in `.env` → a guarded `GET /api/fs?path=…` (list + read/write bodies) → an `fs` mount node that lazy-renders children → extension-based viewers. Open calls: one `fs` mount node alongside ocraft's own nodes (recommended — keeps ocraft data separate, lets you mount more) vs. rooting the whole store under gdrive; and the **local sync folder** (recommended) vs. the **Drive API** (only for a headless box with no sync client — reuse the gcal/gmail service-account path). *Monetization:* no direct charge (enabling infra), but it's the feature that makes ocraft **sticky for media producers** — your whole asset library + notes + automation in one tree — the wedge a paid "producer" tier or automation/template packs sit on; a hosted version could meter storage/sync (moot while local). *Marketing:* very demoable — "mount my Drive of samples as a node tree, annotate a stem, run a transcode over a folder, all beside my project notes." Hook: *"your real files, as a node OS."* Pairs with the Ableton/video producer focus.

- **Media-flow hub — exchange audio/video streams, not just events.** Evolve the cloud WS exchange from event/data pub-sub into a **real-time media** hub: route + **mix** live audio/video between nodes, clients, and tools (WebRTC peer/SFU, or a media-server bridge). A node becomes a stream source/sink (mic, screen, a clip, an FX chain); a *mixer* node combines them — ocraft as the patchbay/router for live media, with Ableton/Hydra/Jitter as endpoints (the producer-focus + distributed-node-OS directions converging). Heavy and separate: real-time media (latency, codecs, SFU ops) is a different beast from the request/response node API — its own service, not the CRUD server. Park until the single-user media tooling is real. *Monetization:* a hosted media relay = metered bandwidth (moot while local); the draw is being the glue between your tools. *Marketing:* extremely demoable — live A/V routed + mixed through a node graph.

- **Script packages — npm-like publish/install for script nodes.** A `script` node is already a self-contained module (`export default (x) => …`, composed via `x.x`). Make scripts **shareable as versioned packages**: publish a script (or a subtree) as `name@version`, install it into another tree (and, post-multi-user, another user's), resolving deps by node reference. A small registry (a node type, or an external index). Turns "a note that is a program" into "a program you can ship + reuse" — the reuse layer the keystone (handler-as-a-node) unlocks. Open: identity/versioning (content-hash vs `name@semver`), where the registry lives, how `x.x` resolves a package dep vs a local id. *Monetization:* a registry of **paid script/automation packs** (a producer's transcode/render/publish recipes) — the Tailwind-UI move, in code form. *Marketing:* "install an ocraft automation like an npm package."

- **Node / script versioning (version-on-save)** — saving a node script overwrites it today. Instead, each save could write a new version (keep history, allow diff/rollback) rather than clobbering the previous one. (From the old Varcraft notes — "need fx versioning, i.e. a new save.")

- **Script code editor (CodeMirror 6)** — the script editor is a plain `<textarea>` today (`Script.vue:152`); the README's "a code editor for scripts" is aspirational. Swap in **CodeMirror 6** for line numbers, JS syntax highlighting, bracket matching, and auto-indent — tens of KB, no web-worker setup. (vs. **Monaco** — VS Code's editor, full IntelliSense but multi-MB with fiddly Vite worker config; overkill for a single-user local tool whose bundle is already ~1.5 MB. Ultra-minimal alt: `CodeJar + Prism`, but CM6 is the better long-term base.) The same component could later back the HTML source view and a custom **`yo`** language mode. Build order: highlighting + line numbers first, then the load-bearing follow-up — **autocomplete on the `x` API** (`x.x()`, `x.ui`, `x.auth`) via a CM6 completion source. *Monetization:* no standalone angle — table-stakes polish, not a paid feature; only matters as baseline if ocraft ever becomes a hosted "scriptable node OS." Don't charge for it. *Marketing:* highly demoable — a before/after clip (textarea → highlighted editor), but the killer artifact is `x`-API autocomplete, which shows off the "a note that *is* a program" differentiator far better than generic highlighting. Fits the YouTube content plan.

- **`yo` as a node scripting medium** — `yo` is a tiny async-first toy language (`@`-keyword syntax: `@a`/`@f` functions, `@w` await, `@r` return, `@l` print). It now lives as a **script node** (`yo-to-js`, under `scripts/`) that **transpiles to JS** rather than interpreting: the same lexer + parser feed a code generator (yo's `@a`/`@f`/`@w` map 1:1 onto JS `async` / plain-fn / `await`), and the browser runs the emitted JS — Compile shows the generated JS, Run executes it. (Replaces the old `experiments/js-engine` interpreter, which walked the AST and evaluated it.) Next: parameters + strings, then it could grow into an embeddable, sandboxed scripting medium for nodes (a safer alternative to raw-JS `script` nodes), or a symbolic medium for the generative-art experiments below.

- **Sandboxed execution with resource limits** — node/entry scripts currently run with full Node access. Run them in an isolated environment (container or VM) with disk / memory / CPU caps, so an artifact can't take down the host. Pairs with the `yo` sandbox idea above, and the DO droplet is a natural place to run isolated workers. (From the old Varcraft notes — the original vision already assumed containerised, resource-limited module execution.)

- **Process control / supervisor — extend coverage** — `runtime/serviceManager.js` supervises **services** (per-service config files in `runtime/services/`, reusing `withLock` + the `state/` store, with rotating logs). The `api` server, frontend, **scheduler** (now a `scheduler-loop` daemon), and ticker are all services under it. Remaining: bring the **MCP servers** under the same start/stop/restart/status/log unit — caveat: stdio MCP servers can only be supervised standalone unless moved to HTTP/SSE transport. Also still missing: real crash-restart / health — `autoRestart` is declared on a service config but not yet acted on.

- **Process-management UI + live resource monitoring** — `serviceManager.js` is backend-only; there's no way to start/stop/restart services or watch them from the editor. Add a frontend page that lists services with their status, tails their logs, and shows live RAM / CPU usage per service. (From the old Varcraft notes — "a page for managing app processes... and query RAM and CPU.")

- **Realtime hub — the local `/ws` WebSocket server.** **Shipped:** the api process hosts a WebSocket hub at **`/ws`** (`runtime/wsServer.js`, built on the `ws` package, attached to the same `http.Server`) — same origin as `/api`, gated by the same session auth, so there's no second service to deploy. JSON protocol: a client `subscribe`/`unsubscribe`/`publish`es on topics (no subscriptions = firehose), the server `publish`es events (node create / save / delete already broadcast on the `nodes` topic), and a ping/pong heartbeat drops dead sockets. This **replaces the old remote Deno relay** (`stream.x8.deno.net`), now deleted. The **`websocket-tester` script node** (id 11, under `scripts/`) and the **`ws-test`** CLI task both poke it. Next: have the **editor subscribe** for live tree/run updates (retiring the poll-based run UI), and let future clients — the Flutter/mobile idea — join the same hub; the "cloud" that lets cloud code drive a mobile app is then just this hub exposed through the front proxy (or a thin public relay in front of it).

- **Restore (or rethink) the deploy target — the DO droplet is gone.** Deploy is wired through GitHub Actions (`.github/workflows/ci.yml`, on push to `main`): it SSHes into `secrets.DEPLOY_HOST` (the DigitalOcean droplet), writes `.env`, `git pull`, `npm install`, then `node runtime/cli.js run deploy` (the `deploy` task = git pull under the scheduler lock). **It's currently broken** — the droplet behind `DEPLOY_HOST` was destroyed, so every push fails at the SSH step (`runtime/state/droplet.json` holds only a `{region, size}` spec, nothing live). The `do-droplet-up` entry (or the DigitalOcean MCP `do_create_droplet`) re-provisions a box end-to-end (create → ssh → install Node + git → clone repo), but re-running it alone won't restore deploy — gaps to close: (1) a fresh droplet gets a **new IP**, so `DEPLOY_HOST` would change each rebuild — wire a **reserved IP** (the DO MCP has the tools) to keep it stable; (2) **node-path mismatch** — `ci.yml` hardcodes an nvm path (`/root/.nvm/.../v25.8.2`) while `do-droplet-up` installs Node via NodeSource/apt (`/usr/bin/node`), so align one side; (3) **no scheduler provisioning** — `do-droplet-up` clones the repo but never starts the `scheduler` service (`node runtime/cli.js service start scheduler`) or writes a persistent `.env`, so scheduled tasks won't run. Bigger question first: **does an always-on DO droplet still earn its place** now that the realtime hub is the local `/ws` (no separate WS service to host) — keep a persistent box for the scheduler + a public `/ws` relay, or drop it entirely and go on-demand?

- **More MCP servers to build** — beyond telegram + gcal + gmail, the life-management loop still lacks _hands on its own machinery_ (its _memory organ_ is now the migrated notes-as-nodes, so that gap is closed):
  - **ocraft self-MCP** — expose the scheduler/nodes/serviceManager as tools (`list_jobs`, `run_task`, `service_status`, `tail_execution_log`, `search_nodes`, `create_node`) so Claude can _operate_ the system, not just edit its files. Now that the notes live as nodes, this is also the "remember" organ — searching/appending a note _is_ a node op, the durable home every other MCP's summaries need. The real driver is the headless side (the scheduler + a chat-node "brain"), which can't borrow an interactive Claude Code session's Read/Grep/Edit and so needs these as tools.
  - **Music** — _probably not worth a dedicated MCP._ For playback control the claude-in-chrome extension already drives the Spotify/Apple Music web player. An API MCP would only pay off for the data side (listening history, building playlists as data) — a weaker need. Park it; revisit if the history/logging use case becomes real.

- **HTTP/3 (QUIC) for the backend API server** — Node.js landed a native QUIC + HTTP/3 implementation in **v26.2.0** via the `node:quic` module — HTTP/3 over `nghttp3`, activated when the negotiated ALPN is `h3`. Still **experimental** (Stability 1.0) behind the `--experimental-quic` runtime flag. Idea: serve `runtime/api.js`'s `/api/*` over HTTP/3. Honest caveat: it's a **localhost dev server**, so HTTP/3's real wins (no head-of-line blocking + connection migration over lossy networks) don't apply here, and QUIC mandates TLS 1.3 — so it'd need certs + UDP where today it's plain HTTP. This is a **learning exercise**, not a perf need; the pragmatic production path is to terminate HTTP/3 at the edge (CDN / nginx 1.25+ with QUIC) and speak HTTP/2 to the Node origin, advertised via `Alt-Svc`.

- **Pixel-art SVG assets for script canvases** — integrate a set of pixel-art sprites/clipart as **SVGs** that **`script` nodes** (a canvas "collage" and kin) can drop in as elements, extending the existing clipart-SVG pipeline (assets in `data/assets/img/`, served via `/api/assets/`, fetched into the script's `x.ui` canvas — see `runtime/api.js`). Pixel art as SVG stays crisp at any zoom and is tiny + diff-able in the repo (vs. raster sprite sheets), and composes cleanly as canvas elements — a natural medium that pairs with the generative-art direction below. Open bits: a small picker/library, and whether to author the sprites by hand, generate them, or import a set.

- **Generative art** — treat Claude as a *performer with an instrument*, not a coder: pick a symbolic medium → give it a render-and-return tool so it perceives output → iterate tight ("darker, slower, more space"). Two routes: **embed the medium as a node** (a script node hosts the language and plays/renders inline), or **drive an external pro tool** over OSC/MIDI. Could become creative `script`-rendered media (or the `stream` type, when reimplemented).
  - **Audio** — *embed in a node:* **Strudel** (TidalCycles-style pattern code, runs in-browser — output-only, you're the ear), **SuperCollider** (synthesis driven via `sclang`/OSC), **Sonic Pi** (OSC bridge). *drive a DAW:* **Ableton Live** toward minimal techno with glitch artifacts — Claude generates MIDI / clips / automation, you mix. Generative MIDI: scale constraints, Euclidean rhythms E(5,8), Markov chains over scale degrees, L-systems → pitch.
  - **Video / visuals** — *embed in a node:* **Hydra** (browser livecoding, '70s feedback looks), GLSL shaders (plasma, FBM domain warp, LFO pulse), FFmpeg feedback pipelines (datamosh), reaction-diffusion / cellular automata / flow fields. *drive an external env:* **Jitter** (the video side of **Max/MSP**) over OSC.
  - **Creative MCP tools** (give it eyes/ears via the return value) — `play_osc` → SuperCollider/Sonic Pi; `eval_hydra` → screenshot back so it self-corrects; `render_shader` → PNG for closed-loop critique; `send_midi` → Ableton/hardware; `dmx_set` → stage lighting; `plot(expr)` → generative geometry.
  - Meta-recipe: symbolic medium + render-and-return tool + creative constraints (scales, Euclidean, L-systems, feedback, decade aesthetics) + tight iteration.

- **Distributed node OS / location-transparent execution** — extend node addressing across machines: a node id can resolve to another networked machine, `x.x(id)` becomes an RPC, and the store unifies RAM + disk + remote as one namespace ("an ip is just an object key"). The client never controls *where* code runs — it visits the site and just monitors execution. Pairs with **HTTP imports** (import a node/module by URL) and a **transferable UI** (the browser UI as a movable process). *(Distilled from the old varcraft tech-ideas note — as are the items below.)*

- **Command-first / terminal interface** — a **web terminal** in the editor to drive the node OS by typed commands, with text / voice / natural-language as a first-class command surface so the GUI becomes optional ("why have visuals if you can command the system by text/voice — purely for buttons and forms?"). This is the "terminal-first device" direction. **MVP shipped + grown:** a **terminal** docked full-width along the bottom of the editor (`Terminal.vue`, mounted in `App.vue` below the sider+content row), backed by a `COMMANDS` registry — type a command, Enter runs it, output scrolls **above** the input (real-terminal flow), with Tab autocomplete, click-to-focus, and drag-to-resize. Commands so far, each acting on the open node: `minimal-txt [id]` (compress an html note in place as a tracked `/api/runs` job), `ai <prompt>` (run an AI agent as a tracked run), `format` (pretty-print the open html note — **client-side**, prettier's browser build, no backend), `edit-html` (raw-html source mode), `mv-to-root` (un-nest a node the tree's drag-drop can't reach). Several actions migrated off per-node buttons so each lives in one place. **Next, growing the registry into the feature switcher:** `open <id>` / `new <type>` / `run <id>` / `search <q>`, a richer node-aware prompt (the selected node as the shell's "current directory"), then the load-bearing step — **natural-language fallthrough**, where an unrecognized line is handed to an AI run that maps intent → command. *Monetization:* no direct angle — it's a power-user accelerator, not a sellable unit; indirectly it's the surface a hosted/paid tier would meter "AI command" usage behind. *Marketing:* very demoable — a screen recording of driving the whole OS by typing ("create a node, run a script, compress a note — no mouse") is the canonical terminal-first hook, and pairs with the voice-dictation item for a text-or-voice command demo.

- **Tabs — open several nodes at once.** Today the editor shows exactly one node (`/node/:id` → a single `NodeItem` in the content pane); opening another replaces it. Add an editor-level **tab strip**: each open node is a tab, selecting a tree node opens/activates its tab, middle-click / ✕ closes one, and the active tab drives the route. Keeps multiple nodes live side-by-side in a workflow (a note next to the script it documents; a script next to its run monitor). Open bits: where tab state lives — a small Pinia slice (`openIds[]` + `activeId`, with the route mirroring `activeId`) vs. leaning on route history; whether tabs survive reload (persist `openIds` to `localStorage`); **keep-alive** so a tab's editor/canvas keeps its in-progress state when you switch away; and whether a later **split view** (two tabs visible at once) earns its keep or is scope creep. Pairs with the terminal (`open <id>` opens a tab) and is the prerequisite for any side-by-side compare/diff. *Monetization:* none directly — table-stakes editor ergonomics. *Marketing:* mild — a "multi-tab node workspace" clip; mostly it removes a friction wall, not a standalone hook.

- **Voice dictation hotkey (`dictate.sh`)** — system-wide speech→text built on the already-cached whisper.cpp model. `~/.local/bin/dictate.sh` (subcommands `start`/`stop`/`toggle`/`cancel`) does ffmpeg mic capture → `whisper-cli -mc 0` → clipboard + ⌘V paste. This is the "fake audio" workflow from Karpathy's *How I Use LLMs* — dictate into *any* app, not just the LLM box. **Remaining: bind it to a hotkey.** Toggle route (no extra app): macOS **Shortcuts** "Run Shell Script" → `dictate.sh toggle` + an assigned key. True **push-to-talk** (hold-to-talk) needs key-down/up events → Hammerspoon or Karabiner. Could later become ocraft's own voice command surface — ties into *Command-first / terminal interface* above.

- **Pi 500 as a hardware ocraft device** — Pi 500 = Pi 5 in a keyboard: 8gb, GPIO exposed, no internal NVMe (USB3 SSD boot = much faster; SD dies under server writes). light-desktop only — no Ableton/Adobe, weak 4k video, no 40-tab browser. ways to use it: **boot into ocraft** — kiosk Chromium → Vue editor, api+scheduler+MCP local; the keyboard *is* the node OS — the hardware embodiment of *Command-first / terminal interface* above. **livecoding instrument** — the *Generative art* visual mediums (Hydra/GLSL etc.) on the box → projector = whole VJ rig. **generative-MIDI brain** — run *Generative art*'s MIDI engine (Euclidean/Markov/L-system) on the pi → MIDI over USB into Ableton (Mac) or hardware (new part: it runs on dedicated hardware). **writing appliance** (for «Майже») — bare WM + Helix/Pandoc/Git, no browser, Syncthing to other devices; one machine, one job. **desktop with hands** — GPIO out: NeoPixel/DMX/e-ink reacting to ocraft events or audio, an encoder bank for live Hydra params (extends *Generative art*'s `dmx_set` to physical GPIO). **whole desktop in a bag** — keyboard + any HDMI + USB-C battery = your exact env anywhere (café rig). **always-on server + keyboard** — Gitea/Syncthing/MCP-bots/scheduler 24/7, desktop when you sit. **swappable-soul drives** — separate boot cards (dev / writing / livecoding / secure); keyboard = substrate, cards = node-types, same split as ocraft.

- **Deeper process model** — beyond start/stop/logs: live process **introspection** (inspect a running process's active timeouts / intervals / promises), and **snapshot / clone / migrate** a process's full state including closures ("loading process state from a process"). Plus a reactive **atoms/signals** primitive (value + compute-fn, tracked deps, cascade updates, consistent on error), and long-term a bytecode/opcode **VM** under the runtime ("bytecraft").

- **New node types** — an **outliner** (nested structured lists, vertical↔horizontal toggle), a **table editor**, an **append-only capture** note (write-once — can't edit or move what's written), and **in-browser media capture** (`MediaRecorder` → record audio/video/screen as a node, with a ~10 s preview/scrub).

- **Node-model refinements** — event **bubbling** up the `parentId` chain (DOM-style, distinct from the peer event-bus); infer/constrain a node's type from its descendants' types; and **git-backed nodes / subrepos** (a subtree backed by a real git repo, importable as a versioned module — beyond per-body versioning).

- **Backlinks (derived `[[…]]` index)** — show "what links here" for a node. **No new schema and no edge store:** scan node bodies for `[[id]]` / `x.x("id")` references, build a reverse index (`Map<to → from[]>`) at startup, refresh only the saved node's entry on each save; a backlink query is then a lookup, not a full scan (the scan survives only as a `reindex` rebuild routine). This is deliberately the *only* slice of the broader "typed edges beyond `parentId`" idea worth doing now — a **graph view** and a **stored `depends-on` edge model** are explicitly out of scope (see *Rejected / out-of-scope* below).

- **Multi-project & tooling** — multiple projects/workspaces, each publishable to its own domain; **CDP-based devtools** (build browser inspection/automation on the Chrome DevTools Protocol); and module **mocking** for the test harness.

- **Productization, monetization & go-to-market** — the *Monetization & marketing lens* applied at the whole-project level: how ocraft earns and reaches people, as a business *and* as open source. Researched plan: `plans/product-monetization-gtm-plan.txt`. Load-bearing facts: **(1) the binding constraint is geography, not pricing** — a Ukraine-resident individual can't receive GitHub Sponsors / Ko-fi / Liberapay / Buy-Me-a-Coffee / Polar (all ride Stripe Connect or PayPal-receive, neither of which operates in Ukraine). The only zero-setup rails are **Patreon → Payoneer** (recurring) and **Open Collective → Wise** (project funding; repo must sit under a GitHub *org*), so `.github/FUNDING.yml` points at those, never a bare `github:` button; selling digital products via Polar/Gumroad/Stripe needs a **foreign entity** (Stripe Atlas US LLC / EU Ltd). **(2) Model = bootstrap, don't take VC** — the proven shape for a local-first niche tool is Obsidian/Excalidraw: free MIT core as the funnel, sell a thin paid layer (scene/template/sprite **packs** — the Tailwind→Tailwind UI move that the generative-art / pixel-art-svg / binary-node items are the format for; an Obsidian-style ~$50/yr **commercial license**; a tldraw-style **SDK/watermark license** later). Open-core SaaS is parked (MIT is the most clonable license). Cautionary tale: *Dendron* (free self-hostable PKM + $2M VC → no PMF + burnout → dead, no fork). **(3) Audience precedes money** — median Sponsors income ≈ $0 and stars don't convert, so build an off-GitHub audience first (X demo clips — ocraft is unusually demoable — + a devlog/email list), then *Show HN* ("a local-first node OS you can run and inspect"), then a digital pack. *Open caveat:* confirm Open Source Collective actually pays a Ukraine resident via Wise (plausible, not officially documented) before relying on it.

> Recently shipped (kept for context, nothing left to do): full **CRUD + nested nodes** in the editor (create/rename/delete/drag-reparent, `category` folders, undo pool, child-guarded delete); **scripts calling other scripts** by id (`x.x("5", args)`); a node-aware **command terminal** (bottom bar — autocomplete, resize) with `minimal-txt` / `ai` / `format` / `edit-html` / `mv-to-root`; **client-side html/md formatting** (prettier's browser build — no backend); **cookie-session auth** (`/login` + an HttpOnly `SameSite=Strict` session cookie, with a login throttle); and a **focus pass** that narrowed the built-in types to `html` / `script` / `category` (scene2d/scene3d/ai-chat/tg-chat removed — "scenes are scripts now"), dropping p5 / three / tone and the WASM/AssemblyScript path; a local **`/ws` WebSocket hub** (`runtime/wsServer.js`, auth-gated, broadcasting node events) that replaced the remote Deno relay; and the **`yo`** toy language reborn as a script node that **transpiles to JS** (it was an AST interpreter under `experiments/js-engine`, now deleted).

## Rejected / out-of-scope

Cut and parked ideas (with the *why* for each) live in **[plans/rejected-out-of-scope.txt](plans/rejected-out-of-scope.txt)** — check it before proposing features so they don't get resurfaced.
