# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo structure

```
ocraft/
  cli.js            # CLI entry point for the runtime
  runtime/          # Job scheduler + executor engine
  artifacts/           # Vue 3 + p5.js visual editor (separate dev server)
```

---

## Runtime (`runtime/` + `cli.js`)

A lightweight job scheduler and executor. No external frameworks — plain Node.js ESM.

### CLI

```bash
node cli.js run <entry-name> [args...]   # run a single entry function
node cli.js start-scheduler              # run all due jobs once (call periodically via cron)
node cli.js list-executions              # print recent execution log
```

Requires a `.env` file at the repo root (loaded via `dotenv`).

### Architecture

**Executor (`runtime/executor.js`)** — loads an entry module by name from `runtime/entries/<name>.js`, calls its exported `run(ctx)` function, and writes an execution record to `runtime/executions/<id>.json`. The `ctx` object passed to entries exposes:
- `ctx.args` — CLI args passed to the entry
- `ctx.env` — `process.env`
- `ctx.log(msg)` — appends timestamped log entries to the execution record
- `ctx.state.load()` / `ctx.state.save(state)` — persistent per-entry JSON state in `runtime/state/entries/<name>.json`
- `ctx.time.now()` — current time string

Executions are capped at 500 files (oldest rotated out by `storage.js`).

**Scheduler (`runtime/scheduler.js`)** — defines `jobs[]`, each with an `id`, `entry` name, and either `intervalMs` or a `schedule: { hour, minute }` cron-like spec. Optional `activeHours: { from, to }` restricts execution to a UTC hour window. On each invocation, checks which jobs are due against `runtime/state/scheduler.json` (tracks `lastRunAt` per job id), runs them via `executor.js`, and saves updated state.

Uses `withLock('scheduler', fn)` (`runtime/lib/lock.js`) — a PID-file lock that polls until clear, preventing concurrent scheduler runs.

**Entries (`runtime/entries/`)** — each file exports a single `run(ctx)` function. Current entries:
- `telegram-send-movement-reminder` — sends a Telegram message via `TELEGRAM_BOT_TOKEN`
- `img-optimize` / `img-optimize-dir` — image optimization via `sharp`
- `deploy`, `every-hour`, `test`, `send-reminder` (see files for details)

**API helpers (`runtime/api/`)** — thin wrappers (e.g. `telegram.js` for sending messages).

---

## Visual editor (`artifacts/`)

See `artifacts/CLAUDE.md` for frontend-specific details.

### Commands

```bash
cd visual
npm run dev      # Vite dev server + auto-spawned API server on port 3001
npm run build
```
