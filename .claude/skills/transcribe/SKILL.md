---
name: transcribe
description: Transcribe audio or video to a plain-text file with whisper.cpp. Works for a YouTube/remote URL (downloaded via yt-dlp) OR a local file already on disk — e.g. a Telegram voice note, podcast, lecture, or any .ogg/.mp3/.m4a/.mp4/.wav. Use for "transcribe this video/audio/voice note", "get the transcript of <url>", or turning a talk into text.
---

# Transcribe → text

Turn audio or video into a plain-text transcript. The source can be a **remote URL** (YouTube etc.) or a **local file** already on this machine.

## Tooling (already installed — don't reinstall, don't hunt for `whisper`/`main`/`~/.cache/whisper`)

- `whisper-cli` (whisper.cpp) — `/opt/homebrew/bin/whisper-cli`, model
  `~/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin` (multilingual; handles
  Russian/Ukrainian/English well)
- `ffmpeg` — converts the source to the 16 kHz mono WAV whisper needs
- `yt-dlp` — `/opt/homebrew/bin/yt-dlp` (only used for URL sources)

## Run

One command does the whole pipeline (resolve source → [download] → convert → transcribe → write `.txt`, with temp cleanup):

```bash
bash .claude/skills/transcribe/transcribe.sh "<url-or-file>" [output.txt] [language]
```

- **source** (required) — a remote URL (`https://…`) is downloaded via yt-dlp; anything else is treated as a path to a local audio/video file.
- **output.txt** (optional) — defaults to `<video title>.txt` (URL) or `<filename>.txt` (local file) in the current directory. Pass an explicit path to route it somewhere specific.
- **language** (optional) — defaults to `auto` (whisper detects). Force with `ru` / `uk` / `en` if auto-detect picks wrong.

The script prints progress to stderr and the final transcript path to stdout (capture it to know where the file landed).

## Telegram voice notes

Telegram voice notes are Opus `.ogg`. Download the media first (e.g. via `telegram-mcp`'s `tg_download_media`), then pass the resulting local path straight to the script — the `ffmpeg` step handles the `.ogg` → WAV conversion automatically:

```bash
bash .claude/skills/transcribe/transcribe.sh /path/to/voice.ogg note.txt ru
```

## After running

- Confirm the saved path and show the user a short preview (first few lines) + the word count.
- **Long audio takes a while** — transcription time scales with length. If the source is long (a multi-hour stream/recording), say so up front before kicking it off.
- whisper can emit a short repeated phrase on trailing silence — harmless; trim if needed.
- If the user wants the transcript stored somewhere specific rather than a loose `.txt` (e.g. an **ocraft node** under `notes`, or a **ThinkTank** note), ask and route it there.

## Notes / failure modes

- **URLs:** age-restricted / private / region-locked videos may need cookies — if `yt-dlp` fails with an auth/availability error, surface it; don't retry blindly. Playlists: the script uses `--no-playlist`, so a playlist URL transcribes only the single video it points at.
- **Local files:** if the path doesn't exist the script exits with `✗ no such file`; double-check the path (and quote it if it contains spaces).
