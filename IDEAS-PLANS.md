# IDEAS — Implementation Plans

Companion to `IDEAS.md`. One plan per idea, in the same order. **This is not a
spec** — same contract as `IDEAS.md`: confirm before building, and treat every
"Phase" as a proposal with decision points, not a settled commitment. Where a
choice is genuinely open (sandboxing strategy, the cloud relay's shape) the plan
maps the *forks* rather than pretending the decision is made.

Plans are **tiered by how concrete the idea actually is**:

- **Build-ready** — code-adjacent, real file touchpoints, phased steps you could
  start tomorrow.
- **Design-open** — the work is mostly deciding; the plan maps the decision
  space and prerequisites.
- **Spike** — research/learning; the plan is "what to try and what would tell
  you it's worth more."

---

## Dependency / build order

The highest-value thing this doc adds over `IDEAS.md` is *what unlocks what*.
Suggested order (foundations → leaves):

```
1. Node lifecycle & editor          2. Operational backbone
   ├─ CRUD DELETE + UI                 ├─ Supervisor coverage
   ├─ Versioning-on-save               │     └─ Process-management UI
   ├─ Scripts-calling-scripts          └─ ocraft self-MCP
   └─ Backend stream run-model               (exposes scheduler/nodes/procs)

3. Brain & memory                    4. Cloud & mobile
   ├─ ThinkTank MCP (durable home)      ├─ Cloud WS exchange
   ├─ Chat node ("brain" endpoint)      │     └─ Flutter mobile control
   └─ Daily briefing                    │
        (= MCP inputs + brain +         5. Execution safety
           ThinkTank memory)               ├─ yo as node medium
                                           └─ Sandboxed execution

6. Exploratory: WASM · Generative Art (Music / Visuals / Creative MCP tools)
```

Key edges:
- **Daily briefing** is a *composition* — it needs the MCP inputs (have them),
  a judgment step (chat node / self-MCP / cloud code), and a durable home
  (**ThinkTank MCP**). Don't start it until those three exist.
- **Chat node** needs a "brain" endpoint; the brain gets *good* once **ocraft
  self-MCP** lets it operate the system.
- **Flutter mobile** is blocked on the **cloud WS exchange** existing first.
- **Process-management UI** sits directly on **supervisor coverage**.
- **Sandboxed execution** pairs with **yo as a node medium** (a safe interpreter
  is one isolation strategy among several).

---

# Learning goals

## WebAssembly (WASM) — *Spike*

**Goal.** Learn WASM fundamentals and find the one place in this workspace where
it earns its keep, rather than adopting it abstractly.

**Status today.** No WASM anywhere. Candidate homes: compute-heavy work in the
p5 scene renderer (`frontend/src/components/NodeItem/editors/`,
`renderSceneP5.js`), or sharing one implementation between backend and browser.

**What to spike (a weekend, in order):**
1. Hand-write a tiny `.wat` (e.g. a noise/FBM function), compile with `wat2wasm`,
   load it in a throwaway HTML page — just to feel the memory/import boundary.
2. Take **one** real hot path — a per-pixel effect like `grain` in
   `renderSceneP5.js` — and reimplement it in Rust or AssemblyScript compiled to
   WASM. Benchmark against the JS version at the scene's real resolution.
3. Try the "shared code" angle: a pure function (e.g. a scale/Euclidean-rhythm
   helper the Generative-Art ideas want) compiled once, called from both
   `backend/` and `frontend/`.

**What tells you it's worth more.** A >3× speedup on a path you actually re-run
each frame, *or* a genuinely painful duplication that WASM removes. If neither
shows up, park it — WASM is a cost (build step, debugging, glue) that needs a
concrete payoff. Most likely verdict for this codebase: interesting, not urgent.

**Effort/risk.** Low effort to spike, low risk; the trap is adopting it without a
hot path that needs it.

---

# Project ideas

## Flutter for cloud-driven mobile control — *Design-open (blocked)*

**Goal.** A Flutter mobile app driven from "cloud code" — trigger actions, push
state, receive commands from the backend — closing the life-management I/O loop
with a real phone client.

**Status today.** Nothing built, and **hard-blocked on the cloud WS exchange**:
"driven from cloud code" requires the hosted relay to exist first so the phone
isn't trying to reach a sleeping laptop. Until then this is unbuildable as
specified.

**The fork is what the app actually *is*:**
- **(a) Thin remote/control surface** — buttons/notifications that send commands
  and show pushed state (the briefing, proc status, a node's output). Smallest;
  the phone is a dumb terminal for cloud code. Recommended first form.
- **(b) Full editor client** — the Vue editor's capabilities on mobile. Large; a
  second front-end to maintain. Defer indefinitely.

**Plan (assuming (a), and *after* the cloud WS exchange ships):**
1. **Contract first.** Define the message schema the app speaks over the WS
   exchange — the same topic/command protocol the exchange settles on. The app is
   just another authed client.
2. **Minimal app.** Flutter app: connect to the relay with a token, subscribe to
   a "mobile" topic, render pushed cards (briefing, alerts), send command
   messages (run entry, ack reminder). Push notifications via FCM mapped to relay
   events.
3. **Grow by need.** Add screens only as concrete flows appear (acknowledge a
   briefing, trigger a scheduled entry, glance at proc health).

**Open questions.** Flutter is a new toolchain in this JS-only workspace —
worth the learning cost vs. a PWA wrapping the existing Vue app over the same WS?
(A PWA reuses everything; Flutter buys native feel + better notifications.)
Settle this before writing Dart.

**Dependencies.** **Hard:** cloud WS exchange (transport) — do not start before
it exists. **Soft:** daily briefing / proc UI / self-MCP supply the *content* the
app displays and the *commands* it sends.

**Effort/risk.** High — new language, new platform, networked + authed. Lowest-
risk path: prove the loop with a PWA over the WS exchange first; only reach for
Flutter if native notifications/feel become the actual requirement.

## Backend run model for `stream` nodes — *Build-ready*

**Goal.** Give the backend a real notion of what it means for a `stream` node to
"run" — today `sample-stream` is just stored JSON, identical to any other node.

**Status today.** `frontend/.../editors/StreamEditor.vue` exists; the
`sample-stream` node has `type: "stream"` state. The backend only stores/serves
it (`server.js` node routes). There is no executor path for streams — the
executor (`backend/executor.js`) only knows `entries/<name>.js` modules, and the
scheduler (`scheduler.js`) only knows its hardcoded `jobs[]`.

**Decision first (one fork to settle):** what *is* a stream?
- **(a) A scheduled producer** — emits values/events on a tick (e.g. a sensor, a
  feed poller, a sequencer step). Fits the existing scheduler/executor model.
- **(b) A long-lived process** — holds an open connection and pushes
  continuously. That's a *proc*, not an *entry* — belongs under `procManager`.

Recommend starting with **(a)**; it reuses everything and (b) can come later as
"promote a stream to a proc."

**Plan (assuming (a)):**
1. **Define the contract.** A stream node's `state.json` gains a `run` block:
   `{ source, intervalMs, transform }`. Decide the minimal source kinds first
   (e.g. `interval`, `http-poll`).
2. **Executor path for nodes.** Add `executeNode(id)` alongside `execute(name)`
   in `executor.js` (or a sibling `nodeExecutor.js`): load the node's
   `state.json`, run its `run` block, append outputs into the node's own state
   or an `executions/`-style log. Reuse the `ctx` shape (`log`, `state`, `time`).
3. **Scheduling.** Either teach `scheduler.js` to discover stream nodes
   (scan `data/nodes/*/state.json` for `type:"stream"` with a `run.intervalMs`)
   and run them, or register them as `jobs[]` entries. Discovery keeps it
   declarative.
4. **Surface results.** `StreamEditor.vue` reads the latest emitted values via a
   new `GET /api/nodes/:id/stream` (or just from the node state it already
   loads) and shows a live tail.
5. **CLI.** Add `node cli.js run-node <id>` for manual runs, mirroring `run`.

**Open questions.** Where do stream outputs live — capped ring buffer in the
node's state, or separate per-node execution files (like `backend/executions/`)?
How does a stream feed *another* node (ties into scripts-calling-scripts)?

**Dependencies.** Light overlap with **supervisor coverage** (for fork (b)) and
**scripts-calling-scripts** (stream as an input to other nodes).

**Effort/risk.** Medium. The risk is over-modeling — ship `interval` source +
ring-buffer output first, generalize once a second real source appears.

---

## Scripts calling other scripts by id — *v1 shipped*

**Goal.** Let a `script` node invoke another node's script so nodes compose
instead of duplicating logic.

**Decided & built (v1).** Reference is the **bare flat id** — no path, no alias,
no manifest, no resolver. (The path/alias designs were considered and dropped:
paths are fragile on rename/move and need repair; aliases are just another
mutable name to maintain. The flat numeric id is globally unique, so it *is* the
whole address.) Shipped:
- **`composables/useNodeScripts.js`** — the runtime. A script is
  `export default (x) => {…}`; the `x` context exposes `x.args`, `x.log`, and
  **`x.x(id, ...args)`** to run another node's script by id (awaited return).
  Module load is cached by id (cleared on save), with cycle detection
  (`x.x` re-entry on an id already on the call stack throws).
- **`ScriptEditor.vue`** — threads `x` into the run (backward-compatible with old
  no-arg scripts); an **"Insert call" picker** lists script nodes by *name* and
  inserts `x.x("<id>")` — name shown only at authoring time, only the id is
  stored. Frontend-only (node scripts run in the browser via blob import).
- Demo nodes `8` (greeter) / `9` (caller) exercise the chain.

**Deferred.**
- **Inline live-name hint** — render the target's *current* name next to the id
  *inside* the editor. Needs a real code editor (the `<textarea>` can't draw
  non-editable pills); that's the CodeMirror 6 step. The picker covers
  authoring-time readability for now.
- **Backend mirror** — a matching `x.x` for headless node execution. Not needed
  until the chat-node/daily-briefing brain runs node scripts server-side; the
  `x` shape was kept simple so it can be reimplemented then.

**Dependencies.** Foundation for **chat node** brains and **daily briefing**
composition. The `x.x` boundary is the natural seam where **sandboxed execution**
later plugs in (args/returns become a serialization contract once a call crosses
a sandbox).

---

## CRUD nodes from the frontend + nested nodes — *Build-ready*

**Goal.** Full create/read/update/delete of nodes from the editor UI. This is
the most shovel-ready item.

**Status today.** Read ✓ (`GET /api/nodes`, `:id`). Update/create ✓ — `POST
/api/nodes/:id` already does `mkdir -p` + write, so it upserts. Nesting ✓
(`parentId` + `category` type, `tree` in the store). **Missing: a DELETE
endpoint, and UI to create/rename/delete/reparent.**

**Plan:**
1. **Backend DELETE.** Add `'DELETE /api/nodes/:id'` to the `routes` object in
   `server.js` (the `matchUrl` matcher already supports any method). Decide
   child handling: refuse if `childrenOf` is non-empty, or cascade. Recommend
   **refuse-with-409** first (safe), cascade later behind a flag. `rm -rf` the
   node's `data/nodes/<id>/` folder.
2. **Store actions.** In `stores/nodes.js` add `create({type, parentId})`,
   `remove(id)`, `rename(id, name)`, `reparent(id, parentId)` — each calls the
   API then mutates `nodes.value` reactively (the `toggleCollapsed` action is the
   existing template for optimistic local mutation + persist).
3. **Create flow.** New-node needs an id. **Decided:** ids are minimal opaque
   numbers — the next free integer as a string (`"1"`, `"2"`, … starting at 1,
   never 0), minted by scanning `data/nodes/` for the max existing numeric folder
   and adding one. Stored as a **string** (folder names are strings, and
   `parentId === id` comparisons must match). The id is **never** derived from
   the display name, so renaming never touches the folder. (Existing nodes were
   migrated to this scheme.) A `POST /api/nodes` (no id) mints server-side; the
   freeform name lives only in `state.json`.
4. **UI.** In `NodeTree.vue`: a "+" on category rows (create child), context menu
   or row actions for rename/delete. Confirm-on-delete. Drag-to-reparent is a
   stretch goal (updates `parentId`).
5. **Guardrails.** Don't let delete orphan children silently; don't allow a node
   to become its own ancestor on reparent (reuse the cycle guard).

**Resolved.** id is immutable and opaque (a numeric string, `"1"`, `"2"`, …);
`name` is a separate display field. Rename only mutates `name` — never the folder
— so there are no cascading id rewrites and no slug-collision problem. This also
informs versioning below (versions key off the stable id, not the name).

**Dependencies.** Pairs with **versioning-on-save** (both touch the node write
path). Unblocks nothing hard but makes everything else nicer to use.

**Effort/risk.** Low–medium, low risk. Cleanest first PR in the whole list.

---

## Node / script versioning (version-on-save) — *Build-ready*

**Goal.** Saving a node/script writes a *new version* instead of clobbering, with
history + diff/rollback. (Varcraft: "need fx versioning, i.e. a new save.")

**Status today.** `POST /api/nodes/:id` and `POST /api/nodes/:id/script`
overwrite in place (`fs.writeFile`). No history.

**Decision first:** storage strategy —
- **(a) Git-backed.** `data/nodes/` is already a folder tree; commit on each
  save. Free diff/history/rollback, but couples the data store to a git repo and
  makes every save a commit (noisy).
- **(b) App-managed versions.** Write `data/nodes/<id>/versions/<timestamp>.json`
  (and `.js`) on each save, keep `state.json` as the HEAD pointer. Full control,
  no git dependency, fits the existing file-store idioms (mirrors how
  `backend/executions/` and proc logs already rotate).

Recommend **(b)** — consistent with the codebase's "plain JSON files in folders"
philosophy and the 500-file rotation pattern in `storage.js`.

**Plan (assuming (b)):**
1. **Write path.** In `server.js`, before overwriting, copy current
   `state.json`/`script.js` into `versions/<ISO-ts>.{json,js}`. Cap count
   (reuse the rotation idea from `storage.js`).
2. **List/read.** `GET /api/nodes/:id/versions` → list; `GET
   /api/nodes/:id/versions/:ts` → one version.
3. **Restore.** `POST /api/nodes/:id/restore/:ts` → copy that version back to
   HEAD (which itself snapshots current first — restore is just another save).
4. **UI.** A "history" affordance in the editor: list versions, diff against
   HEAD (a JS/JSON diff view), one-click restore.
5. **Scope decision.** Version on *every* save (simple, noisy) vs explicit
   "snapshot" button vs debounce/coalesce rapid saves. Recommend coalesce: only
   snapshot if >N seconds since last, or content materially changed.

**Open questions.** Diff granularity for scene `state.json` (structural JSON
diff vs raw text)? Retention policy (keep last N, or last N + daily)?

**Dependencies.** Shares the write path with **CRUD** — do CRUD first, then layer
versioning onto the same save action.

**Effort/risk.** Medium, low risk. Self-contained; no other idea blocks on it.

---

## Chat node type — *Design-open*

**Goal.** A node whose editor is a chat thread (messages + pinned input, like web
Claude); a `POST /api/nodes/:id/chat` endpoint is the "brain."

**Status today.** Doesn't exist (confirmed: no `chat` in server routes or
editors). But the *pattern* is well-trodden — `category`/`stream` show how a new
`type` plugs in: a `state.json` shape + a matching `*Editor.vue` + (optionally) a
route.

**The real design fork is the brain, staged:**
1. **Echo stub.** `POST /api/nodes/:id/chat` appends the user message + a canned
   reply to `state.json`'s `messages[]`. Proves the UI + persistence end-to-end.
2. **Claude API.** Swap the stub to call the Anthropic API (the root
   `package.json` already depends on `@modelcontextprotocol/sdk`; add the
   Anthropic SDK). Now it's a real assistant, but blind — no tools.
3. **Tool-using brain.** Give the brain hands via **ocraft self-MCP** (operate
   the system) and eyes via **ThinkTank MCP** (read/write memory). *This* is the
   "conversation with cloud code" payoff. Until those MCPs exist, the brain is
   just chat.

**Plan (build the UI against the stub, swap the brain later):**
1. **Type plumbing.** `chat` node `state.json`: `{ type:"chat", messages:[
   {role, text, ts} ] }`. Add `ChatEditor.vue` (thread + pinned input;
   `track-mp3`/`StreamEditor` are the layout references). Register the type in
   the editor switch in `NodeItem.vue`.
2. **Endpoint.** `POST /api/nodes/:id/chat` in `server.js`: append user msg,
   produce a reply (stub → API → tool-brain), persist, return the new messages.
3. **Streaming (later).** Swap the request/response for SSE or the cloud WS
   exchange so replies stream token-by-token.

**Open questions.** Where does the brain run — in `server.js` (simple, but mixes
the data server with LLM calls), as a scheduler/entry, or behind the cloud WS
exchange? History/token budget management. Per-node system prompt?

**Dependencies.** Gets *good* only with **ocraft self-MCP** + **ThinkTank MCP**.
Is the natural host for **daily briefing**'s judgment step.

**Effort/risk.** UI+stub is low effort. The brain is where scope balloons — keep
the stub→API→tools staging strict so each stage ships independently.

---

## Daily briefing — *Design-open (composition)*

**Goal.** One morning summary folding unread email + today's calendar + overnight
Telegram, pushed to Telegram — the life-management judgment step made concrete.

**Status today.** Inputs exist as **MCP servers** (telegram, gcal, gmail). The
core tension: a headless scheduler **entry cannot call MCP tools** — MCP tools
are an interactive-Claude affordance. So this is *not* a plain `entries/*.js`
cron job. It's a composition that needs a brain + a memory.

**The fork is "who is the brain":**
- **(a) Scheduled cloud-code session.** A scheduled Claude Code run (see the
  `schedule`/routines mechanism) that *has* the MCP tools, assembles the
  briefing, writes it to ThinkTank, and sends Telegram. Most aligned with the
  vision; least code.
- **(b) ocraft self-MCP + direct APIs.** A backend entry that calls the
  underlying APIs directly (not via MCP) — reimplements slices of each MCP's data
  access inside an entry. More code, no Claude judgment unless it also calls the
  Anthropic API.
- **(c) Chat-node brain.** The briefing is a scheduled message into a `chat` node
  whose brain has the MCP/self-MCP tools.

Recommend **(a)** first — it's the smallest path and exactly what the
life-management vision describes (Claude as the judgment/language step).

**Plan (assuming (a)):**
1. **Sources.** Define the briefing inputs precisely: unread Gmail since
   yesterday, today's gcal events, Telegram messages overnight from chosen chats.
2. **Composer.** A prompt/routine that pulls those three, dedupes, ranks, writes
   a tight summary.
3. **Durable home.** Append the briefing to the ThinkTank daily note — needs
   **ThinkTank MCP** (the "remember" organ) so the summary survives and links.
4. **Delivery.** Send via Telegram (`api/telegram.js` send helper already
   exists; the `telegram-reminder` entry is the template).
5. **Schedule.** A morning cron via the routines/`schedule` mechanism.

**Open questions.** Quiet-hours / dedupe across days; how much summarization vs
raw list; whether the briefing is two-way (reply to act).

**Dependencies.** **Hard:** ThinkTank MCP (memory). **Soft:** chat node /
self-MCP (richer judgment). Don't start before ThinkTank MCP exists.

**Effort/risk.** Medium. Risk is starting it before the memory organ exists and
producing briefings that evaporate.

---

## `yo` as a node scripting medium — *Design-open*

**Goal.** Grow `js-engine/yo` (the tiny async-first interpreter) into an
embeddable, sandboxed scripting medium for nodes — a safer alternative to raw-JS
`script` nodes.

**Status today.** `js-engine/yo.js` is a working lexer→parser→evaluator with
`@a`/`@f` (async/sync), `@w` (await), `@r` (return), `@l` (print), arithmetic,
variables, calls. It runs `program.yo`. It is standalone — not wired to nodes.

**Why it matters / the fork:** raw-JS `script` nodes run with full Node access
(see **sandboxed execution**). `yo` is attractive precisely because *you control
the interpreter* — it can't reach the filesystem or network unless you add a
builtin that does. So `yo` is **one isolation strategy**: capability-by-builtin.

**Plan (incremental, each step independently useful):**
1. **Embed.** Export `yo`'s `run(source, { builtins })` so the backend can
   evaluate a string with an injected builtin set (not just a file).
2. **A `yo` node type.** `type:"yo"`, body stored like `script.js` (a
   `program.yo`). A `YoEditor.vue` (fork `ScriptEditor.vue`) with syntax aware of
   `@`-keywords.
3. **Capabilities as builtins.** Map the **scripts-calling-scripts** resolver and
   safe primitives into `yo` builtins (`@call`, `@log`, `@state`). The node can
   only do what builtins expose — that *is* the sandbox.
4. **Language growth, demand-driven.** Add strings, lists/objects (the Varcraft
   "create array/object" idea), conditionals — only as real `yo` programs need
   them. Keep the interpreter small.
5. **fx → js angle (optional).** The old Varcraft "convert fx to js" idea = a
   `yo`→JS compiler for speed once programs matter. Defer until there's a `yo`
   program slow enough to care.

**Open questions.** Is `yo` worth maturing vs. just sandboxing JS with
`isolated-vm`? (See sandboxing forks.) `yo`'s appeal is *pedagogical + total
control*; its cost is reimplementing a language. Honest answer depends on whether
you value the language as a craft object or just want isolation.

**Dependencies.** Tightly paired with **sandboxed execution** (it's one of the
isolation options) and **scripts-calling-scripts** (its builtins).

**Effort/risk.** Medium-high if you grow the language; the risk is sinking time
into language features no node needs. Mitigate by being strictly demand-driven.

---

## Sandboxed execution with resource limits — *Design-open*

**Goal.** Run node/entry scripts isolated, with disk/memory/CPU caps, so one
artifact can't take down the host. (Varcraft assumed containerized,
resource-limited modules from the start.)

