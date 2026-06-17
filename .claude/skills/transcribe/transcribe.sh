#!/usr/bin/env bash
# Transcribe audio/video to a text file with whisper.cpp.
#
# The source can be either:
#   - a remote URL (YouTube etc.) — downloaded with yt-dlp, then transcribed
#   - a local file (audio or video) — e.g. a Telegram voice note already
#     downloaded to disk, or any .ogg/.mp3/.m4a/.wav/.mp4/… on this machine
#
# Usage: transcribe.sh <url-or-file> [output.txt] [language]
#   output.txt  optional — defaults to "<title-or-filename>.txt" in the current dir
#   language    optional — defaults to "auto" (whisper detects); pass ru/uk/en to force
#
# Progress goes to stderr; the final transcript path is printed to stdout.
set -euo pipefail

SOURCE="${1:?usage: transcribe.sh <url-or-file> [output.txt] [language]}"
OUT="${2:-}"
LANG="${3:-auto}"

MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin"
WHISPER="/opt/homebrew/bin/whisper-cli"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Resolve the media source: remote URL → download with yt-dlp; otherwise local file.
if printf '%s' "$SOURCE" | grep -qiE '^https?://'; then
  echo "→ reading title…" >&2
  TITLE="$(yt-dlp --no-playlist --print title "$SOURCE")"
  echo "→ downloading audio: $TITLE" >&2
  yt-dlp -f bestaudio --no-playlist -o "$WORK/audio.%(ext)s" "$SOURCE" >&2
  MEDIA="$(ls "$WORK"/audio.* | head -1)"
  NAME="$TITLE"
else
  [ -f "$SOURCE" ] || { echo "✗ no such file: $SOURCE" >&2; exit 1; }
  MEDIA="$SOURCE"
  NAME="$(basename "${SOURCE%.*}")"
fi

# whisper-cli needs 16 kHz mono WAV; Telegram voice notes are Opus .ogg, etc.
echo "→ converting to 16 kHz mono WAV…" >&2
ffmpeg -y -i "$MEDIA" -ar 16000 -ac 1 -c:a pcm_s16le "$WORK/audio16.wav" >/dev/null 2>&1

# Default output name from the title/filename (keep unicode, drop only unsafe chars).
if [ -z "$OUT" ]; then
  SAFE="$(printf '%s' "$NAME" | tr '/\\:*?"<>|' '_________' | cut -c1-80)"
  OUT="${SAFE:-transcript}.txt"
fi

echo "→ transcribing (lang=$LANG)… this scales with audio length" >&2
"$WHISPER" -m "$MODEL" -f "$WORK/audio16.wav" -l "$LANG" -nt -np > "$OUT"

echo "✓ saved: $OUT ($(wc -w < "$OUT" | tr -d ' ') words)" >&2
echo "$OUT"
