#!/usr/bin/env bash
# Transcribe audio/video to a text file with whisper.cpp.
#
# The source can be either:
#   - a remote URL (YouTube etc.) — downloaded with yt-dlp, then transcribed
#   - a local file (audio or video) — e.g. a Telegram voice note already
#     downloaded to disk, or any .ogg/.mp3/.m4a/.mp4/… on this machine
#
# Usage:
#   transcribe.sh --tracks <url-or-file>                         # list audio tracks, then exit
#   transcribe.sh <url-or-file> [output.txt] [language] [track]
#
#   output.txt  optional — defaults to "<title-or-filename>.txt" in the current dir
#   language    optional — defaults to "auto" (whisper detects); pass ru/uk/en to force
#   track       optional — absolute audio STREAM INDEX to transcribe (see --tracks).
#               Omit when there is exactly one audio track. If the source has MORE
#               THAN ONE audio track and no track is given, the script REFUSES to
#               guess: it lists the tracks and exits (movies bundle several dubs /
#               languages — the caller must choose which one).
#
# Progress goes to stderr; the final transcript path is printed to stdout.
set -euo pipefail

WHISPER="/opt/homebrew/bin/whisper-cli"
MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin"

# List the audio tracks of a media file: absolute index + language + title + codec + channels.
list_tracks() {
  ffprobe -v error -select_streams a \
    -show_entries stream=index,codec_name,channels:stream_tags=language,title \
    -of json "$1" 2>/dev/null \
  | jq -r '.streams[] | "  track \(.index): lang=\(.tags.language // "?")  ch=\(.channels)  codec=\(.codec_name)  title=\(.tags.title // "-")"'
}

# --- audio-track listing mode -------------------------------------------------
if [ "${1:-}" = "--tracks" ] || [ "${1:-}" = "--list-tracks" ]; then
  SRC="${2:?usage: transcribe.sh --tracks <url-or-file>}"
  echo "audio tracks in: $SRC" >&2
  list_tracks "$SRC"
  exit 0
fi

SOURCE="${1:?usage: transcribe.sh <url-or-file> [output.txt] [language] [track]}"
OUT="${2:-}"
LANG="${3:-auto}"
TRACK="${4:-}"

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

# OBLIGATORY: never silently pick an audio track. If the source has >1 audio
# stream and the caller didn't choose one, refuse and show the options.
NAUD="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$MEDIA" 2>/dev/null | grep -c . || true)"
if [ -z "$TRACK" ] && [ "${NAUD:-0}" -gt 1 ]; then
  echo "✗ $NAUD audio tracks found — pick one and pass its index as the 4th arg:" >&2
  list_tracks "$MEDIA" >&2
  echo "  e.g.  transcribe.sh \"$SOURCE\" out.txt ru <index>" >&2
  exit 2
fi

# whisper-cli needs 16 kHz mono WAV; Telegram voice notes are Opus .ogg, etc.
# When a track is chosen, map exactly that stream; otherwise take the default one.
echo "→ converting to 16 kHz mono WAV${TRACK:+ (audio track $TRACK)}…" >&2
if [ -n "$TRACK" ]; then
  ffmpeg -y -i "$MEDIA" -map "0:$TRACK" -ar 16000 -ac 1 -c:a pcm_s16le "$WORK/audio16.wav" >/dev/null 2>&1
else
  ffmpeg -y -i "$MEDIA" -ar 16000 -ac 1 -c:a pcm_s16le "$WORK/audio16.wav" >/dev/null 2>&1
fi

# Default output name from the title/filename (keep unicode, drop only unsafe chars).
if [ -z "$OUT" ]; then
  SAFE="$(printf '%s' "$NAME" | tr '/\\:*?"<>|' '_________' | cut -c1-80)"
  OUT="${SAFE:-transcript}.txt"
fi

# -mc 0 = no context carry-over: prevents whisper's runaway repeat-loops and
# language-flips on long or music-heavy audio (temperature fallback stays on).
echo "→ transcribing (lang=$LANG)… this scales with audio length" >&2
"$WHISPER" -m "$MODEL" -f "$WORK/audio16.wav" -l "$LANG" -mc 0 -nt -np > "$OUT"

echo "✓ saved: $OUT ($(wc -w < "$OUT" | tr -d ' ') words)" >&2
echo "$OUT"
