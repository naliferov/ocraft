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

**Node API server (`backend/server.js`)** — minimal Node.js HTTP server on port 3001 (no framework) that reads/writes node JSON under `backend/data/nodes/`. Serves `GET/POST /api/nodes[/:id]` and `GET /api/nodes/:id/script`. Auto-spawned by the frontend's Vite dev server; can also be run standalone with `node backend/server.js`.

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
