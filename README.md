# ocraft

A personal **node OS**: one addressable tree where a node can be **anything from a note to a running program**. Everything is a node (`/node/:id`) — `html`/`scene` nodes hold data, `script` nodes are programs that call each other, `category` nodes are folders — and the visual editor, the scheduler, and the MCP servers are all just **clients of one node store**. The decisive part, and the real difference from a notes app: *data and behavior live in the same tree* — a page can also run.

Built framework-free on plain Node.js (ESM), with a Vue 3 + p5.js editor on top. A single-user local environment — and the substrate for a longer-term personal life-management system (see [Direction](#direction)).

> **Where it honestly stands:** ocraft is **open in its data plane** — any node, any `type`, created live — but **closed in its behavior plane**: the node *types* are a fixed set of built-in handlers compiled into the app, so adding a genuinely new type still means a source edit, not an in-app action. Making a handler *itself a node* — so you can craft new types from inside — is the keystone item on the [Roadmap](#roadmap).

## The idea — a filesystem of typed nodes

Everything in ocraft is a **node**. On disk a node is a small folder, `backend/data/nodes/<id>/`, holding:

- **metadata** in `state.json` (`name`, `type`, `parentId`, …), and
- an optional **body** sidecar — the "file contents" — resolved by type: `script.js` for a `script` node, `content.html` for an `html` node. Bodies are kept out of the node-list payload and fetched on open.

Four properties make this a small OS-like substrate rather than just a document store:

- **It nests like a filesystem.** Each node points to its parent via `parentId`; `category` nodes are folders. The editor gives you the whole tree: create, rename, delete (with an undo pool), and drag-to-reparent (cycle-guarded).
- **Types are handlers** — a node's `type` decides how it's interpreted and rendered, like a file association:

  | type | what it's for | body |
  |------|---------------|------|
  | `html` | documents / notes — the knowledge base | `content.html` |
  | `scene` | an animated audio-visual: shapes + post-effects on a p5.js canvas, timed to a Tone.js step sequencer | — |
  | `script` | a **program** — JavaScript or AssemblyScript→WASM, run on demand | `script.js` |
  | `category` | a folder that just holds children | — |
  | `ai-chat` | an embedded agent (Claude Agent SDK) | — |

- **Nodes are addressable.** Each node has a stable numeric id and is reachable at `/node/:id`. Notes link to each other by `/node/:id`; scripts call each other by id. The id is the address; `name` is only a label.
- **Data and code share one tree.** A folder can hold a note next to a scene next to a runnable script — no separate "files" vs "programs" worlds.

```
notes/                 (category — a folder)
  daily/               (category)
    2026-06-17         (html — a note)
  tech-ideas           (html — links to → /node/100)
test/
  websocket-tester     (script — a program with its own UI)
  adder                (script — compiled to WASM)
scenes/
  intro                (scene — p5.js + Tone.js)
```

*(Shape is real; names are illustrative.)*

## Running nodes

A `script` node is a module: `export default async (x) => { … }`. When you Run it, it executes — in the browser, via blob import — and is handed a small **context `x`**, effectively the node's syscalls:

- **`x.x(id, args)`** — call another node by its id and get its result back. This is composition: programs built from programs. Re-entry is caught as a cycle, not infinite recursion.
- **`x.auth`** — a shared credential store (named token slots, persisted in `localStorage`) so scripts can reuse a bearer/token entered once.
- **`x.ui`** — mount real DOM controls (inputs, buttons, a live log) above the editor, so a script node can be a little **app** (the WebSocket tester is one).
- **`x.args`, `x.log`** — invocation arguments and labelled logging.

A script can also be **AssemblyScript**: the backend compiles its source to WebAssembly on demand (`GET /api/nodes/:id/wasm`), the browser instantiates it, and a `main()` export is the Run entrypoint (the WASM analog of `export default`). WASM nodes are callable from other nodes through `x.x` just like JS ones.

> **Scope, honestly:** node scripts run in the **browser** today, with no sandbox and no resource limits — composition and a UI surface exist; isolation does not. A headless runner (so the scheduler can execute nodes) and sandboxed, resource-capped execution are on the [Roadmap](#roadmap), not built. The `x` context is kept deliberately small so it can be re-implemented backend-side later.

## The system around the nodes

Four surfaces, one node store. They're independent apps and reach the store only over `/api/*` (HTTP, port 3001):

- **Node store + API** (`backend/server.js`) — the source of truth: a tiny, framework-free HTTP server doing CRUD on the node folders. Everything else is a client of it.
- **Visual editor** (`frontend/`) — *one* client: a Vue 3 tree browser plus a per-type editor/preview (p5.js for scenes, a code editor for scripts, rich text for html). The app is literally a node router — just `/` and `/node/:id`.
- **Scheduler + executor + proc manager** (`cli.js` + `backend/`) — the automation layer: cron-like **jobs** (finite *entries* the executor runs to completion) plus a **proc manager** that supervises long-running processes (start/stop/restart/status/logs).
- **MCP servers** (`mcp-servers/`) — external I/O for an AI assistant: Telegram, Gmail, Google Calendar, DigitalOcean. Registered in `.mcp.json`, unrelated to the scheduler.

### Layout

```
ocraft/
  cli.js            # CLI entry point (scheduler, executor, proc manager)
  backend/          # Node store + API server, scheduler/executor, proc manager, data store
  frontend/         # Vue 3 + p5.js visual editor — one client of the node store
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
npm install                 # root deps (dotenv, MCP SDK)
cd backend && npm install   # only needed for image-optimize entries (sharp)
cd frontend && npm install  # editor deps
```

### Run the editor

```bash
cd frontend
npm run dev      # Vite dev server; auto-spawns the backend API server on port 3001
npm run build
```

The backend API server (`backend/server.js`) reads/writes node JSON under `backend/data/nodes/` and can also run standalone with `node backend/server.js`. See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for editor internals.

## Reference

### Scheduler & CLI

The executor loads an entry module from `backend/entries/<name>.js`, runs its exported `run(ctx)`, and writes a record to `backend/executions/`. The scheduler (`backend/scheduler.js`) defines `jobs[]` and runs the ones that are due, tracking `lastRunAt` per job.

```bash
node cli.js run <entry-name> [args...]   # run a single entry once
node cli.js start-scheduler              # run all due jobs once (call periodically via cron)
node cli.js list-executions              # print recent execution log
```

Each entry receives a `ctx`: `args`, `env`, `log(msg)`, persistent `state.load()/save()`, and `time.now()`. Existing entries include `telegram-reminder`, `telegram-poll`, `img-optimize[-dir]`, `import-thinktank` (Obsidian vault → nodes), `do-droplet-up` / `do-droplet-down`, `deploy`, `every-hour`, and `test`.

### Proc manager

For long-running processes (e.g. the frontend dev server, a ticker), one config file per process lives in `backend/procs/`, discovered like entries. Runtime state and logs are kept in `backend/state/procs/`.

```bash
node cli.js proc list                  # show configured procs and status
node cli.js proc status <id>
node cli.js proc start <id>
node cli.js proc stop <id>
node cli.js proc restart <id>
node cli.js proc logs <id> [lines]     # tail the proc log
node cli.js proc clear-logs <id>
```

### Importing notes (the knowledge base)

`node cli.js run import-thinktank [vaultPath]` migrates an Obsidian Markdown vault into `html` nodes under a `notes` category: wikilinks become internal `/node/:id` links, the folder hierarchy is rebuilt from a map-of-content note via `parentId`, and embedded images are optimized into `data/assets/img/optimized/`. It is idempotent (wipe-on-rerun) and writes a manifest. Once imported, **the nodes are the source of truth** — edit them in the editor, not the original Markdown. Re-running is **destructive** — it wipes the prior import, regenerates from the source, and reassigns node ids, discarding any in-place edits — so to change a migrated note, edit the node; never re-run to tweak content. Private / credential notes are deliberately excluded (the importer's `EXCLUDED` set) and must never be migrated into this public repo.

### MCP servers

Standalone Model Context Protocol servers in `mcp-servers/`, registered in [`.mcp.json`](.mcp.json). Each has its own `README.md` and `.env.example`; copy that to `.env` and fill in credentials.

- **telegram-mcp** — read/search a Telegram user account over MTProto (GramJS). Run `npm run login` once to create a session string.
- **gmail-mcp** — read/search a Gmail account.
- **gcal-mcp** — read-only Google Calendar access via a Google Cloud **service account**. Share the target calendar with the service account email, then point `GOOGLE_APPLICATION_CREDENTIALS` at the JSON key.
- **digitalocean-mcp** — manage DigitalOcean droplets and infrastructure via the DO API (token in `.env`).

> **Secrets:** `.env` files, Telegram session strings, and the Google service-account JSON key are git-ignored and must never be committed. The `.env.example` files are placeholders only. The `POST /api/ai-chat` endpoint runs the Claude Agent SDK with bypassed permissions and is **localhost / single-user only** — never expose this server to a network.

## Direction

The node store is the substrate; the long-term goal is a **personal life-management system** built on it: the node tree is the durable memory (notes, plans, logs), the scheduler decides *when/what*, the MCP servers are the I/O channels, and an assistant supplies the language/judgment step. This is a direction, not a spec — see the [Roadmap](#roadmap) below (a parking lot) and `plans/` for longer-form design notes.

## License

Personal project — no license specified.

## Roadmap

Scratchpad for things to explore, learn, or build later. Not a spec — just a parking lot so nothing gets lost. Move items into `CLAUDE.md` only once they become concrete, code-relevant work.

- **Self-extending node types — make a handler itself a node (the keystone).** ocraft's identity claim is *"you can create any node type you want."* Graded honestly against the code today, that splits three ways: (1) creating any node **data** — TRUE (the store is type-agnostic; `POST /api/nodes` accepts any `type` string, the tree is computed from `parentId`, `x.x(id)` composes regardless of type, and a running script can even raw-`fetch` the API to manufacture nodes at runtime); (2) a note that **is a program** — TRUE and the real differentiator (`x.x` compose, `x.ui` mount UI, `x.auth`, AssemblyScript→WASM). (3) **"You can create any node *type* — THAT is what ocraft is" — FALSE today, and this is the load-bearing claim.** A type only becomes real once it has a **handler**, and handlers are five hardcoded compile-time Vue imports (`NodeItem.vue:30-36`) with a **silent fallback to Scene** for any unknown type (line 47), plus a two-entry `NODE_BODY` dict (`server.js:121-124`). You cannot register a handler from inside the running app — Vue resolves components at build time, and the server has no hot-reload. So ocraft is **open in its data plane but closed/build-time in its behavior plane**: `html`/`script` aren't "mere features," they're two of exactly five privileged, hand-built handlers, and that set is closed without a source edit + rebuild.

  The elegant part: the runtime **already** dynamic-imports from the store — for script *bodies* (`useNodeScripts.js` blob-imports `script.js` from `/api/nodes/:id/body`) — just never for *views*. Closing the gap, in leverage order: (1) **kill the silent Scene fallback** → render an explicit *"no handler for type X — create one?"* card (cheapest, highest-signal; turns the gap into an authoring affordance); (2) **make the handler a node** — move the `type→renderer` map out of the hardcoded `NODE_TYPES` into the store and load handlers at runtime by reusing the existing blob-import mechanism (a render-function/component module fetched from a node body, mounted via `defineAsyncComponent`; avoid in-browser SFC compilation); (3) give the running `x` a first-class, cycle-guarded **graph-mutation** affordance (`x.create`/`x.save`/`x.tree`) instead of incidental raw fetch; (4) make `NODE_BODY` **data-driven** so a new bodied type needs no server restart; (5) pair this with a **sandbox** (Worker/iframe, capability-scoped) — loading a handler from a node body means executing arbitrary code from data, and scripts already run unsandboxed. Steps 1–2 are the whole ballgame: ship them and *"create any node type"* stops being the name's aspiration and becomes an accurate description of what ocraft is.

- **Flutter for cloud-driven mobile control** — build a Flutter mobile app that can be controlled / driven from "cloud code" (e.g. trigger actions, push state, or receive commands from a backend service). Explore how this could connect to the existing ocraft backend/scheduler.

- **Autonomous dev loop** — close the loop on AI-driven development of ocraft: the `ocraft-dev-plan` skill writes a sequenced weekly plan (`dev-plans/<date>-week.md`), then a dedicated **`dev-task` entry** executes *one* task per run on a branch (Agent SDK), gates on the task's acceptance check, and opens a PR for human review — never `main`, never auto-merge. Execution must be the `dev-task` entry, **not** `POST /api/ai-chat` (that endpoint is bypassPermissions + no-auth + localhost-only, must never do git/PR). Visual changes can be self-verified via the claude-in-chrome MCP (screenshots + DOM of the running editor) — the "eyes" already exist. Prereqs: `gh` installed + authenticated (`origin` is already set). Honest caveat: ocraft has no real test/behavior gate yet (only `node --check` + `npm run build` + screenshots), so PRs genuinely need human review until one exists.

- **`stream` node type (removed — reimplement later)** — the `stream` node type was removed (frontend `Stream.vue` preview, its type registration, and the `sample stream` node) to keep the type list to things that actually work. When revisiting, it needs two halves: (1) a real **frontend** editor/preview — the old one was a placeholder black canvas using the shared `Stage` chrome; and (2) a **backend run model** — today nodes are just stored JSON with no run semantics, so define how a stream node is configured and actually *executed* on the backend side.

- **Node / script versioning (version-on-save)** — saving a node script overwrites it today. Instead, each save could write a new version (keep history, allow diff/rollback) rather than clobbering the previous one. (From the old Varcraft notes — "need fx versioning, i.e. a new save.")

- **`yo` as a node scripting medium** — `js-engine/` already holds `yo`, a tiny async-first toy interpreter (lexer → parser → evaluator, `@`-keyword syntax). It could grow into an embeddable, sandboxed scripting medium for nodes (a safer alternative to raw-JS `script` nodes), or a symbolic medium for the generative-art experiments below.

- **Sandboxed execution with resource limits** — node/entry scripts currently run with full Node access. Run them in an isolated environment (container or VM) with disk / memory / CPU caps, so an artifact can't take down the host. Pairs with the `yo` sandbox idea above, and the DO droplet is a natural place to run isolated workers. (From the old Varcraft notes — the original vision already assumed containerised, resource-limited module execution.)

- **Process control / supervisor — extend coverage** — `backend/procManager.js` now exists (the custom plain-ESM fork was chosen: per-proc config files like `scheduler.js`'s `jobs[]`, reusing `withLock` + the `state/` store, with rotating logs). But it currently supervises only two procs (`frontend`, `ticker`). Bring the rest under the one start/stop/restart/status/log unit: the scheduler, the backend API server, and the MCP servers. Caveat still stands — stdio MCP servers can only be supervised standalone if moved to HTTP/SSE transport.

- **Process-management UI + live resource monitoring** — `procManager.js` is backend-only; there's no way to start/stop/restart procs or watch them from the editor. Add a frontend page that lists procs with their status, tails their logs, and shows live RAM / CPU usage per proc. (From the old Varcraft notes — "a page for managing app processes... and query RAM and CPU.")

- **Cloud WebSocket exchange** — a hosted relay/broker that exchanges WS messages between the backend, the editor, and future clients. This is the "cloud" the Flutter mobile-control idea needs — the hub that lets cloud code drive a mobile app. The exchange shipped on **Deno Deploy** (`wss://stream.x8.deno.net/ws`), so the open part is only the *design*: pub/sub topics vs. direct routing, auth, and whether the local backend is the origin or just another client. A deploy plan for the Deno service lives in `plans/deno-deploy-mcp-plan.txt`.

- **Integrate `stream.x8.deno.net` (the live WS exchange) into ocraft** — the cloud WS relay now *exists* as a deployed endpoint: `wss://stream.x8.deno.net/ws` (on **Deno Deploy**). Next step is wiring it into the stack: the local backend connects as a **client** and publishes node / proc / execution events; the editor **subscribes** for live updates (replacing the poll-based proc UI and chat-node streaming); future clients (the Flutter/mobile idea) join the same hub. Open before that: the message protocol (pub/sub topics vs. direct addressing) and auth. Already have a **`websocket-tester` script node** (id 11, under `test`) for poking the endpoint — a connect/send/log panel built with the `x.ui` script-controls surface.

- **More MCP servers to build** — beyond telegram + gcal + gmail, the life-management loop still lacks _hands on its own machinery_ (its _memory organ_ is now the migrated notes-as-nodes, so that gap is closed):
  - **ocraft self-MCP** — expose the scheduler/nodes/procManager as tools (`list_jobs`, `run_entry`, `proc_status`, `tail_execution_log`, `search_nodes`, `create_node`) so Claude can _operate_ the system, not just edit its files. Now that the notes vault lives as nodes, this is also the "remember" organ — searching/appending a note _is_ a node op, the durable home every other MCP's summaries need. The real driver is the headless side (the scheduler + a chat-node "brain"), which can't borrow an interactive Claude Code session's Read/Grep/Edit and so needs these as tools.
  - **Music** — _probably not worth a dedicated MCP._ For playback control the claude-in-chrome extension already drives the Spotify/Apple Music web player. An API MCP would only pay off for the data side (listening history, building playlists as data) — a weaker need. Park it; revisit if the history/logging use case becomes real.

- **HTTP/3 (QUIC) for the backend API server** — Node.js landed a native QUIC + HTTP/3 implementation in **v26.2.0** via the `node:quic` module — HTTP/3 over `nghttp3`, activated when the negotiated ALPN is `h3`. Still **experimental** (Stability 1.0) behind the `--experimental-quic` runtime flag. Idea: serve `backend/server.js`'s `/api/*` over HTTP/3. Honest caveat: it's a **localhost dev server**, so HTTP/3's real wins (no head-of-line blocking + connection migration over lossy networks) don't apply here, and QUIC mandates TLS 1.3 — so it'd need certs + UDP where today it's plain HTTP. This is a **learning exercise**, not a perf need; the pragmatic production path is to terminate HTTP/3 at the edge (CDN / nginx 1.25+ with QUIC) and speak HTTP/2 to the Node origin, advertised via `Alt-Svc`.

- **Generative art** — treat Claude as a *performer with an instrument*, not a coder: pick a symbolic medium → give it a render-and-return tool so it perceives output → iterate tight ("darker, slower, more space"). Two routes: **embed the medium as a node** (a script node hosts the language and plays/renders inline), or **drive an external pro tool** over OSC/MIDI. Could become creative `stream`/`chat` node types.
  - **Audio** — *embed in a node:* **Strudel** (TidalCycles-style pattern code, runs in-browser — output-only, you're the ear), **SuperCollider** (synthesis driven via `sclang`/OSC), **Sonic Pi** (OSC bridge). *drive a DAW:* **Ableton Live** toward minimal techno with glitch artifacts — Claude generates MIDI / clips / automation, you mix. Generative MIDI: scale constraints, Euclidean rhythms E(5,8), Markov chains over scale degrees, L-systems → pitch.
  - **Video / visuals** — *embed in a node:* **Hydra** (browser livecoding, '70s feedback looks), GLSL shaders (plasma, FBM domain warp, LFO pulse), FFmpeg feedback pipelines (datamosh), reaction-diffusion / cellular automata / flow fields. *drive an external env:* **Jitter** (the video side of **Max/MSP**) over OSC.
  - **Creative MCP tools** (give it eyes/ears via the return value) — `play_osc` → SuperCollider/Sonic Pi; `eval_hydra` → screenshot back so it self-corrects; `render_shader` → PNG for closed-loop critique; `send_midi` → Ableton/hardware; `dmx_set` → stage lighting; `plot(expr)` → generative geometry.
  - Meta-recipe: symbolic medium + render-and-return tool + creative constraints (scales, Euclidean, L-systems, feedback, decade aesthetics) + tight iteration.

> Recently shipped (kept for context, nothing left to do): full **CRUD + nested nodes** in the editor (create/rename/delete/drag-reparent, `category` folders, undo pool, child-guarded delete); **scripts calling other scripts** by id (`x.x("5", args)`).
