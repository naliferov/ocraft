---
name: daily-report
description: Generate a daily briefing — recent/unread Gmail, this week's Google Calendar events, the ThinkTank todo list, and a Telegram tech/JS channel digest — in one consolidated report. Run any time of day. Use when the user asks for a "daily report", "morning/evening report", "daily briefing", "what's on today/this week", or "catch me up".
---

# Daily report

Pull four sources and present them as one short briefing — run it any time of day
(morning, midday, or evening). Gather all four first (the tool calls are
independent — run them together), then compose the report.

## 1. Gmail — recent / unread

Use the **gmail** MCP tools (`mcp__gmail__gmail_search`, `mcp__gmail__gmail_get_message`).
- Query for what's worth seeing now: unread inbox mail and anything from the
  last day — e.g. `in:inbox is:unread` and/or `newer_than:1d in:inbox`.
- Cap at ~10–15 messages. For each, show **sender · subject · time** and a one-line
  snippet (fetch via `gmail_get_message` only if the search result lacks a snippet).
- Skip obvious bulk/promotional noise unless it stands out. If nothing unread, say
  "inbox clear".

## 2. Google Calendar — this week

Use the **gcal** MCP tools (`mcp__gcal__gcal_list_events`; `mcp__gcal__gcal_list_calendars`
first if you need the calendar id).
- Range: **today through the end of this week (Sunday)** — `timeMin` = start of today,
  `timeMax` = end of Sunday in the user's timezone.
- List events grouped by day, each as **day · time · title** (mark all-day events).
  Run later in the day and the already-passed events still show — flag what's **still
  ahead today** so the remainder of the day is clear at a glance.
- If multiple calendars, include the user's primary (and any others that clearly hold
  real events). If the week is empty, say so.

## 3. ThinkTank todos

Read **`/Users/varcraft/projects/ThinkTank/todo.md`** and list the open items
(unchecked `- [ ]` lines). Render each as a plain bullet; resolve any `[[wiki-links]]`
to just their readable text. Skip completed (`- [x]`) items. (Optionally also glance at
`/Users/varcraft/projects/ThinkTank/job todo.md` and label those "job".)

## 4. Telegram — tech / JS channels

Use the **telegram** MCP tools (`mcp__telegram__tg_read_messages`,
`mcp__telegram__tg_get_chat_history`). Digest these chats (handles are stable —
edit this list to change the set):
- `@AsForJsTalks` (As For JS — discussion chat, the group not the broadcast channel)
- `@nodeua` (NodeUA)
- `@metarhia` (Node.js Ukraine Community)
- `@jsninja_news` (JavaScript.Ninja News)
- `@asyncify` (Asynchronous Programming)

Read the last ~24h from each, then write **ONE consolidated summary** across all of
them — not per-channel. **Tech only — skip personal content entirely** (life updates,
pets, photos, off-topic chatter, donation/fundraiser posts); none of that belongs in
the digest. Surface only the few things actually worth knowing technically (releases,
library/runtime news, notable engineering discussions/threads, useful links, security
advisories), as 3–5 bullets total (or a short paragraph). Drop noise and cross-posts;
if the chats had nothing technical, just say "quiet".

## Compose the report

Present a single, skimmable briefing — concise, no preamble. Pick the header emoji to
match the current time of day (☀️ morning, 🌤️ midday/afternoon, 🌙 evening):

```
<emoji> Daily report — <weekday, date> · <HH:MM>

📬 Mail (<n> unread)
  • <sender> — <subject>   <time>
  …

📅 This week
  Mon 16  09:00  <event>
  …

✅ Todos
  • Сдать медицинские анализы
  …

💬 Telegram (tech/JS)
  As For JS — <gist>   <link>
  metarhia — <gist>
  …
```

Keep it tight — a quick glance, not a dump. If a source fails (auth/empty), note it
in one line and continue with the rest; don't abort the whole report.
