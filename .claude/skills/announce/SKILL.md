---
name: announce
description: Display a message fullscreen in the browser as a big, stylish, auto-fitting "slide" — black text on white, PowerPoint-style, font shrinks to fit the screen. The message is passed as the argument. Use when the user wants to "announce" something, "show a big message/announcement in the browser", "put text on screen big", "make a slide", or display a fullscreen notice.
---

# Announce → big fullscreen browser slide

Render a one-line (or short multi-line) message as a clean, bold, **auto-fitting slide**
and open it in the default browser. Black text on a soft-white background, centered,
PowerPoint-style. The font binary-searches the largest size that still fits the viewport,
and re-fits on window resize.

## Run

```bash
bash .claude/skills/announce/announce.sh "<message text>"
```

- The message is everything after the script name (the skill **argument**).
- Multi-line works — preserve real newlines, e.g. `announce.sh $'Shipping Friday\n— the team'`.
- Prints the path of the generated HTML to stdout and opens it in the browser.

Examples:

```bash
bash .claude/skills/announce/announce.sh "Big news! We ship Friday 🚀"
bash .claude/skills/announce/announce.sh $'Standup in 5 min\nJoin the call'
```

## Options (env vars)

- `ANNOUNCE_FILE` — where to write the HTML (default `$TMPDIR/announce.html`, overwritten each run).

## Notes

- macOS uses `open`; Linux falls back to `xdg-open`.
- Text is HTML-escaped before injection, so quotes / `<` / `>` / `&` in the message are safe.
- Very long text just shrinks to fit — but it's a *slide*, so keep it short for impact.
- To restyle (e.g. white-on-black, yellow-on-black, an accent bar), edit the `<style>`
  block in `announce.sh`.
