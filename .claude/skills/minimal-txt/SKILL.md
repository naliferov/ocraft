---
name: minimal-txt
description: Aggressively compress text — lowercase everything, strip filler and unnecessary words, and rewrite into terse telegraphic notes while keeping every fact. Use when the user asks to "minimal-txt", "aggressively shorten/compress this", "strip the fluff", "make it terse/lowercase", or wants a maximally compact version of a note, message, or passage.
---

# minimal-txt — aggressive text processor

Take a chunk of text and return the **most compact lowercase version that still carries every fact**. Aggressive on *words*, lossless on *information*.

## The rules (apply all, hard)

1. **Lowercase everything** — prose goes fully lowercase. *Preserve literals that lowercasing would break or muddle*: code, file paths, URLs, identifiers, and meaning-bearing acronyms (e.g. keep `IgG4`, `RxJS`, `kernel/api.js`, `https://…`, `SFX`).
2. **Delete unnecessary words** — articles (a / an / the) when droppable; 
fillers (very, really, just, actually, basically, quite, simply, kind of, that); hedges (i think, maybe, it seems, arguably); empty intensifiers and decorative adjectives/adverbs; politeness and meta ("as you can see", "it's worth noting");
restatements of a point already made.
3. **Summarize aggressively** — compress to the essence. Fragments over sentences, notes over paragraphs. Drop non-load-bearing clauses, merge duplicate points. Keep cutting until only signal remains (aim ≥50% shorter; more when you can).
4. **Compact substitutions** — digits not words (3, not three); symbols (`&`, `w/`, `→`, `~`, `%`); common abbreviations (bc, w/o, vs, e.g.).
5. **Lose no information** — every fact, number, name, link, decision, and `/node/:id` survives. Cut *words*, never *data*. When unsure whether something is load-bearing, **keep it**. Never invent, rephrase into a falsehood, or "improve" a claim — compression only.
6. **Flat layout — no paragraphs, no bullets.** Drop `<p>` paragraphs and `<ul>`/`<li>` bullet lists entirely. Separate items with a single newline; use a double newline only when a bigger visual gap is genuinely needed. In an HTML node that's `<br>` between lines and `<br><br>` for a gap — never `<p>`, `<ul>`, or `<li>`.
7. **No oversized text — normalize to body size, bold for emphasis.** Collapse big headings (`<h1>`–`<h6>`, markdown `#`…`######`) and any enlarged inline font (`font-size`, `style="..."`, big/large classes) down to default body text. Size is not a highlighting tool here — if a line genuinely needs to stand out, make it **bold** (`<strong>` in html, `**…**` in markdown), never a heading or a larger font.
8. **Collapse recognizable URLs → plain text.** When a link's URL carries a unique, famous, recognizable word that identifies the resource on its own (a known site / project / brand / work — e.g. `https://natureofcode.com` → `natureofcode`, `https://worrydream.com/refs/…` → `worrydream`), drop the URL and anchor, keep just that plain word. This is a **narrow exception to rule 5's "keep every link"** — it applies *only* when the word alone makes the resource re-findable. Keep the full URL otherwise: opaque domains, long/id/query paths, or anything you couldn't recover from the word (`archive.org/details/SelectedPapers1977/…` stays). Internal `/node/:id` wikilinks always stay as links.
9. **Plain hyphen, never em/en dashes.** Use `-` instead of `—` (em dash) or `–` (en dash). Replace them everywhere in the output, including ranges (`5-6`, not `5–6`) and parenthetical breaks (`крон (помірний) - щадне`, not `… — щадне`).

## Output

Return only the processed text (no preamble), in the source medium (plain text / markdown / html). If the source was a node or file, show the result first, then offer to write it back (or to a new note).

## Example

before:
> I think we should probably consider using the Observable API instead of RxJS, because honestly it's a lot simpler and the bundle size is really much smaller.

after:
> use observable api instead of rxjs → simpler, much smaller bundle

## Not prune-txt

This skill *rewrites* text smaller — lowercase, telegraphic, abbreviated. If the user instead wants the prose kept **readable and verbatim** — only stripping formatting and cutting non-essential spans, with original case and em-dashes preserved — use **prune-txt**.
