---
name: ocraft-dev-plan-month
description: Analyze the ocraft repo and produce a sequenced ONE-MONTH autonomous development plan — what to build next, in what order, and why — broken into weekly milestones of small PR-able tasks an AI dev loop can execute. Use when the user asks to "plan ocraft dev", "what should ocraft build next", "make a monthly dev plan", or to feed the autonomous dev cycle.
---

# ocraft monthly dev plan

Produce a bounded, sequenced one-month plan for **autonomous (AI-driven) development**
of ocraft: the model decides where the project should move next, then turns that into
small, independently shippable, verifiable tasks grouped into **weekly milestones**. The
plan is the *input* to the execution half of the loop (a per-task agent run on a branch →
checks → PR).

## Read first (establish state, don't guess)

1. **`IDEAS.md`** — the parking lot (titles + why-interesting).
2. **`IDEAS-PLANS.md`** — the companion plans. Use its **"Dependency / build order"**
   (foundations → leaves) and its tiers (**build-ready** / **design-open** / **spike**).
   Respect the edges (e.g. daily-briefing needs ThinkTank MCP; mobile needs the WS exchange).
3. **`git log --oneline -20`** — what actually shipped recently (don't re-plan done work).
4. **Current code state** — node types (`frontend/src/components/NodeItem/NODE_TYPES`),
   backend routes (`backend/server.js`), entries (`backend/entries/`), procs
   (`backend/procs/`), skills (`.claude/skills/`). Note what already exists so the plan
   builds on it.

## Method

1. **Direction (judgment first).** In 3–5 sentences, state where you think ocraft should
   move next over the month and *why now* — grounded in the build-order and what just
   shipped. **Select and sequence within the existing `IDEAS-PLANS.md` roadmap**; that's
   the human-authored intent. If you think something genuinely new belongs, add it under a
   separate **"Proposed new direction (needs sign-off)"** heading — flagged, not silently
   planned as work. (Re-deciding direction from scratch every month drifts toward what's
   easy to build, not what the user wants.)
2. **Shape the month into 4 weekly milestones.** Give each week a theme that advances the
   direction, ordered so foundations land before the leaves that depend on them. Each week
   should be a coherent, shippable increment — not a random bag of tasks.
3. **Pick each week's tasks.** Choose **3–6 tasks per week** from the build-ready tier,
   ordered by: *unblocks-the-most* > *high value* > *low risk*. Prefer foundations over
   leaves. Each task must be **PR-sized** (one feature/fix, a day or less) and
   **independently shippable + verifiable**. A `design-open` item enters the plan only as a
   *decision spike* (output = a decision + a one-paragraph ADR), never as open-ended building.
4. **Spec each task** with:
   - **Title** + **why now** (value + what it unlocks)
   - **Touchpoints** — the real files/dirs it changes
   - **Acceptance check** — a concrete, observable gate (a command that passes, an
     endpoint that returns X, a screenshot of the running app showing Y). No vague "works".
   - **Size** — S / M / L
   - **Risk / guardrail** — anything that could break; always: branch, run checks, open a PR.
5. **Sequence + defer.** Order weeks and tasks by dependency (foundations first). List what
   you explicitly **deferred this month and why** (so nothing silently drops), and note any
   cross-week dependencies between milestones.

## Output

Write the plan to **`dev-plans/<YYYY-MM-DD>-month.md`** (create the `dev-plans/` dir) so it's
durable and the execution loop can consume it — and print a short summary. Shape:

```md
# ocraft dev plan — month of <date>

## Direction
<3–5 sentences: where the project should move next this month, and why now>

## Week 1 — <theme>
1. **<title>** — <why now>
   - Touchpoints: <files>
   - Acceptance: <observable check>
   - Size: <S/M/L> · Risk: <note>
2. …

## Week 2 — <theme>
…

## Week 3 — <theme>
…

## Week 4 — <theme>
…

## Deferred this month
- <item> — <reason>
```

## Autonomy framing (how this plan gets executed)

This plan feeds the autonomous cycle: **plan (this skill) → execute one task → verify → PR
→ human review**. Two honest preconditions, or the loop produces plausible-looking breakage:

1. **A real verification gate is the keystone, and it doesn't exist yet.** Today ocraft has
   only `node --check` and `npm run build` (syntax/compile) plus manual screenshots — none of
   which proves *behavior*. So until there's an actual test/check harness, **every PR needs a
   human to confirm it works**; the acceptance check is a smoke test, not a correctness proof.
   Building that harness is itself the highest-value early task (see IDEAS-PLANS build order).
2. **The executor is a dedicated `dev-task` entry, NOT `POST /api/ai-chat`.** The ai-chat
   endpoint is bypassPermissions + no-auth + localhost-only — it must never run git/branch/PR
   work. A separate entry owns the explicit git workflow (branch → commit → push → `gh pr
   create`), which also requires `gh` authenticated and `origin` set (verify before relying on
   it). One concern per surface: chat is for interactive local use; `dev-task` is the loop's arm.

Hard rules for whoever executes a task:
- **One task per run**, on a **branch**, never `main`.
- **Gate on the acceptance check** — only open the PR if it passes (`node --check`, the
  frontend build, an entry run, a screenshot — whatever the task specified).
- **PR for human review**; **never auto-merge**.
- Keep tasks bounded — open-ended "build the vision" goes off the rails; "implement task N"
  doesn't.

Keep the plan tight and honest — a month of real, checkable steps grouped into weekly
milestones, not a wishlist.
