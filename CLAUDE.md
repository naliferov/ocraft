# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo structure

```
ocraft/
  cli.js            # CLI entry point for the backend (imports backend/*)
  backend/          # Job scheduler/executor engine + node API server + data store
  frontend/         # Vue 3 + p5.js visual editor (separate dev server)
  telegram-mcp/     # Standalone MCP server: read/search a Telegram user account (GramJS/MTProto)
  IDEAS.md          # Roadmap / parking lot for future work — read when planning ahead
```

The backend and frontend are independent apps; the frontend talks to the backend only over `/api/*` (HTTP, port 3001). `telegram-mcp/` is a separate MCP server (registered in `.mcp.json`) unrelated to the scheduler — see its own `README.md`.

For future direction (planned features, infrastructure ideas, learning goals), see `IDEAS.md` — a parking lot, not a spec; confirm before building from it.

## Conventions

- **Never use the `.mjs` extension.** Every package here is ESM already (`"type": "module"` in package.json), so plain `.js` is ESM. Use `.js` for all JavaScript files — scripts, helpers, one-offs, everything.
- **Develop on `main` — don't create feature branches.** Build features directly on `main`; do not `git checkout -b` a feature/topic branch for development. (This overrides the generic "branch before committing on the default branch" default for this repo.)

## Coding rules

Numbered rules for code in this repo. Follow them when writing or editing any `.js` here.

1. **No single-letter variable names.** Use a descriptive name for every binding — including callback parameters, `.map`/`.filter`/`.find` args, loop counters, and regex matches. Write `const droplet = await getDroplet(id)`, not `const d = …`; `images.filter((image) => …)`, not `(i) => …`; `for (let attempt = 0; …)`, not `for (let i = 0; …)`. The name should say what the value *is*.

2. **No boolean flag parameters.** A `fn(…, true)` call site is opaque — the reader can't tell what `true` selects. When a flag would switch between two behaviours, prefer the most minimal split that removes the boolean: usually **two intention-named functions**, otherwise a named mode/strategy (e.g. a string `'rich'`/`'source'`, a passed-in handler, or a small factory). Write `editRich()` / `editSource()`, not `enterEdit(true)` / `enterEdit(false)`. This applies to new code and to flags you touch while editing.

## ThinkTank → ocraft migration (IMPORTANT — ocraft nodes are now the source of truth)

The **ThinkTank** Obsidian vault (`../ThinkTank/`) has been migrated into ocraft **nodes**: each note is an `html` node, organised by `parentId` under a top **`notes`** category, names lowercased, wikilinks rewritten to `/node/:id` links, embedded images served from `data/assets/img/optimized/`. **These ocraft nodes are now the source of truth for that content** — edit them in ocraft (the editor UI, or the node's `backend/data/nodes/<id>/content.html` body file directly; `state.json` holds only metadata). Do **not** edit the ThinkTank `.md` source expecting it to flow through.

- **The importer `backend/entries/import-thinktank.js` was a one-time migration — do NOT re-run it to tweak content.** A re-run is destructive: it deletes the previous import (tracked in `backend/data/thinktank-import.json`) and regenerates everything from the `.md` source, **discarding any in-place edits to the migrated nodes and reassigning node ids**. To change a migrated note, edit the node, not the source + re-run.
- **Never migrate credential/private notes** into this (public) repo. The importer's `EXCLUDED` set skips them; keep it that way. New sensitive notes belong in a private space, not here.
- Manifest (`thinktank-import.json`) records what was migrated; it can go stale if nodes are later deleted/renamed in the UI, so treat the **live node tree** (the `notes` subtree) as authoritative, not the manifest.

## Life-management vision (direction, not yet built)

Beyond dev chores, the intent is to grow this stack into a **personal life-management system**, with **ThinkTank** (`../ThinkTank/`, the Markdown/Obsidian knowledge base) as the hub and source of truth for organizing daily life — eat, sleep, work, and the rest. ocraft is the automation layer: the scheduler + entries decide *when/what*, the Telegram MCP/bot is the input/output channel, and Claude supplies the judgment/language step (turning raw inputs — chats, repos, photos — into summaries and decisions). ThinkTank holds the durable memory: plans, daily notes, logs, reviews. This is a direction, not a spec — confirm before building, and park concrete feature ideas in `IDEAS.md`.

## Transcribing audio (whisper.cpp is already installed)

For transcribing Telegram voice notes (e.g. download via `telegram-mcp`, write transcript to a `.txt`), use the **whisper.cpp** install that's already on this machine — do NOT reinstall or hunt for `whisper` / `main` / `~/.cache/whisper` (those don't exist here):
- Binary: **`whisper-cli`** at `/opt/homebrew/bin/whisper-cli` (Homebrew `whisper-cpp`).
- Model: `~/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin` (multilingual; handles Russian/Ukrainian well).
- Telegram voice notes are Opus `.ogg`; `whisper-cli` needs 16 kHz mono WAV, so convert with `ffmpeg` first.

