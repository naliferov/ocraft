#!/usr/bin/env bash
# announce.sh — show a message fullscreen in the browser as a big, stylish
# auto-fitting "slide" (black text on white). Text is the argument(s).
#
#   bash announce.sh "Big news! We ship Friday."
#
# Newlines in the message are preserved (pass them literally, or use $'...\n...').
set -euo pipefail

TEXT="${*:-}"
if [ -z "${TEXT//[[:space:]]/}" ]; then
  echo "usage: announce.sh <message text>" >&2
  exit 1
fi

OUT="${ANNOUNCE_FILE:-${TMPDIR:-/tmp}/announce.html}"

# HTML-escape the dynamic text so it can't break the markup (& < > only;
# quotes are safe inside text content, newlines are kept and rendered via
# white-space:pre-wrap). printf '%s' writes it literally — no shell re-parsing.
esc=$(printf '%s' "$TEXT" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')

{
cat <<'EOF'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>announcement</title>
<style>
  html, body { margin: 0; height: 100%; }
  body {
    height: 100vh; width: 100vw; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 32%, #ffffff 0%, #f1f1f3 100%);
    color: #0a0a0a;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
                 Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  #msg {
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.02em;
    text-align: center;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 90vw;
    padding: 0 4vw;
  }
</style>
</head>
<body>
EOF
printf '<div id="msg">%s</div>' "$esc"
cat <<'EOF'

<script>
  var el = document.getElementById('msg');
  function fit() {
    var maxW = window.innerWidth  * 0.90;
    var maxH = window.innerHeight * 0.86;
    var lo = 8, hi = Math.max(200, window.innerHeight), best = lo;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      el.style.fontSize = mid + 'px';
      if (el.scrollWidth <= maxW && el.scrollHeight <= maxH) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    el.style.fontSize = best + 'px';
  }
  window.addEventListener('resize', fit);
  fit();
  document.title = (el.textContent.split('\n')[0] || 'announcement').slice(0, 60);
</script>
</body>
</html>
EOF
} > "$OUT"

# Open in the default browser (macOS). `open` returns immediately.
if command -v open >/dev/null 2>&1; then
  open "$OUT"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OUT" >/dev/null 2>&1 &
fi

echo "$OUT"
