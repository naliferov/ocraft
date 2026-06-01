# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo structure

```
ocraft/
  cli.js            # CLI entry point for the backend (imports backend/*)
  backend/          # Job scheduler/executor engine + node API server + data store
  frontend/         # Vue 3 + p5.js visual editor (separate dev server)
  telegram-mcp/     # Standalone MCP server: read/search a Telegram user account (GramJS/MTProto)
```

The backend and frontend are independent apps; the frontend talks to the backend only over `/api/*` (HTTP, port 3001). `telegram-mcp/` is a separate MCP server (registered in `.mcp.json`) unrelated to the scheduler — see its own `README.md`.

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
