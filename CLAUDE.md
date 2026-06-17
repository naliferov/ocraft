# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository. It covers how to *behave* here (conventions, rules, ops). For the project overview — layout, setup, the scheduler/CLI, the proc manager, the editor, and the MCP servers — see **[`README.md`](README.md)**.

## Where things live

- **[`README.md`](README.md)** — what ocraft is and how to run it: structure, setup, scheduler/CLI, proc manager, visual editor, node types, and MCP servers. Start here.
- **[`frontend/CLAUDE.md`](frontend/CLAUDE.md)** — visual-editor internals (node types, render loop, `/api` endpoints).
- **Roadmap** — the *Roadmap* section at the bottom of [`README.md`](README.md): a parking lot of future ideas, not a spec — confirm before building from it.
- **[`plans/`](plans/)** — longer-form design notes (Deno-deploy MCP, TypeScript/lint adoption, YouTube content).

Backend and frontend are independent apps; the frontend reaches the backend only over `/api/*` (HTTP, port 3001). MCP servers live in `mcp-servers/` (registered in `.mcp.json`).

## Conventions & coding rules

Follow these when writing or editing code here (it's `.js` everywhere — every package is ESM):

- **Never use the `.mjs` extension.** Every package here is ESM already (`"type": "module"` in package.json), so plain `.js` is ESM. Use `.js` for all JavaScript files — scripts, helpers, one-offs, everything.
- **Develop on `main` — don't create feature branches.** Build features directly on `main`; do not `git checkout -b` a feature/topic branch for development. (This overrides the generic "branch before committing on the default branch" default for this repo.)
- **No single-letter variable names.** Use a descriptive name for every binding — including callback parameters, `.map`/`.filter`/`.find` args, loop counters, and regex matches. Write `const droplet = await getDroplet(id)`, not `const d = …`; `images.filter((image) => …)`, not `(i) => …`; `for (let attempt = 0; …)`, not `for (let i = 0; …)`. The name should say what the value *is*.
- **No boolean flag parameters.** A `fn(…, true)` call site is opaque — the reader can't tell what `true` selects. When a flag would switch between two behaviours, prefer the most minimal split that removes the boolean: usually **two intention-named functions**, otherwise a named mode/strategy (e.g. a string `'rich'`/`'source'`, a passed-in handler, or a small factory). Write `editRich()` / `editSource()`, not `enterEdit(true)` / `enterEdit(false)`. This applies to new code and to flags you touch while editing.

## Monetization & marketing lens (apply to every feature)

Whenever you propose, plan, or build a feature, also analyze — and surface it in the plan/PR/idea, not as an afterthought — two angles:

- **Monetization** — how could this feature make money? (paid tier, usage/metered pricing, one-off sale, marketplace cut, hosted/SaaS version, sponsorship, paid template/asset packs). Name *who* would pay, *why*, and the cheapest viable way to charge. If there's no realistic angle, say so plainly rather than inventing one.
- **Marketing** — how would it reach people? The "show, don't tell" artifact (demo clip, screenshot, before/after), the channel (YouTube, X, Reddit, HN, Telegram), the hook/headline, and the target user. Many ocraft features are visual/demoable — favor a recordable demo. See the YouTube content plan in `plans/youtube-content-plan.txt`.

Park concrete monetization/marketing ideas in the README *Roadmap* next to the feature they belong to. This lens is a default habit, not a gate — keep it short and honest.
