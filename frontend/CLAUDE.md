# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (Vite + auto-spawned backend API server on port 3001)
npm run dev

# Build for production
npm run build
```

The `vite.config.js` `backendPlugin` spawns the backend API server (`../backend/server.js`) when Vite starts, and Vite proxies `/api/*` to port 3001.

## Architecture

This is a **visual scene editor** — a Vue 3 + p5.js app for composing and previewing typed nodes stored as JSON. The server and data store live in the backend (`../backend/`); this app is the client and reaches them only over `/api`.

### Data (owned by the backend)

Nodes, assets, and catalogs live under `../backend/data/` and are served via the API — see `../backend/CLAUDE.md` (or `../CLAUDE.md`). Each node is `../backend/data/nodes/<id>/state.json`, plus a sidecar body file when applicable: `script.js` for `type === "script"`, `content.html` for `type === "html"`. Sidecars are kept out of `state.json` (and the node-list payload) and fetched on open.

### Node state (`state.json`)

Each node has a `type` field that changes what the editor renders:
- `"script"` — runs `script.js` via dynamic import (fetched from `GET /api/nodes/:id/body`); no p5 canvas
- _(default/scene)_ — p5.js scene with `elements[]`, `effects[]`, `viewport`, `tempo`, `structure`

Scene node fields:
- `viewport` — logical canvas dimensions (e.g. 160×90 at 16:9)
- `elements[]` — scene objects typed as `background`, `shape`, `phrase`, etc., each with `props`, `state`, `events`
- `effects[]` — post-process passes (e.g. `grain` with `intensity`)
- `tempo`, `structure` — music timing metadata (bpm, bars, loop)

### API (served by `../backend/server.js`)

- `GET /api/nodes` — list all nodes (reads every `state.json`)
- `GET /api/nodes/:id` — read one node
- `GET/POST /api/nodes/:id/body` — a node's sidecar body, resolved by type (`script.js` for script nodes, `content.html` for html nodes)
- `POST /api/nodes/:id` — overwrite `state.json` (metadata only) for a node

### Frontend (`src/`)

- **`stores/nodes.js`** — Pinia store; fetches the node list via `/api/nodes`, tracks `activeNodeId`, exposes `save(id, data)`
- **`router.js`** — vue-router routes
- **`App.vue`** — sidebar list of nodes + main content area
- **`components/NodeItem.vue`** — renders the active node; for scenes mounts a p5 instance and calls `renderSceneP5` on each draw frame; for scripts fetches and imports `script.js`
- **`components/renderSceneP5.js`** — p5.js renderer: scales/centers viewport into container, draws elements in order, then applies effects (grain via `loadPixels`/`updatePixels`)
- **`components/renderScene.js`** — legacy Canvas 2D renderer (currently unused; p5 renderer is active)

### Rendering flow

`NodeItem` → p5 `draw()` loop → `renderSceneP5(s, {width, height}, node)`:
1. Clear canvas
2. Compute scale + offset to fit `node.viewport` into container (letterbox)
3. Draw each element by type (`background` → filled rect, `shape/rect` → filled rect)
4. Apply effects outside the transform (`grain` → pixel noise)

### Parent repo

This is a sub-project of the `ocraft/` monorepo. See `../CLAUDE.md` for the backend scheduler, CLI, and API server that live alongside this frontend.
