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

- **Stream-type editor on the backend** — develop the editor / tooling for the
  `stream` node type on the backend side (the stream node type was recently
  added). Flesh out how stream nodes are created, configured, and run.

- **Scripts calling other scripts by name** — let every script in the editor
  invoke another script by its name (composition / reuse between nodes). Open
  question: how does a script *discover* the other scripts it can call? Idea:
  discovery becomes organic once the node ("artifact") list is **hierarchical**
  — the tree structure itself acts as the namespace/registry, so a script can
  reference siblings/children by path-like names instead of needing a separate
  lookup mechanism.

- **CRUD nodes from the frontend + nested nodes** — add full create/read/update/
  delete for nodes directly in the frontend editor. A node should be able to
  contain other nodes (nesting), which gives the hierarchical tree above. Idea:
  introduce a `category` node type that acts like a directory — its job is to
  hold child nodes rather than run a script. This is the structural foundation
  the script discovery idea depends on. (Nesting + the `category` type are now
  built; the create/update/delete-from-UI part is still open.)

- **Chat node type ("conversation with cloud code")** — a new node type with a
  chat UI (message thread + input pinned at bottom, like web Claude). Messages
  persist in the node's `state.json`; a `POST /api/nodes/:id/chat` endpoint is
  the "brain" — start as an echo stub, later swap to the Claude API or the cloud
  WS exchange. Same node-type pattern as `category`/`stream`.

## Infrastructure

- **Process control / supervisor** — a single mechanism to start/stop/restart/
  status/log all the moving processes as one unit: backend API server, frontend
  dev server, the scheduler, and the MCP servers. Today nothing owns their
  lifecycle (Vite auto-spawns the backend; MCP servers are launched by the MCP
  host from `.mcp.json`). Forks to decide: custom plain-ESM `supervisor.js`
  (manifest of processes like `scheduler.js`'s `jobs[]`, reusing `withLock` +
  the `state/` store) vs. off-the-shelf (Procfile/overmind, pm2, docker-compose).
  Note: stdio MCP servers can only be supervised standalone if moved to
  HTTP/SSE transport.

- **Cloud WebSocket exchange (Digital Ocean)** — a hosted relay/broker that
  exchanges WS messages between the backend, the editor, and future clients.
  This is the "cloud" the [[flutter-cloud-mobile-control]] idea needs — the hub
  that lets cloud code drive a mobile app. Open questions: pub/sub topics vs.
  direct routing, auth, and whether the local backend is the origin or just
  another client of the exchange.

- **Digital Ocean MCP** — an MCP server for managing Digital Ocean (droplets,
  apps, databases, networking) so Claude can provision and operate the cloud
  infrastructure directly. Pairs naturally with the [[cloud-websocket-exchange]]
  idea — the hosted relay would live on DO, and this MCP would be how it gets
  stood up and managed.

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
