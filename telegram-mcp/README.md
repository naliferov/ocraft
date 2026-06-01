# telegram-mcp

A thin, self-owned [MCP](https://modelcontextprotocol.io) server that exposes **read, search + send** over a
Telegram **user account** (not a bot) via [GramJS](https://github.com/gram-js/gramjs) (MTProto).

Because it logs in as your account, it can read **channels, groups, and private/cloud chats** and run
**native Telegram full-text search** — things the Bot API cannot do.

## Tools

| Tool | What it does |
|------|--------------|
| `tg_list_chats` | List your dialogs (id, title, type, unread). |
| `tg_read_messages` | Most recent messages from one chat. |
| `tg_get_chat_history` | Paginate older messages (via `offsetId`). |
| `tg_search` | Native MTProto search — inside one chat, or global across all chats. |
| `tg_send_message` | Send a text message to a chat (optionally as a reply). |
| `tg_send_file` | Send a local image/file to a chat, with an optional caption. |

Address a chat by `@username`, numeric id, or exact title.

## Setup

1. **Install deps**
   ```bash
   cd telegram-mcp
   npm install
   ```

2. **Get API credentials** from <https://my.telegram.org> → *API development tools*.
   Copy `.env.example` to `.env` and fill in `TG_API_ID` and `TG_API_HASH`.
   ```bash
   cp .env.example .env
   ```

3. **Log in once** (interactive — needs your phone number, the login code Telegram sends you, and your
   2FA password if you have one). This writes `TG_SESSION` into `.env`.
   ```bash
   npm run login
   ```

4. **Registration** — already wired into the repo's `.mcp.json` as `telegram`.
   After logging in (step 3), restart Claude Code (or run `/mcp`) to confirm it connects.

## Notes

- `.env` (credentials + session) is git-ignored. The session string grants full access to your account —
  treat it like a password.
- This is independent of the backend's `TELEGRAM_BOT_TOKEN`, which is a bot and can't read your chats.
