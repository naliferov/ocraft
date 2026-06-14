---
name: youtube-transcribe
description: Download a YouTube video's audio and transcribe it to a plain-text file (yt-dlp + whisper.cpp). Use when given a YouTube link to transcribe — "transcribe this video", "get the transcript of <url>", or turning a talk/lecture/podcast into text.
---

# YouTube → transcript

Given a YouTube URL, download its audio and produce a plain-text transcript.

## Tooling (already installed on this machine — don't reinstall)

- `yt-dlp` — `/opt/homebrew/bin/yt-dlp` (audio download)
- `ffmpeg` — converts to the 16 kHz mono WAV whisper needs
- `whisper-cli` (whisper.cpp) — `/opt/homebrew/bin/whisper-cli`, model
  `~/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin` (multilingual; handles
  Russian/Ukrainian/English well)

## Run

One command does the whole pipeline (title → download → convert → transcribe → write `.txt`, with temp cleanup):

```bash
bash .claude/skills/youtube-transcribe/transcribe.sh "<youtube-url>" [output.txt] [language]
```

- **output.txt** (optional) — defaults to `<video title>.txt` in the current directory. Pass an explicit path to route it somewhere specific.
- **language** (optional) — defaults to `auto` (whisper detects). Force with `ru` / `uk` / `en` if auto-detect picks wrong.

The script prints progress to stderr and the final transcript path to stdout (capture it to know where the file landed).

## After running

- Confirm the saved path and show the user a short preview (first few lines) + the word count.
- **Long videos take a while** — transcription time scales with audio length. If the video is long (e.g. a multi-hour stream), say so up front before kicking it off.
- whisper can emit a short repeated phrase on trailing silence — harmless; trim if needed.
- If the user wants the transcript stored somewhere specific rather than a loose `.txt` (e.g. an **ocraft node** under `notes`, or a **ThinkTank** note), ask and route it there.

## Notes / failure modes

- Age-restricted / private / region-locked videos may need cookies — if `yt-dlp` fails with an auth/availability error, surface it; don't retry blindly.
- Playlists: the script uses `--no-playlist`, so a playlist URL transcribes only the single video it points at.
