# ocraft — UI/UX & usage research

A living research: who ocraft is for, what problem it uniquely solves, how it compares
to the leaders, what those leaders _lack_, what the core node types should be, and a plan to
investigate usage. This is the "why anyone would use this" doc — keep it current.

## The one-line wedge

**ocraft = a personal node OS where data and behavior live in one tree — a note can also _run_.** It
realizes "programmable notes" as a **first-class** idea (not a plugin escape hatch): nodes are typed
(notes, scripts, …), scripts compose (`x.x`), render, and automate; a command **terminal** drives
everything; a scheduler runs things; AI is a tool. And it's **local-first** — you own the files. That
intersection — Obsidian's ownership + Tana's programmability + a real runtime — is the gap.

## The problem (what people actually struggle with)

Across every popular tool the same pains recur:

- **Notes are passive data.** To _do_ anything (transform, fetch, automate, compute) you escape to
  plugins, formulas, or external scripts. The note can't act.
- **Fragmentation.** Notes live here, automations there, code elsewhere, media in a fourth place. No
  single tree holds "my knowledge + my programs + my files + my automation."
- **Lock-in** (the SaaS ones) — proprietary formats, no offline, hard to leave.
- **Performance** degrades at scale; **mobile** is an afterthought.
- **The "programmable notes" desire is real and underserved** — given agency, people enthusiastically
  write programs over their own notes (Maggie Appleton's thesis). Today that means brittle plugins,
  not first-class code.

## Competitive landscape — and what users LACK in each

- **Obsidian** (local-first markdown + plugins). Loved for ownership + links. Gaps users hit: weak
  **mobile**; **performance** degrades on big vaults; native **search** lacks boolean/queries; **no
  native tasks**; no real-time **collaboration**; a **plugin-maintenance treadmill**; no enforced
  structure → "chaos at scale". Programmability = JS plugins: powerful but heavy, fragile, sandbox-less.
- **Notion** (block DB, SaaS). Powerful databases. Gaps: **slow** (~1,000-block wall), **no true
  offline**, file-size limits, **vendor lock-in** (proprietary), steep learning curve, mobile is a
  "read-only viewer", relations confined to one workspace, formulas can't reference formulas.
- **Anytype** (local-first object DB). Clean, P2P-sync. Gaps: brutal learning curve (reportedly loses
  ~90% of new users early), limited **search/export**, missing calendar/templates/reminders/**formulas**,
  weak mobile parity + collaboration.
- **Logseq** (local-first outliner, markdown/org). Block outliner + queries + local ownership. Gaps:
  niche outline-only model, dev velocity/performance complaints.
- **Tana** (outliner + DB + AI, SaaS). The closest to "programmable": supertags, fields, computed
  values, AI automation. Gaps: **SaaS lock-in**, complexity, cost — and it still isn't "run arbitrary
  code".
- **Roam** (graph outliner, SaaS). Pioneered bidirectional links. Gaps: SaaS, stagnation, price.

**The pattern:** the leaders split into "own your data but notes are passive" (Obsidian/Logseq/Anytype)
and "programmable-ish but locked-in + can't run real code" (Notion/Tana/Roam). **Nobody offers
first-class, local-first, note-that-is-a-program.**

## Where ocraft fits (the bet)

ocraft's one thing none of them have first-class: **a note that is a program**, in a tree you own,
driven by a command terminal, with a scheduler + AI built in. The differentiators that fall out:
scripts as first-class nodes that `x.x`-compose, render (a canvas "collage"), and automate; the
keystone (a node _type_ is itself a node/handler); and — the strength already felt — **links navigate
across every type** (`[[id]]` / `/node/:id`): a markdown note links to an html doc links to a runnable
script links to a table. The tree + links are the universal namespace; the type is just the renderer.

## Core node types — research (what beyond html/md?)

The "typographical document" core to settle:

- **markdown** — the PKM lingua franca (Obsidian/Logseq); portable, diff-able, plain-text. Strongest
  candidate for the _default_ doc type.
- **html** — richer rendering (current); less portable. Keep for rich docs.
- **mdx / markdownx** — markdown + embedded components/interactivity: a doc that runs inline. Uniquely
  fits ocraft's "doc that runs" thesis — a differentiator, not a me-too.
- **txt** — plainest, most portable; the base for append-only capture.
- **outliner** — nested blocks (the Logseq/Tana/Roam shape); a different doc geometry.
- **table** — structured rows (Notion's core).
- **script** — the behavior type (the differentiator); creative things are scripts too.

**Likely core set:** `md` (default doc) · `html` (rich) · `txt` (capture) · `script` (behavior) ·
`category` (folder) — with `outliner` / `table` later. Decide the default text type deliberately: md
wins on portability + the PKM standard; html on richness. Everything beyond the core is a script.

## Plan — investigate how ocraft helps users

1. **Dogfood (you first).** Run your real producer workflow in ocraft for 2–4 weeks; log every friction
   and every "I wish ocraft could…" right here in this doc.
2. **Name the wedge user.** Who has the problem ocraft _uniquely_ solves? A producer / builder /
   PKM power-user who wants programmable, local-first notes + automation + code in one owned tree.
3. **State the job-to-be-done.** "I want my notes, my files, my automations, and my code in ONE tree I
   own, driven by command." Validate it's a real, recurring pain (not just yours).
4. **Ask what people escape FOR.** Interview ~5 people in the wedge: what do they leave
   Obsidian/Notion/Tana to do? Those exits are ocraft's build list.
5. **Demo the un-copyable.** The most demoable wedges — note-that-runs, the terminal driving the whole
   OS, a script mixing media — become clips → Show HN / X / a devlog.
6. **Settle the core types** (md/html/txt/script + category) and the link-navigation story; ship the
   keystone (type = node) so "create any node type" becomes literally true.
7. **Re-check the field** quarterly — the programmable-notes space is heating up; keep this competitive
   section current.

## The thesis to test

The underserved desire is **programmable, local-first knowledge + automation in one place**. Obsidian
owns local-first but notes are passive (plugins are the hack). Notion/Tana are programmable-ish but
lock you in and can't run real code. ocraft's bet: **notes that ARE programs, in a tree you own, driven
by command** — the "programmable notes" dream shipped as the product, not bolted on.

---

_Sources for the competitive gaps: practicalpkm.com (Obsidian report card), medium.com (Obsidian
problems; "Why users abandon Notion"), unstar.app (power-user complaints 2026), dev.to (Notion
database walls), xda-developers.com (Notion falling behind), producthunt.com + thebusinessdive.com
(Anytype reviews), toolfinder.com (PKM/Logseq), maggieappleton.com ("Programmable Notes"). Refresh
periodically._
