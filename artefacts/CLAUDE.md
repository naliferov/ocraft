# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (launches Vite + Node API server concurrently)
npm run dev

# Build for production
npm run build

# Sync system visuals from tree structure
npm run sync:system
```

The `vite.config.js` `backendPlugin` automatically spawns `server.js` when Vite starts and restarts it on changes.

## Architecture

This is a **visual scene editor** — a Vue 3 + p5.js app for composing and previewing scene-based visuals ("artefacts") stored as JSON.

### Data model (`data/visuals/<id>/state.json`)

Each visual is a JSON document with:
- `viewport` — logical canvas dimensions (e.g. 160×90 at 16:9)
- `nodes[]` — scene objects typed as `background`, `shape`, `phrase`, etc., each with `props`, `state`, `events`
- `effects[]` — post-process passes (e.g. `grain` with `intensity`)
- `tempo`, `structure` — music timing metadata (bpm, bars, loop)

### Backend (`server.js`)

Minimal Node.js HTTP server on port 3001 (no framework). Routes:
- `GET /api/visuals` — list all visuals (reads all `state.json` files)
- `GET /api/visuals/:id` — read one visual
- `POST /api/visuals/:id` — overwrite `state.json` for a visual

Vite proxies `/api/*` to port 3001 during development.

### Frontend (`src/`)

- **`stores/visuals.js`** — Pinia store; fetches visuals list, tracks `activeId`, exposes `save(id, data)`
- **`App.vue`** — sidebar list of visuals + main content area
- **`components/VisualItem.vue`** — renders the active visual; mounts a p5 instance into `.visual-preview`, observes container resize, calls `renderSceneP5` on each draw frame
- **`components/renderSceneP5.js`** — p5.js renderer: scales/centers viewport into container, draws nodes in order, then applies effects (grain via `loadPixels`/`updatePixels`)
- **`components/renderScene.js`** — legacy Canvas 2D renderer (currently unused; p5 renderer is active)

### Rendering flow

`VisualItem` → p5 `draw()` loop → `renderSceneP5(s, {width, height}, visual)`:
1. Clear canvas
2. Compute scale + offset to fit `visual.viewport` into container (letterbox)
3. Draw each node by type (`background` → filled rect, `shape/rect` → filled rect)
4. Apply effects outside the transform (`grain` → pixel noise)

### Parent repo

This is a sub-project of the `ocraft/` monorepo. See `../CLAUDE.md` for the runtime scheduler and CLI that live alongside this frontend.
