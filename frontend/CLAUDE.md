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

This is a **visual scene editor** — a Vue 3 + p5.js app for composing and previewing scene-based visuals ("artifacts") stored as JSON. The server and data store live in the backend (`../backend/`); this app is the client and reaches them only over `/api`.

### Data (owned by the backend)

Artifacts, assets, and catalogs live under `../backend/data/` and are served via the API — see `../backend/CLAUDE.md` (or `../CLAUDE.md`). Each artifact is `../backend/data/artifacts/<id>/state.json`, plus a `script.js` when `type === "script"`.

### Artifact state (`state.json`)

Each artifact has a `type` field that changes what the editor renders:
- `"script"` — runs `script.js` via dynamic import (fetched from `GET /api/artifacts/:id/script`); no p5 canvas
- _(default/scene)_ — p5.js scene with `nodes[]`, `effects[]`, `viewport`, `tempo`, `structure`

Scene artifact fields:
- `viewport` — logical canvas dimensions (e.g. 160×90 at 16:9)
- `nodes[]` — scene objects typed as `background`, `shape`, `phrase`, etc., each with `props`, `state`, `events`
- `effects[]` — post-process passes (e.g. `grain` with `intensity`)
- `tempo`, `structure` — music timing metadata (bpm, bars, loop)

### API (served by `../backend/server.js`)

- `GET /api/artifacts` — list all artifacts (reads every `state.json`)
- `GET /api/artifacts/:id` — read one artifact
- `GET /api/artifacts/:id/script` — raw `script.js` for a script artifact
- `POST /api/artifacts/:id` — overwrite `state.json` for an artifact

### Frontend (`src/`)

- **`stores/artifacts.js`** — Pinia store; fetches the artifact list via `/api/artifacts`, tracks `activeArtifactId`, exposes `save(id, data)`
- **`router.js`** — vue-router routes
- **`App.vue`** — sidebar list of artifacts + main content area
- **`components/ArtifactItem.vue`** — renders the active artifact; for scenes mounts a p5 instance and calls `renderSceneP5` on each draw frame; for scripts fetches and imports `script.js`
- **`components/renderSceneP5.js`** — p5.js renderer: scales/centers viewport into container, draws nodes in order, then applies effects (grain via `loadPixels`/`updatePixels`)
- **`components/renderScene.js`** — legacy Canvas 2D renderer (currently unused; p5 renderer is active)

### Rendering flow

`ArtifactItem` → p5 `draw()` loop → `renderSceneP5(s, {width, height}, artifact)`:
1. Clear canvas
2. Compute scale + offset to fit `artifact.viewport` into container (letterbox)
3. Draw each node by type (`background` → filled rect, `shape/rect` → filled rect)
4. Apply effects outside the transform (`grain` → pixel noise)

### Parent repo

This is a sub-project of the `ocraft/` monorepo. See `../CLAUDE.md` for the backend scheduler, CLI, and API server that live alongside this frontend.
