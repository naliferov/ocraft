# ocraft

A small, framework-free personal automation stack built on plain Node.js (ESM):

- a **job scheduler + executor** driven by a tiny CLI,
- a **process manager** for long-running helpers,
- a **node API server** backing a **Vue 3 + p5.js visual editor** — a hierarchical tree of typed nodes (scenes, scripts, HTML notes, …) that doubles as a personal knowledge base,
- and standalone **MCP servers** (Telegram, Gmail, Google Calendar, DigitalOcean) that let an AI assistant read from your accounts and drive infra.

The long-term direction is a personal life-management system — the scheduler decides *when/what*, the MCP servers are the I/O channels, and an assistant supplies the language/judgment step. See [`IDEAS.md`](IDEAS.md) for the roadmap (a parking lot, not a spec).

## Layout

```
ocraft/
  cli.js            # CLI entry point (scheduler, executor, proc manager)
  backend/          # Scheduler/executor engine, proc manager, node API server, data store
  frontend/         # Vue 3 + p5.js visual editor (separate Vite dev server)
  mcp-servers/      # Standalone MCP servers
    telegram-mcp/   #   read/search a Telegram account (GramJS / MTProto)
    gmail-mcp/      #   read/search Gmail
    gcal-mcp/       #   read Google Calendar (service account, read-only)
    digitalocean-mcp/ # manage DigitalOcean droplets / infra
  .claude/skills/   # Reusable agent skills (morning-report, youtube-transcribe, …)
  IDEAS.md          # Roadmap / parking lot
  CLAUDE.md         # Guidance for AI coding agents
```

Backend and frontend are independent apps. The frontend talks to the backend only over `/api/*` (HTTP, port 3001). The MCP servers are unrelated to the scheduler and are registered in `.mcp.json`.

## Requirements

- Node.js 18+ (uses native ESM and `node:` built-ins)
- A `.env` file at the repo root (loaded via `dotenv`)

## Setup

```bash
npm install                 # root deps (dotenv, MCP SDK)
cd backend && npm install   # only needed for image-optimize entries (sharp)
cd frontend && npm install  # editor deps
```

## Backend — scheduler & CLI

The executor loads an entry module from `backend/entries/<name>.js`, runs its exported `run(ctx)`, and writes a record to `backend/executions/`. The scheduler (`backend/scheduler.js`) defines `jobs[]` and runs the ones that are due, tracking `lastRunAt` per job.

```bash
node cli.js run <entry-name> [args...]   # run a single entry once
node cli.js start-scheduler              # run all due jobs once (call periodically via cron)
node cli.js list-executions              # print recent execution log
```

Each entry receives a `ctx`: `args`, `env`, `log(msg)`, persistent `state.load()/save()`, and `time.now()`. Existing entries include `telegram-reminder`, `telegram-poll`, `img-optimize[-dir]`, `import-thinktank` (Obsidian vault → nodes), `do-droplet-up` / `do-droplet-down`, `deploy`, `every-hour`, and `test`.

### Proc manager

For long-running helpers (e.g. the frontend dev server, a ticker), one config file per process lives in `backend/procs/`, discovered like entries. Runtime state and logs are kept in `backend/state/procs/`.

```bash
node cli.js proc list                  # show configured procs and status
node cli.js proc status <id>
node cli.js proc start <id>
node cli.js proc stop <id>
node cli.js proc restart <id>
node cli.js proc logs <id> [lines]     # tail the proc log
node cli.js proc clear-logs <id>
```

## Frontend — visual editor

```bash
cd frontend
npm run dev      # Vite dev server; auto-spawns the backend API server on port 3001
npm run build
```

The backend API server (`backend/server.js`) is a minimal HTTP server on port 3001 that reads/writes node JSON under `backend/data/nodes/`. It can also be run standalone with `node backend/server.js`. See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for editor internals.

### Nodes

Nodes form a hierarchical tree (each node points to its parent via `parentId`; the `category` type acts like a folder). A node's `type` selects its editor:

- **scene** — a p5.js canvas with elements, effects, and a Tone.js step sequencer
- **script** — a `script.js` run on demand; can compile to **WASM** (AssemblyScript) and call other scripts by name
- **html** — rich / raw-HTML notes (the knowledge base lives here)
- **category** — a folder node that just holds children
- **ai-chat** — a chat node backed by the Claude Agent SDK

`node cli.js run import-thinktank [vaultPath]` migrates an Obsidian Markdown vault into `html` nodes under a `notes` category: wikilinks become internal `/node/:id` links, the folder hierarchy is rebuilt from a map-of-content note via `parentId`, and embedded images are optimized into `data/assets/img/optimized/`. It is idempotent (wipe-on-rerun) and writes a manifest. Once imported, **the nodes are the source of truth** — edit them in the editor, not the original Markdown.

## MCP servers

Standalone Model Context Protocol servers in `mcp-servers/`, registered in [`.mcp.json`](.mcp.json). Each has its own `README.md` and `.env.example`; copy that to `.env` and fill in credentials.

- **telegram-mcp** — read/search a Telegram user account over MTProto (GramJS). Run `npm run login` once to create a session string.
- **gmail-mcp** — read/search a Gmail account.
- **gcal-mcp** — read-only Google Calendar access via a Google Cloud **service account**. Share the target calendar with the service account email, then point `GOOGLE_APPLICATION_CREDENTIALS` at the JSON key.
- **digitalocean-mcp** — manage DigitalOcean droplets and infrastructure via the DO API (token in `.env`).

> **Secrets:** `.env` files, Telegram session strings, and the Google service-account JSON key are git-ignored and must never be committed. The `.env.example` files are placeholders only.

## License

Personal project — no license specified.
