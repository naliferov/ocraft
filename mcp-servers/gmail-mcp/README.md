# gmail-mcp

A thin MCP server exposing mostly **read-only** access to a Gmail account over
**IMAP**, plus a single **delete** (move-to-Trash) tool.
Mirrors `gcal-mcp/` in structure, but auth is different: Gmail can't be read by a
service account (unlike Calendar, there's no "share my mailbox" grant, and
domain-wide delegation needs Google Workspace). For a personal `@gmail.com`
account the simplest durable path is an **app password** over IMAP — no Cloud
project, no OAuth consent screen, no 7-day token expiry. Registered in the repo
root `.mcp.json` as `gmail`.

Every read/list/search/download tool opens its mailbox with `{ readOnly: true }`,
so it never changes read state, flags, or anything else. The lone exception is
`gmail_delete_message`, which opens the mailbox writable to move a message to
Trash (reversible — Gmail purges Trash after ~30 days).

## Tools

| Tool | What it does |
|------|--------------|
| `gmail_list_mailboxes` | List mailboxes/labels with their special-use flags (`\Inbox`, `\Sent`, `\All`, …) |
| `gmail_list_messages` | Most recent messages in a mailbox (default INBOX), newest first |
| `gmail_search` | Search with native Gmail syntax (`from:`, `has:attachment`, `newer_than:7d`, …); searches All Mail by default |
| `gmail_get_message` | One message by uid: headers, plain-text body, attachment list |
| `gmail_download_attachment` | Save one attachment (uid + part id) to a local file |
| `gmail_delete_message` | Move a message (by uid) to Trash — reversible for ~30 days |

> **UIDs are per-mailbox.** `gmail_search` returns the `mailbox` it searched —
> pass that same `mailbox` to `gmail_get_message` / `gmail_download_attachment`.

## One-time setup

### 1. App password
1. Turn on **2-Step Verification**: <https://myaccount.google.com/security>
   (app passwords are only available once 2SV is on).
2. Create one at <https://myaccount.google.com/apppasswords> — pick **Mail** /
   **Other**. Google shows a 16-character password.

IMAP is enabled by default on all Gmail accounts, so there's nothing to toggle.

### 2. Configure
```bash
cd mcp-servers/gmail-mcp
cp .env.example .env       # set GMAIL_USER + GMAIL_APP_PASSWORD
npm install
```

`.env`:
- `GMAIL_USER` — your full address, e.g. `you@gmail.com`.
- `GMAIL_APP_PASSWORD` — the 16-char app password (spaces are fine).

That's it — `.mcp.json` already registers the server, so your MCP client will
spawn `node mcp-servers/gmail-mcp/server.js` on demand.

## Notes
- **Read-mostly by design.** The only write is `gmail_delete_message` (move to
  Trash). To add send/draft, you'd switch from IMAP to the Gmail API (OAuth) or
  add SMTP — out of scope here.
- The app password and `.env` are git-ignored. Treat the app password like a
  password to your inbox — it grants full mail read access.
- `downloads/` holds attachments saved by `gmail_download_attachment` (git-ignored).
- stdout is reserved for the MCP protocol; all logs go to stderr.
- Search uses Gmail's `X-GM-RAW` extension, so the full
  [Gmail search operators](https://support.google.com/mail/answer/7190) work.