**Status today.** `executor.js` does `await import(entryPath)` and runs `run(ctx)`
**in-process with full Node privileges**. No isolation, no limits.

**This is a strategy choice — four genuinely different commitments:**

| Strategy | Isolation | Resource caps | Cost |
|---|---|---|---|
| **In-process VM** (`node:vm`) | weak (shares heap, escapable) | none real | trivial |
| **`isolated-vm`** | strong JS isolate, separate heap | memory + CPU timeouts | medium; native dep |
| **Subprocess/worker** (`child_process`/`worker_threads`) | OS-process boundary | `ulimit`/cgroup-ish, `--max-old-space-size` | medium |
| **Container / micro-VM** (Docker, Firecracker) | strongest | full cgroup disk/mem/CPU | high; ops weight |
| **`yo` interpreter** | capability-by-builtin | whatever builtins allow | see `yo` plan |

**What discriminates the choice:**
- Do scripts need npm packages / arbitrary Node APIs? → rules out `yo` and weak
  `vm`; pushes toward subprocess or container.
- Is the threat *accidental* (runaway loop, OOM) or *adversarial* (untrusted
  code)? Accidental → subprocess + limits is plenty. Adversarial → `isolated-vm`
  or container.
- Where does it run — locally or on the **DO droplet**? The droplet is the
  natural home for container/worker isolation without risking your laptop.

