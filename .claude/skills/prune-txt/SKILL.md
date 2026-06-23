---
name: prune-txt
description: Prune text to its essentials without rewriting — strip formatting, drop scaffolding/labels, and cut illustrations, asides, and secondary detail, while keeping every surviving sentence verbatim (original wording, capitalization, em-dashes, language). Use when the user asks to "prune-txt", "prune this", "cut the non-essential / bullshit but keep it readable", "strip the formatting and trim the fluff", or wants a leaner readable version that preserves the prose and voice — not the lowercase telegraphic compression of minimal-txt.
---

# prune-txt — prune text to its spine

Take a chunk of text and return a **leaner version with every non-essential span and all formatting removed — but every surviving sentence kept verbatim.** This is *subtractive editing*, not compression: you **delete** spans, you never **reword** them.

## The rules (apply all, hard)

1. **De-format — strip all decoration, keep the words.** Remove `**bold**` and `*italic*` markers, `>` blockquote markers, heading syntax (`#`…`######`) together with any leading section number (`## 2.` → bare line), `---`/`***` horizontal rules, and wrapper tags (`<p>`, `<blockquote>`). A heading becomes a plain title line; an emphasized word becomes a plain word.

2. **De-scaffold — drop administrative labels, keep the real title.** Strip chapter/section prefixes (`Розд. 2 —`, "Chapter 2:", "Part I —", "Preface /") and the «», "", '' wrapping a title, leaving the descriptive title itself. Cut pure connective lead-ins that only announce what follows ("The whole book is a single arc:", "Уся книга — це єдина причинна дуга:") and self-referential meta about the text ("this is the lasting contribution", "the book's signature move is…").
   - **Parenthetical test:** drop parentheticals that describe a section's *form or importance* (`(in one arc)`, `(with arguments)`, `(conceptual core)`); **keep** parentheticals that name *content* (`(Luther and Calvin)`, `(my own)`, `(1941)`).

3. **Prune to the spine.** Inside each kept block, cut the second-order material: illustrations and examples, biblical/literary/historical asides, secondary named sub-concepts that aren't the block's headline, restatements, and praise of the text. Keep the topic sentence, the core mechanism, and the block's key named terms. A quotation survives only if it sits on the spine — a quote embedded inside a cut aside goes with it. Typical cut is ~30–50% of a body paragraph.

4. **Keep everything that survives VERBATIM.** No rewording, no abbreviation, no merging of sentences, no paraphrase, no symbol substitutions. You may delete a span; you may not rewrite one. *This is the line between prune-txt and minimal-txt.*

5. **Preserve case, punctuation, and language.** Do **not** lowercase — keep original capitalization. Keep em/en dashes (`—`, `–`) and all original punctuation. Keep the source language. The output must read as clean, grammatical prose — just lighter.

6. **Keep meaning-bearing structure.** A bullet list that is already a terse glossary stays a bullet list (just strip the bold). Only decoration and dead weight come out; structure that carries information stays.

7. **When unsure, keep it.** If you can't tell whether a span is spine or aside, leave it. Better to under-prune than drop a distinct fact. Never invent or alter a claim — removal only.

8. **The author's own voice is the high bar.** Material that is the author's *own* analysis, argument, or conclusion (as opposed to summarized source material) gets de-formatted but pruned only lightly — unless the user explicitly asks to cut it hard.

## Output

Return only the processed text (no preamble), in the source medium (plain text / markdown / html). If the source was a file or node, show the result first, then offer to write it back (or to a new file).

## Not minimal-txt

`minimal-txt` and `prune-txt` are opposites in method:
- **minimal-txt** *rewrites* every sentence smaller — lowercase, telegraphic fragments, abbreviations. Output is dense scratch notes; readability and voice are traded for size.
- **prune-txt** *deletes whole spans* and formatting but leaves surviving sentences untouched — full grammar, original case, em-dashes. Output is clean readable prose, just leaner.

If the user wants maximal lowercase compression → **minimal-txt**. If they want a readable distilled version that keeps the wording and voice → **prune-txt**.

## Example

before:
```
## 2. Відокремлення індивіда (однією дугою)

**Розд. 2 — «Двоїстість свободи»**
Індивідуація діалектична: вона водночас *зміцнює* "я" і посилює самотність. Переосмислюється Гріхопадіння: вкушання з дерева пізнання є «першим актом свободи». Це переосмислення і є тривкий внесок.
```

after:
```
Двоїстість свободи
Індивідуація діалектична: вона водночас зміцнює "я" і посилює самотність.
```

(dropped the `## 2.` heading and its form-parenthetical, stripped `Розд. 2 — «»` to a bare title, removed the `*italic*`, cut the Genesis aside and the self-referential closing line — kept the spine sentence verbatim, em-dash and all.)
