# ocraft

A personal **node OS**: one addressable tree where a node can be **anything from a note to a running program**. Everything is a node (`/node/:id`) — `html`/`scene` nodes hold data, `script` nodes are programs that call each other, `category` nodes are folders — and the visual editor, the scheduler, and the MCP servers are all just **clients of one node store**. The decisive part, and the real difference from a notes app: *data and behavior live in the same tree* — a page can also run.

Built framework-free on plain Node.js (ESM), with a Vue 3 + p5.js editor on top. A single-user local environment — and the substrate for a longer-term personal life-management system (see [Direction](#direction)).

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
  | `scene2d` | an animated audio-visual: shapes + post-effects on a p5.js canvas, timed to a Tone.js step sequencer | — |
  | `scene3d` | a Three.js 3D scene — meshes, lights, and a camera built from JSON, with a render loop | — |
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
  intro                (scene2d — p5.js + Tone.js)
  hello 3d             (scene3d — Three.js)
```

*(Shape is real; names are illustrative.)*

## Running nodes

A `script` node is a module: `export default async (x) => { … }`. When you Run it, it executes — in the browser, via blob import — and is handed a small **context `x`**, effectively the node's syscalls:

- **`x.x(id, args)`** — call another node by its id and get its result back. This is composition: programs built from programs. Re-entry is caught as a cycle, not infinite recursion.
- **`x.auth`** — a shared credential store (named token slots, persisted in `localStorage`) so scripts can reuse a bearer/token entered once.
- **`x.ui`** — mount real DOM controls (inputs, buttons, a live log) above the editor, so a script node can be a little **app** (the WebSocket tester is one).
- **`x.args`, `x.log`** — invocation arguments and labelled logging.

A script can also be **AssemblyScript**: the API server compiles its source to WebAssembly on demand (`GET /api/nodes/:id/wasm`), the browser instantiates it, and a `main()` export is the Run entrypoint (the WASM analog of `export default`). WASM nodes are callable from other nodes through `x.x` just like JS ones.

> **Scope, honestly:** node scripts run in the **browser** today, with no sandbox and no resource limits — composition and a UI surface exist; isolation does not. A headless runner (so the scheduler can execute nodes) and sandboxed, resource-capped execution are on the [Roadmap](#roadmap), not built. The `x` context is kept deliberately small so it can be re-implemented backend-side later.

## The system around the nodes

Four surfaces, one node store. They're independent; the editor reaches the store over `/api/*` (HTTP, port 3001), while runtime tasks can also touch the node files directly:

- **Node store + API** (`runtime/apiServer.js` + `data/`) — the source of truth: a tiny, framework-free HTTP server doing CRUD on the node folders. Everything else is a client of it.
- **Visual editor** (`frontend/`) — *one* client: a Vue 3 tree browser plus a per-type editor/preview (p5.js / Three.js for scenes, a code editor for scripts, rich text for html). The app is literally a node router — just `/` and `/node/:id`.
- **Tasks, scheduler & services** (`bin/cli.js` + `runtime/`) — the automation layer, split by lifecycle: **tasks** are finite (run to completion via the executor; the scheduler fires them on a cadence), **services** are long-running processes the service manager supervises (start/stop/restart/status/logs). A task *must terminate*; a service *stays up*.
- **MCP servers** (`mcp-servers/`) — external I/O for an AI assistant: Telegram, Gmail, Google Calendar, DigitalOcean. Registered in `.mcp.json`, unrelated to the scheduler.

### Layout

```
ocraft/
  bin/              # entry scripts — cli.js (tasks/scheduler/services) · yolo.js (Docker launcher)
  data/             # the node store — nodes/ (each a folder), assets/, concept-db.json (source of truth)
  runtime/          # the HTTP API server (apiServer.js) + automation engine — runs.js/runners (AI), task executor/scheduler, service supervisor, tasks/, services/
    transport/      # ws-exchange/ — remote Deno WS relay (Deno Deploy); separate Deno toolchain
  frontend/         # Vue 3 + p5.js visual editor — one client of the node store
  mcp-servers/      # Standalone MCP servers
    telegram-mcp/   #   read/search a Telegram account (GramJS / MTProto)
    gmail-mcp/      #   read/search Gmail
    gcal-mcp/       #   read Google Calendar (service account, read-only)
    digitalocean-mcp/ # manage DigitalOcean droplets / infra
  experiments/      # js-engine — the `yo` toy interpreter (+ future experiments)
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
node bin/cli.js service start api   # node API server (runtime/apiServer.js) on :3001
cd frontend && npm run dev          # Vite dev server; proxies /api to :3001
npm run build
```

The node API server (`runtime/apiServer.js`) reads/writes node JSON under `data/nodes/` and can also run standalone with `node runtime/apiServer.js`. It runs as a managed service (`api`); Vite only proxies `/api` to it.

**In production there's no Vite.** Build the editor once (`cd frontend && npm run build` → `frontend/dist/`), and the same `api` process serves that static bundle for every non-`/api` request — hashed assets cached immutably, an `index.html` history-fallback so `/node/:id` resolves on refresh — alongside the `/api` routes on one port. So prod is a **single process** serving app + API from **one origin** (which the `SameSite=Strict` session cookie requires); front it with Caddy/nginx for HTTPS and set `API_TOKEN` + `COOKIE_SECURE=true`. The static bundle is served *without* auth (it holds no secrets — the token isn't baked into the build, and the login page must load first); only `/api/*` is gated. The CI deploy (`.github/workflows/ci.yml`) runs `npm run build` in `frontend/` on the box as part of each deploy.

## Reference

### Tasks vs services

The automation layer splits cleanly by **lifecycle**:

- A **task** is **finite** — it runs to completion and exits. It lives in `runtime/tasks/<name>.js` (exports `run(ctx)`), is run by the executor (which writes a record to `runtime/executions/` and enforces a timeout — *a task must terminate*), and the **scheduler** (`runtime/scheduler.js`) fires it on an interval / cron-like schedule via `jobs[]`.
- A **service** is **long-running** — it stays up until stopped. It lives in `runtime/services/<id>.js` (a `{ cmd, args, cwd, env }` config) and is supervised by the service manager; runtime state + logs live in `runtime/state/services/`.

```bash
# tasks (finite)
node bin/cli.js run <task-name> [args...]    # run one task to completion
node bin/cli.js start-scheduler              # run all due tasks once (call from cron)
node bin/cli.js scheduler-loop               # run the scheduler as a daemon (the `scheduler` service)
node bin/cli.js list-executions              # print recent task executions

# services (long-running)
node bin/cli.js service list                 # configured services + status
node bin/cli.js service <start|stop|restart|status> <id>
node bin/cli.js service logs <id> [lines]    # tail the service log
node bin/cli.js service clear-logs <id>
```

Each task receives a `ctx`: `args`, `env`, `log(msg)`, persistent `state.load()/save()`, and `time.now()` (and may export `timeoutMs` to widen its budget). Existing tasks: `telegram-reminder`, `telegram-poll`, `img-optimize[-dir]`, `do-droplet-up` / `do-droplet-down`, `deploy`, `every-hour`, `test`. Configured services: `api` (the node API server), `frontend` (Vite), `scheduler` (the daemon), `ticker`.

### MCP servers

Standalone Model Context Protocol servers in `mcp-servers/`, registered in [`.mcp.json`](.mcp.json). Each has its own `README.md` and `.env.example`; copy that to `.env` and fill in credentials.

- **telegram-mcp** — read/search a Telegram user account over MTProto (GramJS). Run `npm run login` once to create a session string.
- **gmail-mcp** — read/search a Gmail account.
- **gcal-mcp** — read-only Google Calendar access via a Google Cloud **service account**. Share the target calendar with the service account email, then point `GOOGLE_APPLICATION_CREDENTIALS` at the JSON key.
- **digitalocean-mcp** — manage DigitalOcean droplets and infrastructure via the DO API (token in `.env`).

> **Secrets:** `.env` files, Telegram session strings, and the Google service-account JSON key are git-ignored and must never be committed. The `.env.example` files are placeholders only. The `POST /api/ai-chat` endpoint runs the Claude Agent SDK with bypassed permissions and is **localhost / single-user only** — never expose this server to a network.
>
> **API auth:** the node API server requires the secret `API_TOKEN` on **every** request — set a random one in `.env` (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). You enter it once at **`/login`**; the backend validates it (`POST /api/login`) and sets an **HttpOnly, `SameSite=Strict`** session cookie. The browser then auto-sends it on every `/api` request and **JS never holds the token** — an HttpOnly cookie is invisible to scripts (XSS-safe), and `SameSite=Strict` means it isn't sent cross-site (CSRF-safe). A `Bearer` header is also accepted for non-browser callers. In production over HTTPS, set `COOKIE_SECURE=true` so the cookie is also `Secure`. Unset `API_TOKEN` = the server runs open with a loud boot warning (so a fresh checkout doesn't break). After changing the token, restart the `api` service and re-`/login`.

## Conventions & coding rules

Follow these when writing or editing code here (it's `.js` everywhere — every package is ESM):

- **Never use the `.mjs` extension.** Every package here is ESM already (`"type": "module"` in package.json), so plain `.js` is ESM. Use `.js` for all JavaScript files — scripts, helpers, one-offs, everything.
- **Develop on `main` — don't create feature branches.** Build features directly on `main`; do not `git checkout -b` a feature/topic branch for development. (This overrides the generic "branch before committing on the default branch" default for this repo.)
- **No single-letter variable names — except `i`/`j`/`k` as numeric loop counters.** Use a descriptive name for every binding — including callback parameters, `.map`/`.filter`/`.find` args, and regex matches. Write `const droplet = await getDroplet(id)`, not `const d = …`; `images.filter((image) => …)`, not `(i) => …`. The name should say what the value *is*. The one allowed exception: a classic numeric loop index may be `i` (nested loops: `j`, `k`), e.g. `for (let i = 0; i < count; i++)` — ESLint's `id-length` exempts `i`/`j`/`k`. Still prefer a descriptive name when iterating a *named* collection: `for (const droplet of droplets)`, not `for (const d of droplets)`.
- **No boolean flag parameters.** A `fn(…, true)` call site is opaque — the reader can't tell what `true` selects. When a flag would switch between two behaviours, prefer the most minimal split that removes the boolean: usually **two intention-named functions**, otherwise a named mode/strategy (e.g. a string `'rich'`/`'source'`, a passed-in handler, or a small factory). Write `editRich()` / `editSource()`, not `enterEdit(true)` / `enterEdit(false)`. This applies to new code and to flags you touch while editing.
- **Write the simplest condition that reads plainly — don't over-guard.** Destructure up front, then test the fields: `const { width, height } = obj ?? {}; if (!width || !height) …`, not `if (!obj || !(obj.width > 0) || !(obj.height > 0))`. Prefer `!value`, `value < n`, or `!list.length` over negated comparisons like `!(a > b)`. Guard the failure that can *actually* occur (missing / zero / empty), not theoretical inputs that can't (a negative or `NaN` dimension that nothing produces). Keep thrown messages short — name the thing and the bad value, skip the lecture. If you deviate from the obvious form for a real reason (e.g. `!width` to also catch `undefined`), say why in a one-line comment rather than silently complicating it.
- **Use the shared naive-ui `<n-button size="small">` for action buttons — don't hand-roll a plain `<button>`.** Save / Run / Edit / Refresh / Send-style actions in node editors and views go through the one button component (see `NodeItem.vue`'s Save, `Script.vue`'s Run, `Html.vue`'s Edit/Add link) so every action button looks the same. A plain styled `<button>` is reserved for compact **chrome / transport / icon** controls that intentionally have their own look — the tree's rename/delete (`NodeTree.vue`), the sidebar's `+ node` (`App.vue`), a scene's ▶/⏹ (`Scene2d.vue`). Default a new button to `n-button`; only drop to a plain element for those icon/chrome cases, and say why.

## Monetization & marketing lens (apply to every feature)

Whenever you propose, plan, or build a feature, also analyze — and surface it in the plan/PR/idea, not as an afterthought — two angles:

- **Monetization** — how could this feature make money? (paid tier, usage/metered pricing, one-off sale, marketplace cut, hosted/SaaS version, sponsorship, paid template/asset packs). Name *who* would pay, *why*, and the cheapest viable way to charge. If there's no realistic angle, say so plainly rather than inventing one.
- **Marketing** — how would it reach people? The "show, don't tell" artifact (demo clip, screenshot, before/after), the channel (YouTube, X, Reddit, HN, Telegram), the hook/headline, and the target user. Many ocraft features are visual/demoable — favor a recordable demo. See the YouTube content plan in `plans/youtube-content-plan.txt`.

Park concrete monetization/marketing ideas in the *Roadmap* below next to the feature they belong to. This lens is a default habit, not a gate — keep it short and honest.

## Direction

The node store is the substrate; the long-term goal is a **personal life-management system** built on it: the node tree is the durable memory (notes, plans, logs), the scheduler decides *when/what*, the MCP servers are the I/O channels, and an assistant supplies the language/judgment step. This is a direction, not a spec — see the [Roadmap](#roadmap) below (a parking lot) and `plans/` for longer-form design notes (deno-deploy MCP, TypeScript/lint adoption, YouTube content).

## License

[MIT](LICENSE) © 2026 Nick Aliferov.

## Roadmap

Scratchpad for things to explore, learn, or build later. Not a spec — just a parking lot so nothing gets lost. Move items into `CLAUDE.md` only once they become concrete, code-relevant work.

- **Self-extending node types — make a handler itself a node (the keystone).** ocraft's identity claim is *"you can create any node type you want."* Graded honestly against the code today, that splits three ways: (1) creating any node **data** — TRUE (the store is type-agnostic; `POST /api/nodes` accepts any `type` string, the tree is computed from `parentId`, `x.x(id)` composes regardless of type, and a running script can even raw-`fetch` the API to manufacture nodes at runtime); (2) a note that **is a program** — TRUE and the real differentiator (`x.x` compose, `x.ui` mount UI, `x.auth`, AssemblyScript→WASM). (3) **"You can create any node *type* — THAT is what ocraft is" — FALSE today, and this is the load-bearing claim.** A type only becomes real once it has a **handler**, and handlers are five hardcoded compile-time Vue imports (`NodeItem.vue:30-36`) with a **silent fallback to Scene** for any unknown type (line 47), plus a two-entry `NODE_BODY` dict (`runtime/apiServer.js:121-124`). You cannot register a handler from inside the running app — Vue resolves components at build time, and the server has no hot-reload. So ocraft is **open in its data plane but closed/build-time in its behavior plane**: `html`/`script` aren't "mere features," they're two of exactly five privileged, hand-built handlers, and that set is closed without a source edit + rebuild.

  The elegant part: the runtime **already** dynamic-imports from the store — for script *bodies* (`useNodeScripts.js` blob-imports `script.js` from `/api/nodes/:id/body`) — just never for *views*. Closing the gap, in leverage order: (1) **kill the silent Scene fallback** → render an explicit *"no handler for type X — create one?"* card (cheapest, highest-signal; turns the gap into an authoring affordance); (2) **make the handler a node** — move the `type→renderer` map out of the hardcoded `NODE_TYPES` into the store and load handlers at runtime by reusing the existing blob-import mechanism (a render-function/component module fetched from a node body, mounted via `defineAsyncComponent`; avoid in-browser SFC compilation); (3) give the running `x` a first-class, cycle-guarded **graph-mutation** affordance (`x.create`/`x.save`/`x.tree`) instead of incidental raw fetch; (4) make `NODE_BODY` **data-driven** so a new bodied type needs no server restart; (5) pair this with a **sandbox** (Worker/iframe, capability-scoped) — loading a handler from a node body means executing arbitrary code from data, and scripts already run unsandboxed. Steps 1–2 are the whole ballgame: ship them and *"create any node type"* stops being the name's aspiration and becomes an accurate description of what ocraft is.

- **Flutter for cloud-driven mobile control** — build a Flutter mobile app that can be controlled / driven from "cloud code" (e.g. trigger actions, push state, or receive commands from a backend service). Explore how this could connect to the existing ocraft runtime + scheduler.

- **Autonomous dev loop** — close the loop on AI-driven development of ocraft: the `ocraft-dev-plan` skill writes a sequenced weekly plan (`dev-plans/<date>-week.md`), then a dedicated **`dev-task` entry** executes *one* task per run on a branch (Agent SDK), gates on the task's acceptance check, and opens a PR for human review — never `main`, never auto-merge. Execution must be the `dev-task` entry, **not** `POST /api/ai-chat` (that endpoint is bypassPermissions + no-auth + localhost-only, must never do git/PR). Visual changes can be self-verified via the claude-in-chrome MCP (screenshots + DOM of the running editor) — the "eyes" already exist. Prereqs: `gh` installed + authenticated (`origin` is already set). Honest caveat: ocraft has no real test/behavior gate yet (only `node --check` + `npm run build` + screenshots), so PRs genuinely need human review until one exists.

- **Node test harness on the frontend (acceptance checks per node)** — the **literal blocker** for the autonomous dev loop above: today there is *no behavior gate*, only `node --check` + `npm run build` + a screenshot, so an AI PR is "edits hopefully," not "ships verifiably." A node script already *is* a runnable program in the browser (`runNodeCode` blob-imports it and hands it the `x` context — `useNodeScripts.js`), so a check is just another script that runs the node-under-test and asserts on its result. Make it a node: a **`test` node type** (or a `tests` body alongside a script) whose default export receives an `x.expect`/`x.assert` surface, calls `x.x("<target-id>")`, and passes/fails. A **harness panel** runs all checks for a node (or the whole store) in the browser and renders a green/red pass list — reusing `createScriptUi`'s log surface. Because checks are nodes, they're authored, versioned, and composed like everything else, and a future headless runner can execute the same `x`-context check with no `x.ui`. Open bits: where checks live (own type vs. paired body), the assertion surface (`x.expect(v).toBe(...)` vs. a thrown `x.assert`), **module mocking** (stub a dependency node's `x.x` return — already flagged under *Multi-project & tooling*), and how the dev-task entry shells a single node's checks headlessly to gate a PR. Plan: `plans/node-test-harness-plan.txt`.

- **`stream` node type (removed — reimplement later)** — the `stream` node type was removed (frontend `Stream.vue` preview, its type registration, and the `sample stream` node) to keep the type list to things that actually work. When revisiting, it needs two halves: (1) a real **frontend** editor/preview — the old one was a placeholder black canvas using the shared `Stage` chrome; and (2) a **backend run model** — today nodes are just stored JSON with no run semantics, so define how a stream node is configured and actually *executed* on the backend side.

- **`binary` node type — image / video / audio bodies.** A node whose body is **raw bytes**, not text: one polymorphic `binary` type that branches on a stored **MIME** (`image/*` → `<img>`, `video/*` → `<video>`, `audio/*` → `<audio>`) rather than three separate `image`/`video`/`audio` types — so "drop a file into the tree, it becomes an addressable node" stays one handler. This would be the first **non-text body**, and that's where the real work is: `NODE_BODY` (`runtime/apiServer.js:141`) already carries a per-type `{ file, contentType }`, but the body read/write path is hardcoded UTF-8 (`fs.readFile(…, 'utf-8')` on GET, `readText(req)` on POST), so binary needs a **Buffer** read/write path that serves raw bytes under the node's own MIME — essentially what the existing `/api/assets/` handler (`runtime/apiServer.js:73-96`) already does for the clipart dir, reused for a node body. A fixed per-type filename also doesn't fit variable media (`png`/`mp4`/`mp3`), so a binary node must store its `mime` (+ original ext/filename) in `state.json` and resolve the body spec from there — a concrete forcing case for the keystone's *"make `NODE_BODY` data-driven"* sub-item. Frontend: register `binary` in `NODE_TYPES` (`NodeItem.vue:30`) with a MIME-branching preview (the explicit *"no handler for type X"* card already exists — `NodeItem.vue:55-59` — so an unregistered `binary` degrades gracefully, not into a broken scene). The payoff for *"data and behavior share one tree"*: a binary node is callable — `x.x(id)` returns a blob URL / bytes — so a `scene2d` or `script` can pull in a sprite, sample, or clip **by node id** instead of an asset path, folding the `/api/assets/` pipeline into the node tree. It's also the storage substrate the **MediaRecorder capture** idea (under *New node types*) and the **pixel-art SVG** assets would write into. Honest caveats: node bodies are git-tracked, so video/audio will bloat the repo — needs a size cap, a git-ignore for large binary bodies, or LFS; `<video>` scrubbing wants **HTTP range requests**, which the body endpoint doesn't do today; and the overlap with the existing `/api/assets/` pipeline (supersede vs. coexist) is an open call. *Monetization:* no standalone angle — nobody pays to "store an image"; it's enabling infra. It *enables* the **paid asset/template packs** already on this roadmap (media-as-nodes is the format those ship as) and, only if ocraft ever goes hosted, a natural **storage + bandwidth metering** line — moot while single-user/local. Don't charge for it directly. *Marketing:* highly demoable — a ~20s clip: drag a sprite / loop / clip into the tree → it's now a node → a scene pulls it in by `x.x(id)`. Hook: *"every file is just a node."* Pairs with the generative-art wedge and the MediaRecorder demo.

- **Node / script versioning (version-on-save)** — saving a node script overwrites it today. Instead, each save could write a new version (keep history, allow diff/rollback) rather than clobbering the previous one. (From the old Varcraft notes — "need fx versioning, i.e. a new save.")

- **Script code editor (CodeMirror 6)** — the script editor is a plain `<textarea>` today (`Script.vue:152`); the README's "a code editor for scripts" is aspirational. Swap in **CodeMirror 6** for line numbers, JS syntax highlighting, bracket matching, and auto-indent — tens of KB, no web-worker setup. (vs. **Monaco** — VS Code's editor, full IntelliSense but multi-MB with fiddly Vite worker config; overkill for a single-user local tool whose bundle is already ~1.5 MB. Ultra-minimal alt: `CodeJar + Prism`, but CM6 is the better long-term base.) The same component could later back the HTML source view and a custom **`yo`** language mode. Build order: highlighting + line numbers first, then the load-bearing follow-up — **autocomplete on the `x` API** (`x.x()`, `x.ui`, `x.auth`) via a CM6 completion source. *Monetization:* no standalone angle — table-stakes polish, not a paid feature; only matters as baseline if ocraft ever becomes a hosted "scriptable node OS." Don't charge for it. *Marketing:* highly demoable — a before/after clip (textarea → highlighted editor), but the killer artifact is `x`-API autocomplete, which shows off the "a note that *is* a program" differentiator far better than generic highlighting. Fits the YouTube content plan.

- **`yo` as a node scripting medium** — `js-engine/` already holds `yo`, a tiny async-first toy interpreter (lexer → parser → evaluator, `@`-keyword syntax). It could grow into an embeddable, sandboxed scripting medium for nodes (a safer alternative to raw-JS `script` nodes), or a symbolic medium for the generative-art experiments below.

- **Sandboxed execution with resource limits** — node/entry scripts currently run with full Node access. Run them in an isolated environment (container or VM) with disk / memory / CPU caps, so an artifact can't take down the host. Pairs with the `yo` sandbox idea above, and the DO droplet is a natural place to run isolated workers. (From the old Varcraft notes — the original vision already assumed containerised, resource-limited module execution.)

- **Process control / supervisor — extend coverage** — `runtime/serviceManager.js` supervises **services** (per-service config files in `runtime/services/`, reusing `withLock` + the `state/` store, with rotating logs). The `api` server, frontend, **scheduler** (now a `scheduler-loop` daemon), and ticker are all services under it. Remaining: bring the **MCP servers** under the same start/stop/restart/status/log unit — caveat: stdio MCP servers can only be supervised standalone unless moved to HTTP/SSE transport. Also still missing: real crash-restart / health — `autoRestart` is declared on a service config but not yet acted on.

- **Process-management UI + live resource monitoring** — `serviceManager.js` is backend-only; there's no way to start/stop/restart services or watch them from the editor. Add a frontend page that lists services with their status, tails their logs, and shows live RAM / CPU usage per service. (From the old Varcraft notes — "a page for managing app processes... and query RAM and CPU.")

- **Cloud WebSocket exchange** — a hosted relay/broker that exchanges WS messages between the backend, the editor, and future clients. This is the "cloud" the Flutter mobile-control idea needs — the hub that lets cloud code drive a mobile app. The exchange shipped on **Deno Deploy** (`wss://stream.x8.deno.net/ws`), so the open part is only the *design*: pub/sub topics vs. direct routing, auth, and whether the local backend is the origin or just another client. A deploy plan for the Deno service lives in `plans/deno-deploy-mcp-plan.txt`.

- **Integrate `stream.x8.deno.net` (the live WS exchange) into ocraft** — the cloud WS relay now *exists* as a deployed endpoint: `wss://stream.x8.deno.net/ws` (on **Deno Deploy**). Next step is wiring it into the stack: the local backend connects as a **client** and publishes node / proc / execution events; the editor **subscribes** for live updates (replacing the poll-based proc UI and chat-node streaming); future clients (the Flutter/mobile idea) join the same hub. Open before that: the message protocol (pub/sub topics vs. direct addressing) and auth. Already have a **`websocket-tester` script node** (id 11, under `test`) for poking the endpoint — a connect/send/log panel built with the `x.ui` script-controls surface.

- **Restore (or rethink) the deploy target — the DO droplet is gone.** Deploy is wired through GitHub Actions (`.github/workflows/ci.yml`, on push to `main`): it SSHes into `secrets.DEPLOY_HOST` (the DigitalOcean droplet), writes `.env`, `git pull`, `npm install`, then `node bin/cli.js run deploy` (the `deploy` task = git pull under the scheduler lock). **It's currently broken** — the droplet behind `DEPLOY_HOST` was destroyed, so every push fails at the SSH step (`runtime/state/droplet.json` holds only a `{region, size}` spec, nothing live). The `do-droplet-up` entry (or the DigitalOcean MCP `do_create_droplet`) re-provisions a box end-to-end (create → ssh → install Node + git → clone repo), but re-running it alone won't restore deploy — gaps to close: (1) a fresh droplet gets a **new IP**, so `DEPLOY_HOST` would change each rebuild — wire a **reserved IP** (the DO MCP has the tools) to keep it stable; (2) **node-path mismatch** — `ci.yml` hardcodes an nvm path (`/root/.nvm/.../v25.8.2`) while `do-droplet-up` installs Node via NodeSource/apt (`/usr/bin/node`), so align one side; (3) **no scheduler provisioning** — `do-droplet-up` clones the repo but never starts the `scheduler` service (`node bin/cli.js service start scheduler`) or writes a persistent `.env`, so scheduled tasks won't run. Bigger question first: **does an always-on DO droplet still earn its place** now that the WS exchange moved to **Deno Deploy** — DO droplet vs. Deno Deploy vs. dropping the persistent box entirely?

- **More MCP servers to build** — beyond telegram + gcal + gmail, the life-management loop still lacks _hands on its own machinery_ (its _memory organ_ is now the migrated notes-as-nodes, so that gap is closed):
  - **ocraft self-MCP** — expose the scheduler/nodes/serviceManager as tools (`list_jobs`, `run_task`, `service_status`, `tail_execution_log`, `search_nodes`, `create_node`) so Claude can _operate_ the system, not just edit its files. Now that the notes live as nodes, this is also the "remember" organ — searching/appending a note _is_ a node op, the durable home every other MCP's summaries need. The real driver is the headless side (the scheduler + a chat-node "brain"), which can't borrow an interactive Claude Code session's Read/Grep/Edit and so needs these as tools.
  - **Music** — _probably not worth a dedicated MCP._ For playback control the claude-in-chrome extension already drives the Spotify/Apple Music web player. An API MCP would only pay off for the data side (listening history, building playlists as data) — a weaker need. Park it; revisit if the history/logging use case becomes real.

- **World mirror — real-world objects as nodes (digital twins / life inventory).** Mirror the *things in your actual life* — a Telegram chat, a PlayStation game, an Apple-Watch/wearable, a piece of clothing, any possession — as addressable nodes, so the tree becomes a **queryable model of your world**, not only notes-and-programs. The pitch is **GTA5 for real life**: a pause-menu-style navigable inventory where every real object you own or touch is a node you can open, compose against (`x.x(id)`), and automate on. This is the **concrete embodiment of the [Direction](#direction)** (node tree = durable memory, scheduler = *when*, MCP = I/O channels), not a new architecture.

  Honest grounding — the seed already exists: the data plane is type-agnostic (any `type` string, addressable at `/node/:id`), the **telegram-mcp + `telegram-poll` task** already pulls a real external entity on a cadence, and the scheduler is the sync engine. A "twin" is just a node whose `state.json` carries an **identity** (`source`/provider, external id, `lastSyncedAt`) plus a mirrored snapshot, kept fresh by a **per-source sync task**. So this splits cleanly into two layers with very different cost: **(1) manual inventory** — possessions you just catalog as nodes (wardrobe, gear, books); works *today*, no connector, and the **`binary` node type** (on this roadmap) gives each item a photo/video body; **(2) connected twins** — nodes that mirror a *live* source via an MCP/API + scheduled poller. Layer 1 is nearly free; layer 2's cost is **one bespoke connector per source**, so this scales with sources, not with a generic "connect any object" trick.

  Source reality, honestly: **Telegram** — already have the MCP, smallest real instance (a chat → a node). **PlayStation** — only **unofficial** PSN APIs (psn-api / psnawp): owned games, trophies, presence — usable but ToS-risky and brittle. **Wearables** — depends on brand: Fitbit/Oura/Whoop/Garmin have real cloud APIs; **Apple Watch / Health has no clean server API** (HealthKit is on-device — needs a Shortcuts export bridge), so the Apple case is the hardest. Build order: ship **layer 1 + the twin convention** first (a `source`/`lastSyncedAt` shape in `state.json` + a generic "synced from X, N ago" badge), then prove **layer 2 with Telegram** (the connector already exists), then add one connector at a time (Oura/Fitbit before PSN before Apple). Open bits: a **twin is a read-only mirror** vs. writable (start read-only); the **staleness/refresh** model (poll cadence per source + a manual "sync now"); and whether twins get a dedicated `type` or are a `category`/`html` convention carrying twin metadata (lean convention-first, promote to a type only if the render diverges). Cross-links: the connectors are **MCP-shaped** (ties to *ocraft self-MCP* + *More MCP servers*), photos ride the **`binary` node type**, and "a real object is just a node id" is the same spirit as *Distributed node OS* ("an ip is just an object key"). Privacy caveat: this concentrates a lot of personal data into one tree — **single-user / local only**, never exposed. Plan: `plans/world-mirror-real-world-nodes-plan.txt`.

  *Monetization:* no honest standalone angle — it's deeply personal/single-user, and the connectors are pure cost (build + maintain per source), not a sellable unit; if ocraft ever goes hosted, the always-on pollers are a natural **metering line**, moot while local. The one real-money-adjacent niche is **home-inventory-for-insurance** (the Sortly/Encircle market) — shippable as a paid **inventory template pack** (rooms → items → photos → value), but that's a stretch from the core; don't build it *for* money. Its true value is as the **killer demo** that sells the whole life-OS narrative. *Marketing:* the most evocative pitch ocraft has and highly recordable — a screen-capture navigating the tree (open *PlayStation* → live games + trophies; *Telegram* → recent messages; *Apple Watch* → today's rings; *Wardrobe* → photos) under the hook **"I turned my real life into an explorable world, like the GTA5 menu."** Strong *Show HN* ("a node OS that mirrors my actual life") + X/YouTube devlog material; pairs with the binary-node and command-bar demos.

- **HTTP/3 (QUIC) for the backend API server** — Node.js landed a native QUIC + HTTP/3 implementation in **v26.2.0** via the `node:quic` module — HTTP/3 over `nghttp3`, activated when the negotiated ALPN is `h3`. Still **experimental** (Stability 1.0) behind the `--experimental-quic` runtime flag. Idea: serve `runtime/apiServer.js`'s `/api/*` over HTTP/3. Honest caveat: it's a **localhost dev server**, so HTTP/3's real wins (no head-of-line blocking + connection migration over lossy networks) don't apply here, and QUIC mandates TLS 1.3 — so it'd need certs + UDP where today it's plain HTTP. This is a **learning exercise**, not a perf need; the pragmatic production path is to terminate HTTP/3 at the edge (CDN / nginx 1.25+ with QUIC) and speak HTTP/2 to the Node origin, advertised via `Alt-Svc`.

- **Pixel-art SVG assets for scenes** — integrate a set of pixel-art sprites/clipart as **SVGs** that `scene2d` nodes can drop in as elements, extending the existing clipart-SVG pipeline (assets in `data/assets/img/`, served via `/api/assets/`, loaded by the p5 renderer — see `runtime/apiServer.js`). Pixel art as SVG stays crisp at any zoom and is tiny + diff-able in the repo (vs. raster sprite sheets), and composes cleanly as scene elements — a natural medium for pixel-art scenes that pairs with the generative-art direction below. Open bits: a small picker/library in the scene editor, and whether to author the sprites by hand, generate them, or import a set.

- **Generative art** — treat Claude as a *performer with an instrument*, not a coder: pick a symbolic medium → give it a render-and-return tool so it perceives output → iterate tight ("darker, slower, more space"). Two routes: **embed the medium as a node** (a script node hosts the language and plays/renders inline), or **drive an external pro tool** over OSC/MIDI. Could become creative `stream`/`chat` node types.
  - **Audio** — *embed in a node:* **Strudel** (TidalCycles-style pattern code, runs in-browser — output-only, you're the ear), **SuperCollider** (synthesis driven via `sclang`/OSC), **Sonic Pi** (OSC bridge). *drive a DAW:* **Ableton Live** toward minimal techno with glitch artifacts — Claude generates MIDI / clips / automation, you mix. Generative MIDI: scale constraints, Euclidean rhythms E(5,8), Markov chains over scale degrees, L-systems → pitch.
  - **Video / visuals** — *embed in a node:* **Hydra** (browser livecoding, '70s feedback looks), GLSL shaders (plasma, FBM domain warp, LFO pulse), FFmpeg feedback pipelines (datamosh), reaction-diffusion / cellular automata / flow fields. *drive an external env:* **Jitter** (the video side of **Max/MSP**) over OSC.
  - **Creative MCP tools** (give it eyes/ears via the return value) — `play_osc` → SuperCollider/Sonic Pi; `eval_hydra` → screenshot back so it self-corrects; `render_shader` → PNG for closed-loop critique; `send_midi` → Ableton/hardware; `dmx_set` → stage lighting; `plot(expr)` → generative geometry.
  - Meta-recipe: symbolic medium + render-and-return tool + creative constraints (scales, Euclidean, L-systems, feedback, decade aesthetics) + tight iteration.

- **Distributed node OS / location-transparent execution** — extend node addressing across machines: a node id can resolve to another networked machine, `x.x(id)` becomes an RPC, and the store unifies RAM + disk + remote as one namespace ("an ip is just an object key"). The client never controls *where* code runs — it visits the site and just monitors execution. Pairs with **HTTP imports** (import a node/module by URL) and a **transferable UI** (the browser UI as a movable process). *(Distilled from the old varcraft tech-ideas note — as are the items below.)*

- **Command-first / terminal interface** — a **web terminal** in the editor to drive the node OS by typed commands, with text / voice / natural-language as a first-class command surface so the GUI becomes optional ("why have visuals if you can command the system by text/voice — purely for buttons and forms?"). This is the "terminal-first device" direction. **MVP shipped:** a slim **command bar** (`CommandBar.vue`, mounted above the node view in `App.vue`) backed by a tiny `COMMANDS` registry — type a command, Enter runs it, a short scrollback echoes the result. First (and only) command: `minimal-txt [id]` — compress the open node's (or `#id`'s) html note in place as a tracked `/api/runs` job, migrated off the per-node Html button so the action lives in one place. **Next, growing the registry into the feature switcher:** `open <id>` / `new <type>` / `run <id>` (invoke a script node through the existing run path) / `search <q>`, a `help` listing, a focus hotkey (⌘K or backtick), then the load-bearing step — **natural-language fallthrough**, where an unrecognized line is handed to an AI run that maps intent → command. *Monetization:* no direct angle — it's a power-user accelerator, not a sellable unit; indirectly it's the surface a hosted/paid tier would meter "AI command" usage behind. *Marketing:* very demoable — a screen recording of driving the whole OS by typing ("create a node, run a script, compress a note — no mouse") is the canonical terminal-first hook, and pairs with the voice-dictation item for a text-or-voice command demo.

- **Tabs — open several nodes at once.** Today the editor shows exactly one node (`/node/:id` → a single `NodeItem` in the content pane); opening another replaces it. Add an editor-level **tab strip**: each open node is a tab, selecting a tree node opens/activates its tab, middle-click / ✕ closes one, and the active tab drives the route. Keeps multiple nodes live side-by-side in a workflow (a note next to the script it documents; a scene next to its run monitor). Open bits: where tab state lives — a small Pinia slice (`openIds[]` + `activeId`, with the route mirroring `activeId`) vs. leaning on route history; whether tabs survive reload (persist `openIds` to `localStorage`); **keep-alive** so a tab's editor/scene keeps its in-progress state when you switch away; and whether a later **split view** (two tabs visible at once) earns its keep or is scope creep. Pairs with the command bar (`open <id>` opens a tab) and is the prerequisite for any side-by-side compare/diff. *Monetization:* none directly — table-stakes editor ergonomics. *Marketing:* mild — a "multi-tab node workspace" clip; mostly it removes a friction wall, not a standalone hook.

- **Voice dictation hotkey (`dictate.sh`)** — system-wide speech→text built on the already-cached whisper.cpp model. `~/.local/bin/dictate.sh` (subcommands `start`/`stop`/`toggle`/`cancel`) does ffmpeg mic capture → `whisper-cli -mc 0` → clipboard + ⌘V paste. This is the "fake audio" workflow from Karpathy's *How I Use LLMs* — dictate into *any* app, not just the LLM box. **Remaining: bind it to a hotkey.** Toggle route (no extra app): macOS **Shortcuts** "Run Shell Script" → `dictate.sh toggle` + an assigned key. True **push-to-talk** (hold-to-talk) needs key-down/up events → Hammerspoon or Karabiner. Could later become ocraft's own voice command surface — ties into *Command-first / terminal interface* above.

- **Pi 500 as a hardware ocraft device** — Pi 500 = Pi 5 in a keyboard: 8gb, GPIO exposed, no internal NVMe (USB3 SSD boot = much faster; SD dies under server writes). light-desktop only — no Ableton/Adobe, weak 4k video, no 40-tab browser. ways to use it: **boot into ocraft** — kiosk Chromium → Vue editor, api+scheduler+MCP local; the keyboard *is* the node OS — the hardware embodiment of *Command-first / terminal interface* above. **livecoding instrument** — the *Generative art* visual mediums (Hydra/GLSL etc.) on the box → projector = whole VJ rig. **generative-MIDI brain** — run *Generative art*'s MIDI engine (Euclidean/Markov/L-system) on the pi → MIDI over USB into Ableton (Mac) or hardware (new part: it runs on dedicated hardware). **writing appliance** (for «Майже») — bare WM + Helix/Pandoc/Git, no browser, Syncthing to other devices; one machine, one job. **desktop with hands** — GPIO out: NeoPixel/DMX/e-ink reacting to ocraft events or audio, an encoder bank for live Hydra params (extends *Generative art*'s `dmx_set` to physical GPIO). **whole desktop in a bag** — keyboard + any HDMI + USB-C battery = your exact env anywhere (café rig). **always-on server + keyboard** — Gitea/Syncthing/MCP-bots/scheduler 24/7, desktop when you sit. **swappable-soul drives** — separate boot cards (dev / writing / livecoding / secure); keyboard = substrate, cards = node-types, same split as ocraft.

- **Deeper process model** — beyond start/stop/logs: live process **introspection** (inspect a running process's active timeouts / intervals / promises), and **snapshot / clone / migrate** a process's full state including closures ("loading process state from a process"). Plus a reactive **atoms/signals** primitive (value + compute-fn, tracked deps, cascade updates, consistent on error), and long-term a bytecode/opcode **VM** under the runtime ("bytecraft").

- **New node types** — an **outliner** (nested structured lists, vertical↔horizontal toggle), a **table editor**, an **append-only capture** note (write-once — can't edit or move what's written), and **in-browser media capture** (`MediaRecorder` → record audio/video/screen as a node, with a ~10 s preview/scrub).

- **Node-model refinements** — event **bubbling** up the `parentId` chain (DOM-style, distinct from the peer event-bus); infer/constrain a node's type from its descendants' types; and **git-backed nodes / subrepos** (a subtree backed by a real git repo, importable as a versioned module — beyond per-body versioning).

- **Backlinks (derived `[[…]]` index)** — show "what links here" for a node. **No new schema and no edge store:** scan node bodies for `[[id]]` / `x.x("id")` references, build a reverse index (`Map<to → from[]>`) at startup, refresh only the saved node's entry on each save; a backlink query is then a lookup, not a full scan (the scan survives only as a `reindex` rebuild routine). This is deliberately the *only* slice of the broader "typed edges beyond `parentId`" idea worth doing now — a **graph view** and a **stored `depends-on` edge model** are explicitly out of scope (see *Rejected / out-of-scope* below).

- **Multi-project & tooling** — multiple projects/workspaces, each publishable to its own domain; **CDP-based devtools** (build browser inspection/automation on the Chrome DevTools Protocol); and module **mocking** for the test harness.

- **Productization, monetization & go-to-market** — the *Monetization & marketing lens* applied at the whole-project level: how ocraft earns and reaches people, as a business *and* as open source. Researched plan: `plans/product-monetization-gtm-plan.txt`. Load-bearing facts: **(1) the binding constraint is geography, not pricing** — a Ukraine-resident individual can't receive GitHub Sponsors / Ko-fi / Liberapay / Buy-Me-a-Coffee / Polar (all ride Stripe Connect or PayPal-receive, neither of which operates in Ukraine). The only zero-setup rails are **Patreon → Payoneer** (recurring) and **Open Collective → Wise** (project funding; repo must sit under a GitHub *org*), so `.github/FUNDING.yml` points at those, never a bare `github:` button; selling digital products via Polar/Gumroad/Stripe needs a **foreign entity** (Stripe Atlas US LLC / EU Ltd). **(2) Model = bootstrap, don't take VC** — the proven shape for a local-first niche tool is Obsidian/Excalidraw: free MIT core as the funnel, sell a thin paid layer (scene/template/sprite **packs** — the Tailwind→Tailwind UI move that the generative-art / pixel-art-svg / binary-node items are the format for; an Obsidian-style ~$50/yr **commercial license**; a tldraw-style **SDK/watermark license** later). Open-core SaaS is parked (MIT is the most clonable license). Cautionary tale: *Dendron* (free self-hostable PKM + $2M VC → no PMF + burnout → dead, no fork). **(3) Audience precedes money** — median Sponsors income ≈ $0 and stars don't convert, so build an off-GitHub audience first (X demo clips — ocraft is unusually demoable — + a devlog/email list), then *Show HN* ("a local-first node OS you can run and inspect"), then a digital pack. *Open caveat:* confirm Open Source Collective actually pays a Ukraine resident via Wise (plausible, not officially documented) before relying on it.

> Recently shipped (kept for context, nothing left to do): full **CRUD + nested nodes** in the editor (create/rename/delete/drag-reparent, `category` folders, undo pool, child-guarded delete); **scripts calling other scripts** by id (`x.x("5", args)`).

## Rejected / out-of-scope — don't re-propose

Ideas considered and deliberately set aside. Listed here so feature-generation passes (and AI dev plans) **don't resurface them**. When an idea gets cut, add it here with a one-line *why*; move an item back up to the Roadmap only if its stated reason no longer holds.

- **Graph view of the node web** — *rejected (not wanted).* The `parentId` tree + derived backlinks cover the need; a force-directed/visual graph of nodes is not a goal.
- **Dependency-aware scheduling / stored `depends-on` (typed) edges** — *parked (not now).* Only earns its place once there are real multi-step task chains (e.g. `fetch-email → summarize → post-digest`). The cost of a stored edge model isn't justified before then — revisit when such chains actually exist. (Backlinks, which need no stored edges, are kept on the Roadmap above.)