**Recommended path (cheapest credible isolation first):**
1. **Subprocess executor.** Run each entry in a `child_process`/`worker_threads`
   with `--max-old-space-size`, a wall-clock timeout, and killed process group
   (the `procManager` already kills by process group — reuse that). This alone
   kills the "runaway script OOMs the host" class.
2. **Limits + accounting.** Capture per-run peak RSS / CPU (feeds the
   **proc-management UI** monitoring). Enforce a timeout in `executor.js`.
3. **Container tier (only if needed).** If untrusted/third-party code becomes a
   thing, run workers in containers on the droplet, provisioned via the
   **DigitalOcean MCP**.

**Open questions.** Does the `ctx` API (state/log) survive a process boundary
cleanly? (Yes via message-passing, but it changes the entry contract.) Disk caps
are the awkward one — needs container/cgroup, hard with bare subprocess.

**Dependencies.** Pairs with **yo** (alt isolation) and feeds the
**proc-management UI** (resource numbers). Touches `executor.js`'s core contract
— sequence it *after* the build-ready editor work so you're not destabilizing the
run path early.

**Effort/risk.** Medium→high depending on tier. Risk: over-isolating before
there's untrusted code. Start at subprocess+timeout; it's 80% of the safety for
20% of the cost.

---

# Infrastructure

