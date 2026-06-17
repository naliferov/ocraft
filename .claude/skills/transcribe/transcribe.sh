#!/usr/bin/env bash
# Download a YouTube video's audio and transcribe it to a text file with whisper.cpp.
#
# Usage: transcribe.sh <youtube-url> [output.txt] [language]
#   output.txt  optional — defaults to "<video title>.txt" in the current directory
#   language    optional — defaults to "auto" (whisper detects); pass ru/uk/en to force
#
# Progress goes to stderr; the final transcript path is printed to stdout.
set -euo pipefail

URL="${1:?usage: transcribe.sh <youtube-url> [output.txt] [language]}"
OUT="${2:-}"
LANG="${3:-auto}"

MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin"
WHISPER="/opt/homebrew/bin/whisper-cli"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ reading video title…" >&2
TITLE="$(yt-dlp --no-playlist --print title "$URL")"

echo "→ downloading audio: $TITLE" >&2
yt-dlp -f bestaudio --no-playlist -o "$WORK/audio.%(ext)s" "$URL" >&2
SRC="$(ls "$WORK"/audio.* | head -1)"

echo "→ converting to 16 kHz mono WAV…" >&2
ffmpeg -y -i "$SRC" -ar 16000 -ac 1 -c:a pcm_s16le "$WORK/audio16.wav" >/dev/null 2>&1

# Default output name from the title (keep unicode, drop only filesystem-unsafe chars).
if [ -z "$OUT" ]; then
  SAFE="$(printf '%s' "$TITLE" | tr '/\\:*?"<>|' '_________' | cut -c1-80)"
  OUT="${SAFE:-transcript}.txt"
fi

echo "→ transcribing (lang=$LANG)… this scales with audio length" >&2
"$WHISPER" -m "$MODEL" -f "$WORK/audio16.wav" -l "$LANG" -nt -np > "$OUT"

echo "✓ saved: $OUT ($(wc -w < "$OUT" | tr -d ' ') words)" >&2
echo "$OUT"