```bash
ffmpeg -y -i in.ogg -ar 16000 -ac 1 -c:a pcm_s16le out.wav
whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin -f out.wav -l ru -nt -np > out.txt
```

(`-l` sets language, `-nt` drops timestamps, `-np` suppresses progress so stdout is clean transcript. Whisper may emit a short repeated phrase on trailing silence — harmless, trim if needed.)

---

## Backend (`backend/` + `cli.js`)

A lightweight job scheduler and executor plus the node API server. No external frameworks — plain Node.js ESM.

### CLI

```bash
node cli.js run <entry-name> [args...]   # run a single entry function
node cli.js start-scheduler              # run all due jobs once (call periodically via cron)
node cli.js list-executions              # print recent execution log
```

Requires a `.env` file at the repo root (loaded via `dotenv`). `cli.js` lives at the repo root; its runtime dependency `dotenv` is in the root `package.json`. `sharp` (used only by the image-optimize entries) lives in `backend/package.json` — run `cd backend && npm install` before using those entries.

### Architecture

**Executor (`backend/executor.js`)** — loads an entry module by name from `backend/entries/<name>.js`, calls its exported `run(ctx)` function, and writes an execution record to `backend/executions/<id>.json`. The `ctx` object passed to entries exposes:
- `ctx.args` — CLI args passed to the entry
- `ctx.env` — `process.env`
- `ctx.log(msg)` — appends timestamped log entries to the execution record
- `ctx.state.load()` / `ctx.state.save(state)` — persistent per-entry JSON state in `backend/state/entries/<name>.json`
- `ctx.time.now()` — current time string

Executions are capped at 500 files (oldest rotated out by `storage.js`).

**Scheduler (`backend/scheduler.js`)** — defines `jobs[]`, each with an `id`, `entry` name, and either `intervalMs` or a `schedule: { hour, minute }` cron-like spec. Optional `activeHours: { from, to }` restricts execution to an hour window. On each invocation, checks which jobs are due against `backend/state/scheduler.json` (tracks `lastRunAt` per job id), runs them via `executor.js`, and saves updated state.

Uses `withLock('scheduler', fn)` (`backend/lib/lock.js`) — a PID-file lock that polls until clear, preventing concurrent scheduler runs.

**Entries (`backend/entries/`)** — each file exports a single `run(ctx)` function. Current entries:
- `telegram-reminder` — sends a Telegram message via `TELEGRAM_BOT_TOKEN`
- `img-optimize` / `img-optimize-dir` — image optimization via `sharp` (reads/writes `backend/data/assets/img/`)
- `deploy`, `every-hour`, `test` (see files for details)

**API helpers (`backend/api/`)** — thin wrappers (e.g. `telegram.js` for sending messages).

**Node API server (`backend/server.js`)** — minimal Node.js HTTP server on port 3001 (no framework) that reads/writes node JSON under `backend/data/nodes/`. Serves `GET/POST /api/nodes[/:id]` and `GET/POST /api/nodes/:id/body` — a node's sidecar body, resolved by type (script nodes → `script.js`, html nodes → `content.html`), kept out of state.json so the node-list payload stays tiny. Text reads (the list, node bodies) are gzipped. Auto-spawned by the frontend's Vite dev server; can also be run standalone with `node backend/server.js`.

**Data store (`backend/data/`)** — `nodes/` (one folder per node), `assets/` (img/audio/text), `catalogs/`. Owned by the backend; the frontend reaches it only via `/api`.

---

## Frontend (`frontend/`)

See `frontend/CLAUDE.md` for editor-specific details.

### Commands

```bash
cd frontend
npm run dev      # Vite dev server + auto-spawned backend API server (../backend/server.js) on port 3001
npm run build
```