## Process control / supervisor — extend coverage — *Build-ready*

**Goal.** Bring *all* processes under one start/stop/restart/status/log unit.
Today `procManager` supervises only `frontend` + `ticker`.

**Status today.** `procManager.js` is a complete lifecycle engine:
`listProcs/getProc/startProc/stopProc/restartProc/readLog/clearLog`, per-proc
config in `backend/procs/*.js`, runtime state + rotating logs in
`backend/state/procs/`, per-proc `withLock`. The CLI exposes it all
(`node cli.js proc <sub>`). It just doesn't *cover* the real processes.

**Plan:**
1. **Add proc configs** under `backend/procs/` for the real moving parts:
   - `scheduler.js` proc → `{ cmd:'node', args:['cli.js','start-scheduler'] }`
     run on a loop (or have the proc be a small wrapper that calls `runScheduler`
     on an interval — note `withLock('scheduler')` already prevents overlap).
   - `backend-api.js` proc → `{ cmd:'node', args:['backend/server.js'] }` (today
     Vite auto-spawns it; make it a first-class proc so it can run standalone).
2. **MCP servers under supervision — the caveat.** stdio MCP servers
   (`mcp-servers/*/server.js`) are launched by the MCP *host* from `.mcp.json`
   and speak over stdio; you can only supervise them standalone if they move to
   **HTTP/SSE transport**. Plan: add an optional HTTP/SSE transport to each MCP
   server (the `@modelcontextprotocol/sdk` supports it), then add proc configs.
   This is a real sub-project — keep it out of v1.
