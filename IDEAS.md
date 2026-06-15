# IDEAS

Scratchpad for things to explore, learn, or build later. Not a spec — just a
parking lot so nothing gets lost. Move items into CLAUDE.md only once they
become concrete, code-relevant work.

## Learning goals

- **WebAssembly (WASM)** — learn the fundamentals and where it could fit in this
  workspace (e.g. running compute-heavy logic in the frontend editor, or
  sharing code between backend and browser).

## Project ideas

- **Flutter for cloud-driven mobile control** — build a Flutter mobile app that
  can be controlled / driven from "cloud code" (e.g. trigger actions, push
  state, or receive commands from a backend service). Explore how this could
  connect to the existing ocraft backend/scheduler.

- **Autonomous dev loop** — close the loop on AI-driven development of ocraft:
  the `ocraft-dev-plan` skill writes a sequenced weekly plan
  (`dev-plans/<date>-week.md`), then a dedicated **`dev-task` entry** executes
  *one* task per run on a branch (Agent SDK), gates on the task's acceptance
  check, and opens a PR for human review — never `main`, never auto-merge.
  Execution must be the `dev-task` entry, **not** `POST /api/ai-chat` (that
  endpoint is bypassPermissions + no-auth + localhost-only, must never do
  git/PR). Visual changes can be self-verified via the claude-in-chrome MCP
  (screenshots + DOM of the running editor) — the "eyes" already exist.
  Prereqs: `gh` installed + authenticated (`origin` is already set). Honest
  caveat: ocraft has no real test/behavior gate yet (only `node --check` +
  `npm run build` + screenshots), so PRs genuinely need human review until one
  exists.

- **`stream` node type (removed — reimplement later)** — the `stream` node type
  was removed (frontend `Stream.vue` preview, its type registration, and the
  `sample stream` node) to keep the type list to things that actually work. When
  revisiting, it needs two halves: (1) a real **frontend** editor/preview — the
  old one was a placeholder black canvas using the shared `Stage` chrome; and
  (2) a **backend run model** — today nodes are just stored JSON with no run
  semantics, so define how a stream node is configured and actually *executed*
  on the backend side.

- **Scripts calling other scripts by name** — let every script in the editor
  invoke another script by its name (composition / reuse between nodes). Open
  question: how does a script *discover* the other scripts it can call? Idea:
  discovery becomes organic once the node ("artifact") list is **hierarchical**
  — the tree structure itself acts as the namespace/registry, so a script can
  reference siblings/children by path-like names instead of needing a separate
  lookup mechanism. (The tree foundation — `parentId` + the `category` type —
  has since shipped, so this is now unblocked.)

- **CRUD nodes from the frontend + nested nodes** — add full create/read/update/
  delete for nodes directly in the frontend editor. A node should be able to
  contain other nodes (nesting), which gives the hierarchical tree above. Idea:
  introduce a `category` node type that acts like a directory — its job is to
  hold child nodes rather than run a script. This is the structural foundation
  the script discovery idea depends on. (Nesting + the `category` type are
  built, and `POST /api/nodes/:id` already upserts a node on the backend; the
  remaining gaps are a DELETE endpoint and wiring create/update/delete into the
  editor UI.)

- **Node / script versioning (version-on-save)** — saving a node script
  overwrites it today. Instead, each save could write a new version (keep
  history, allow diff/rollback) rather than clobbering the previous one. (From
  the old Varcraft notes — "need fx versioning, i.e. a new save.")

- **`yo` as a node scripting medium** — `js-engine/` already holds `yo`, a tiny
  async-first toy interpreter (lexer -> parser -> evaluator, `@`-keyword
  syntax). It could grow into an embeddable, sandboxed scripting medium for
  nodes (a safer alternative to raw-JS `script` nodes), or a symbolic medium for
  the generative-art experiments below.

- **Sandboxed execution with resource limits** — node/entry scripts currently
  run with full Node access. Run them in an isolated environment (container or
  VM) with disk / memory / CPU caps, so an artifact can't take down the host.
  Pairs with the `yo` sandbox idea above, and the DO droplet is a natural place
  to run isolated workers. (From the old Varcraft notes — the original vision
  already assumed containerised, resource-limited module execution.)

- **Re-enable the `stream` node type** — the `stream` node is temporarily
  **hidden from the type picker** (`hidden: true` on its entry in `NodeItem.vue`'s
  `EDITORS` registry) until it does something real. Today it's just a black
  preview canvas (`StreamEditor.vue`) with **no backend run model** — see
  IDEAS-PLANS "Backend run model for `stream` nodes" for what it needs (a `run`
  block + an executor path). The existing `sample-stream` node (5) still renders;
  new ones just can't be created from the UI. Flip the flag to re-enable once
  streams actually run.

## Infrastructure

