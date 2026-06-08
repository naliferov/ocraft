# gcal-mcp

A thin MCP server exposing **read-only** access to your Google Calendar via the
official Google Calendar API. Mirrors `telegram-mcp/` in structure: it authenticates
with a **service account** and is launched by your MCP client (registered in the repo
root `.mcp.json` as `gcal`).

## Tools

| Tool | What it does |
|------|--------------|
| `gcal_list_calendars` | List calendars (note: a service account's list is usually empty — address calendars by id) |
| `gcal_list_events` | Events in a window (defaults to the next 7 days), recurring events expanded |
| `gcal_search_events` | Full-text search across events (`q`), optionally time-bounded |
| `gcal_get_event` | One event by id |
| `gcal_freebusy` | Busy blocks for one or more calendars in a window |

## One-time setup

### 1. Google Cloud project + Calendar API
1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Skip the optional project-role step — no IAM role is needed for Calendar.
4. Open the service account → **Keys → Add key → JSON** → download the key file.

### 2. Share your calendar with the service account
Calendar access is granted by *sharing*, not by IAM. In Google Calendar:
**Settings → Settings for my calendars → \<your calendar\> → Share with specific
people →** add the service account's email
(`...@<project>.iam.gserviceaccount.com`) with at least **"See all event details"**.

### 3. Configure
```bash
cd mcp-servers/gcal-mcp
cp .env.example .env       # set GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CALENDAR_ID
npm install
```

`.env`:
- `GOOGLE_APPLICATION_CREDENTIALS` — absolute path to the downloaded JSON key.
- `GOOGLE_CALENDAR_ID` — the calendar to read (e.g. `you@gmail.com`). A service
  account has no useful `primary`, so set this explicitly.

That's it — `.mcp.json` already registers the server, so your MCP client will spawn
`node mcp-servers/gcal-mcp/server.js` on demand.

## Notes
- **Scope is read-only** (`calendar.readonly`). For write access, change the scope in
  `server.js` to `https://www.googleapis.com/auth/calendar`, grant the service account
  **"Make changes to events"** on the calendar, and add write tools to `server.js`.
- The JSON key and `.env` are git-ignored. Treat the key like a password.
- stdout is reserved for the MCP protocol; all logs go to stderr.