3. **autoRestart.** `ticker.js` notes `autoRestart` is "reserved, not acted on."
   Add a supervisor tick that restarts crashed procs flagged `autoRestart:true`
   (a scheduler job or a small daemon that polls `listProcs`).

**Open questions.** Should the supervisor itself be a proc (who watches the
watcher)? Single long-lived supervisor daemon vs. periodic scheduler-driven
reconcile? Recommend periodic reconcile — reuses the scheduler + lock you have.

**Dependencies.** Directly under **process-management UI**. The MCP-over-HTTP/SSE
piece also helps **ocraft self-MCP**.

**Effort/risk.** Low for backend+scheduler procs; medium for the MCP/SSE
transport piece. Do the easy procs first.

---

## Process-management UI + live resource monitoring — *Build-ready*

**Goal.** A frontend page to list/start/stop/restart procs, tail logs, and show
live RAM/CPU per proc. (Varcraft: "a page for managing app processes... query RAM
and CPU.")

**Status today.** All control already exists in `procManager` + CLI; nothing is
exposed over HTTP or shown in the UI. `getProc` returns status/pid/uptime but no
RAM/CPU yet.

**Plan:**
1. **HTTP surface.** Add proc routes to `server.js` mirroring the CLI:
   `GET /api/procs` (→ `listProcs`), `GET /api/procs/:id` (→ `getProc`),
   `POST /api/procs/:id/(start|stop|restart)`, `GET /api/procs/:id/logs`,
   `DELETE /api/procs/:id/logs`. Thin wrappers over the existing functions.
2. **Resource numbers.** Extend `getProc` to read live RSS/CPU for the pid.
   Options: `pidusage` (cross-platform npm), or shell `ps -o rss,pcpu -p <pid>`.
   Surface `memMb`/`cpuPct` in the status record.
3. **Frontend.** A "Processes" view (new route in `router.js`): a table of procs
   (status dot, pid, uptime, mem, cpu) with start/stop/restart buttons and a
   live log tail (poll `GET .../logs`, or upgrade to SSE/WS later). The CLI's
   `fmt()` is the data shape to mirror.
4. **Live updates.** Poll every ~2s initially; switch to the **cloud WS exchange**
   / SSE when that lands.

**Open questions.** Per-proc child trees — `frontend.js` spawns npm→vite→backend;
RSS of just the parent undercounts. Sum the process group? (procManager already
tracks the group for kill — reuse.)

**Dependencies.** Sits on **supervisor coverage** (more procs = more to show).
Resource accounting overlaps **sandboxed execution**'s per-run metrics.

**Effort/risk.** Low–medium. Cleanly additive; no changes to the run path.

---

## Cloud WebSocket exchange (DigitalOcean) — *Design-open*

**Goal.** A hosted relay that exchanges WS messages between the backend, the
editor, and future clients (notably the Flutter app). The "cloud" the mobile-
control idea needs.

**Status today.** Nothing built. But infra has a home: a DO droplet (fra1) +
reserved IP, and the **DigitalOcean MCP** can provision/operate it.

**The open questions are architectural (settle these before coding):**
1. **Topology — is the local backend the *origin* or just another client?**
   - *Origin:* the exchange forwards to your local backend (needs a tunnel home —
     fragile if the laptop sleeps).
   - *Peer:* the exchange is the source of truth; backend and editor and mobile
     are all equal clients. More robust; recommended.
2. **Routing — pub/sub topics vs. direct addressing?** Topics (clients
   subscribe to channels) scale to "broadcast a state change"; direct addressing
   suits "command this specific device." Likely need both: topic broadcast +
   targeted commands.
3. **Auth.** Token per client (the root `token` file pattern exists). TLS via the
   reserved IP + a domain.

**Plan (once topology is chosen — assuming peer + topics):**
1. **Relay service.** A small Node WS server (`ws` package) on the droplet:
   clients connect with a token, subscribe to topics, publish messages; the relay
   fans out. Keep it dumb (no business logic) at first.
2. **Deploy.** Provision/run on the droplet (DigitalOcean MCP for the box; a
   `deploy` entry — one already exists as a stub — for `git pull` + restart, the
   Varcraft "simple deploy" idea). Supervise it as a proc (HTTP/SSE-style) once
   **supervisor coverage** can reach remote procs.
3. **Backend client.** The local backend connects as a client, publishes node/
   proc/execution events, subscribes to commands.
4. **Editor client.** The frontend subscribes for live updates (replaces polling
   in the **proc UI** and **chat node** streaming).

**Open questions.** Reconnection/backpressure; message schema/versioning;
whether to use raw `ws` vs. a managed pub/sub (Redis, NATS) behind it.

**Dependencies.** **Unblocks Flutter mobile.** Becomes the live transport for
**proc UI**, **chat node**, **stream nodes**. Deploy story overlaps the Varcraft
git-pull deploy idea.

**Effort/risk.** Medium-high — first real *hosted, networked, authed* service in
the project. Risk concentrates in auth + reconnection; the relay itself is small.

---

## ThinkTank MCP — *Design-open*

**Goal.** Programmatic search + modify across the ThinkTank vault (append to daily
note, create/link, resolve `[[wikilinks]]`, read backlinks) — the **memory
organ** that ocraft (headless scheduler, chat-node brain) needs, since it can't
borrow Claude Code's filesystem tools.

**Status today.** None. But there's a clean template: `mcp-servers/gcal-mcp/` is
the canonical pattern — `McpServer` + `StdioServerTransport` + `zod` tool schemas,
one `server.js`, registered in `.mcp.json`. The vault is plain Markdown at
`../ThinkTank/`.

**Plan:**
1. **Scaffold.** `mcp-servers/thinktank-mcp/` from the gcal-mcp shape; register in
   `.mcp.json`. Config: vault path via env.
2. **Read tools.** `search_notes(query)` (ripgrep over the vault),
   `read_note(path)`, `list_backlinks(note)` (grep for `[[name]]`),
   `resolve_wikilink(name)` (the find-by-title logic — see how the two
   `Varcraft*.md` notes resolve).
3. **Write tools.** `append_to_daily()` (today's daily note), `create_note(path,
   body)`, `link(from, to)` (insert a `[[wikilink]]`). Writes are the whole point
   — this is what an *interactive* Claude already does for free, exposed for
   *headless* ocraft.
4. **Safety.** Confine all paths under the vault root; never write outside it.

**Open questions.** Daily-note naming/format convention (must match the vault's
existing scheme — inspect before coding). Conflict handling on concurrent writes.
Does it index (embeddings) or just grep? Start with grep; add an index only if
search quality demands it.

**Dependencies.** **Hard prerequisite for daily briefing** (its durable home).
Gives the **chat node** brain long-term memory.

**Effort/risk.** Low–medium — the MCP pattern is established; the work is the
vault-write semantics. Risk: writing outside the vault or corrupting notes —
guard paths and start read-mostly.

---

## ocraft self-MCP — *Design-open*

**Goal.** Expose ocraft's own machinery as MCP tools (`list_jobs`, `run_entry`,
`proc_status`, `tail_execution_log`, `create_node`...) so Claude can *operate* the
system, not just edit files. The "conversation with cloud code" made real.

**Status today.** None, but everything it would wrap already exists as clean
functions: `execute` (executor), `runScheduler`/`jobs` (scheduler),
`listProcs/startProc/...` (procManager), `listExecutions` (storage), node CRUD
(server). The CLI already composes exactly these — the MCP is a second front-end
over the same calls.

**Plan:**
1. **Scaffold** `mcp-servers/ocraft-mcp/` from the gcal-mcp pattern.
2. **Wrap, don't reimplement.** Import the backend functions directly (same repo)
   and expose tools:
   - `list_entries` / `run_entry(name, args)` → `executor.execute`
   - `list_jobs` → scheduler `jobs`; `run_scheduler` → `runScheduler`
   - `proc_list/status/start/stop/restart`, `tail_log` → `procManager.*`
   - `list_executions` / `read_execution(id)` → storage
   - `list_nodes` / `create_node` / `delete_node` → node store (post-CRUD)
3. **Transport decision.** stdio (like the others) is simplest for an interactive
   Claude. If the **chat-node brain** needs to call these *from the backend*,
   either run it over HTTP/SSE or have the brain import the functions directly
   (no MCP hop). Note: an MCP server is for an *external* model; the backend's own
   brain may not need the MCP indirection at all.

**Open questions.** Write-tool guardrails (a `run_entry` can do anything an entry
can — and entries aren't sandboxed yet; ties to **sandboxed execution**).
Overlap/duplication with the CLI — keep them thin over shared functions so they
can't drift.

**Dependencies.** Makes the **chat node** a real operator. Its danger surface is
exactly why **sandboxed execution** matters. Benefits from **supervisor
coverage** (proc tools become more useful).

**Effort/risk.** Low to wrap (functions exist); medium once write tools meet an
un-sandboxed executor — sequence sandboxing alongside the write tools.

---

## Music MCP — *Parked (decision recorded)*

**Decision:** Not worth a dedicated MCP for now. Playback control is already
covered by the claude-in-chrome extension driving the Spotify/Apple Music web
player. An API MCP would only pay off for the **data** side (listening history,
building playlists as data) — a weaker, speculative need.

**Revisit trigger.** Build it only if a concrete history/logging use case appears
(e.g. you want listening data folded into the **daily briefing** or logged to
ThinkTank). At that point it's a thin read-only MCP over the Spotify Web API,
same `gcal-mcp` shape. Until then: park.

---

# Generative Art — *Spike (creative R&D, not a build queue)*

This whole section resists implementation planning by nature — it's an
exploration recipe, not a feature. The meta-recipe *is* the plan: **symbolic
medium + render-and-return tool + creative constraints + tight iteration.** The
only real engineering is the "render-and-return" tools (so Claude perceives its
own output and self-corrects); the art is in the loop, not the code. Each could
eventually become a creative `stream`/`chat` node type, but only after the tool
exists and the loop feels good.

**Build the *tools*, then play. Suggested spike order (smallest perception loop
first):**

1. **`render_shader` → PNG** *(best first spike).* A GLSL fragment shader
   rendered headless (`glslViewer` or a small `gl`/`regl` script) returning a PNG
   the model sees. Closed-loop critique ("darker, slower, more space") works
   immediately. Lowest setup, instant visual feedback. **Start here.**
2. **`eval_hydra` → screenshot.** Hydra livecoding in a headless browser page
   (you already have the claude-in-chrome tools); screenshot back. Reuses browser
   automation you have.
3. **`play_osc` → Sonic Pi / SuperCollider.** An OSC bridge (a script pipes to a
   running Sonic Pi); the "return" is audio, so perception is *your* ear, not the
   model's — weaker self-correction loop. Do after the visual ones.
4. **`send_midi` → `mido`/`fluidsynth`.** Scale constraints, Euclidean rhythms
   E(5,8), Markov over scale degrees, L-systems → pitch. Render with
   `fluidsynth`. Pure-data side could share a WASM helper (see the WASM spike).
5. **`plot(expr)` → PNG.** Generative geometry; trivial render-and-return; a good
   warm-up if the shader toolchain is fiddly.

**Each "Creative MCP tool"** would live as a small MCP server (gcal-mcp shape)
whose tool *returns the rendered artifact* (PNG/screenshot/audio path) so the
model perceives and iterates. The `render-and-return` shape is the entire trick.

**What tells you to invest more.** One genuinely good output you'd keep, produced
through the iterate-tight loop — that's the signal the medium + tool + constraints
combo works. If the loop feels mechanical or the outputs are flat, it's a
toolchain problem (perception latency/fidelity), not a reason to quit.

**Strudel** is the exception — output-only pattern code where *you're* the ear,
no render-return tool needed. Cheapest possible start if you just want to make
sound this afternoon.

---

_Plans are proposals with decision points, not commitments. Update as ideas firm
up or forks get settled; keep `IDEAS.md` as the one-line index and this as the
how._