- **Process control / supervisor — extend coverage** — `backend/procManager.js`
  now exists (the custom plain-ESM fork was chosen: per-proc config files like
  `scheduler.js`'s `jobs[]`, reusing `withLock` + the `state/` store, with
  rotating logs). But it currently supervises only two procs (`frontend`,
  `ticker`). Bring the rest under the one start/stop/restart/status/log unit:
  the scheduler, the backend API server, and the MCP servers. Caveat still
  stands — stdio MCP servers can only be supervised standalone if moved to
  HTTP/SSE transport.

- **Process-management UI + live resource monitoring** — `procManager.js` is
  backend-only; there's no way to start/stop/restart procs or watch them from
  the editor. Add a frontend page that lists procs with their status, tails
  their logs, and shows live RAM / CPU usage per proc. (From the old Varcraft
  notes — "a page for managing app processes... and query RAM and CPU.")

- **Cloud WebSocket exchange (Digital Ocean)** — a hosted relay/broker that
  exchanges WS messages between the backend, the editor, and future clients.
  This is the "cloud" the [[flutter-cloud-mobile-control]] idea needs — the hub
  that lets cloud code drive a mobile app. Open questions: pub/sub topics vs.
  direct routing, auth, and whether the local backend is the origin or just
  another client of the exchange. Infra now has a home: a DigitalOcean droplet
  (fra1) with a reserved IP is a ready deploy target, and the DigitalOcean MCP
  is wired up to provision/operate it.

- **Integrate `stream.x8.deno.net` (the live WS exchange) into ocraft** — the
  cloud WS relay from [[cloud-websocket-exchange]] now *exists* as a deployed
  endpoint: `wss://stream.x8.deno.net/ws` (on **Deno Deploy**, not the DO droplet
  that item assumed — so revisit which is the real home). Next step is wiring it
  into the stack: the local backend connects as a **client** and publishes
  node / proc / execution events; the editor **subscribes** for live updates
  (replacing the poll-based proc UI and chat-node streaming); future clients
  (the Flutter/mobile idea) join the same hub. Open before that: the message
  protocol (pub/sub topics vs. direct addressing) and auth. Already have a
  **`websocket-tester` script node** (id 11, under `test`) for poking the
  endpoint — a connect/send/log panel built with the `x.ui` script-controls
  surface (this replaced the old throwaway `/ws` `WsTester.vue` route).

- **More MCP servers to build** — beyond telegram + gcal + gmail, the
  life-management loop still has no _memory organ_ and no _hands on its own
  machinery_:

  - **ThinkTank MCP** — search across _all_ vault notes and modify them
    (append to the daily note, create/link, resolve `[[wikilinks]]`, read
    backlinks). Note the real driver: an _interactive_ Claude Code session
    already has Read/Grep/Edit over the markdown for free — so this MCP exists
    for **ocraft itself** (the headless scheduler + the [[chat-node-type]]
    brain) to reach the vault programmatically, since it can't borrow Claude
    Code's filesystem tools. This is the "remember" step every other MCP's
    summaries need a durable home in.

  - **ocraft self-MCP** — expose the scheduler/nodes/procManager as tools
    (`list_jobs`, `run_entry`, `proc_status`, `tail_execution_log`,
    `create_node`) so Claude can _operate_ the system, not just edit its files.
    This is the [[chat-node-type]] "conversation with cloud code" made real.

  - **Music** — _probably not worth a dedicated MCP._ For playback control the
    claude-in-chrome extension already drives the Spotify/Apple Music web
    player. An API MCP would only pay off for the data side (listening history,
    building playlists as data) — a weaker need. Park it; revisit if the
    history/logging use case becomes real.

## Generative Art

Treat Claude as a *performer with an instrument*, not a coder: pick a symbolic
medium → give it a render-and-return tool so it perceives output → iterate tight
("darker, slower, more space"). Could become creative `stream`/`chat` node types.

- **Music** — Strudel (output-only pattern code, you're the ear); Sonic Pi via
  an OSC bridge (script pipes Ruby → running Sonic Pi, so Claude can trigger
  sound); MIDI via `mido` with scale constraints, Euclidean rhythms E(5,8),
  Markov chains over scale degrees, L-systems → pitch, rendered with `fluidsynth`.
- **Video / visuals** — Hydra browser livecoding ('70s feedback looks); GLSL
  shaders via `glslViewer` hot-reload (plasma, FBM domain warp, LFO pulse);
  FFmpeg frame pipeline with feedback (90% warped prev + 10% noise → datamosh),
  reaction-diffusion, cellular automata, flow fields.
- **Creative MCP tools** (give it eyes/ears via the return value) — `play_osc`
  → Sonic Pi/SuperCollider; `eval_hydra` → screenshot back so it self-corrects;
  `render_shader` → PNG for closed-loop critique; `send_midi` → DAW/hardware;
  `dmx_set` → stage lighting; `plot(expr)` → generative geometry.

Meta-recipe: symbolic medium + render-and-return tool + creative constraints
(scales, Euclidean, L-systems, feedback, decade aesthetics) + tight iteration.

---

_Add new ideas with a short title and a one-line note on why it's interesting._
