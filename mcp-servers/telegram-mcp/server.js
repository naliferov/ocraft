#!/usr/bin/env node
// Thin MCP server over a Telegram USER account (MTProto, via GramJS).
// List chats, read history, search messages (per-chat or global), and send messages/files.
// Requires TG_API_ID, TG_API_HASH, TG_SESSION in .env (run `npm run login` first).
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import { z } from 'zod'
import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH
const sessionStr = process.env.TG_SESSION

if (!apiId || !apiHash || !sessionStr) {
  // stderr only — stdout is the MCP stdio channel and must stay clean.
  console.error(
    'telegram-mcp: missing TG_API_ID / TG_API_HASH / TG_SESSION.\n' +
      'Run `npm run login` in telegram-mcp/ to authenticate first.',
  )
  process.exit(1)
}

const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 5,
})

// JSON.stringify replacer: GramJS returns BigInt / Integer-like ids.
const safe = (obj) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)

const ok = (data) => ({ content: [{ type: 'text', text: safe(data) }] })
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: String(msg) }] })

const dialogKind = (d) =>
  d.isChannel ? (d.entity?.broadcast ? 'channel' : 'supergroup') : d.isGroup ? 'group' : 'user'

// Resolve a chat reference (@username, numeric id, or exact dialog title) to an entity.
async function resolveEntity(ref) {
  const s = String(ref).trim()
  // Try username / direct id first.
  if (/^@?[a-zA-Z]/.test(s)) {
    try {
      return await client.getEntity(s.startsWith('@') ? s : '@' + s)
    } catch {
      /* fall through */
    }
    try {
      return await client.getEntity(s)
    } catch {
      /* fall through */
    }
  }
  if (/^-?\d+$/.test(s)) {
    try {
      return await client.getEntity(Number(s))
    } catch {
      /* fall through */
    }
  }
  // Fall back to matching a cached dialog by id, username, or exact title.
  const dialogs = await client.getDialogs({ limit: 200 })
  const match = dialogs.find(
    (d) =>
      String(d.id) === s ||
      d.entity?.username?.toLowerCase() === s.replace(/^@/, '').toLowerCase() ||
      d.title === s,
  )
  if (match) return match.entity
  throw new Error(
    `Could not resolve chat "${ref}". Use @username, numeric id, or exact title (see tg_list_chats).`,
  )
}

const formatMessage = (m) => ({
  id: m.id,
  date: m.date ? new Date(m.date * 1000).toISOString() : null,
  fromId: m.senderId ? String(m.senderId) : null,
  sender: m.sender
    ? m.sender.username
      ? '@' + m.sender.username
      : (m.sender.title ?? m.sender.firstName ?? null)
    : null,
  text: m.message ?? m.text ?? '',
  media: m.media ? m.media.className : null,
  replyToMsgId: m.replyTo?.replyToMsgId ?? null,
})

const server = new McpServer({ name: 'telegram', version: '1.0.0' })

server.registerTool(
  'tg_list_chats',
  {
    title: 'List Telegram chats',
    description:
      'List your recent chats/dialogs (users, groups, channels) with their id, title, type, and unread count. Use the returned id or @username to address other tools.',
    inputSchema: {
      limit: z.number().int().min(1).max(500).default(50).describe('Max chats to return'),
    },
  },
  async ({ limit }) => {
    try {
      const dialogs = await client.getDialogs({ limit })
      return ok(
        dialogs.map((d) => ({
          id: String(d.id),
          title: d.title,
          username: d.entity?.username ? '@' + d.entity.username : null,
          type: dialogKind(d),
          unread: d.unreadCount ?? 0,
        })),
      )
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_read_messages',
  {
    title: 'Read recent messages from a chat',
    description:
      'Fetch the most recent messages from one chat (channel, group, or private chat). Returns sender, text, date, and message id.',
    inputSchema: {
      chat: z.string().describe('@username, numeric id, or exact title of the chat'),
      limit: z.number().int().min(1).max(200).default(30).describe('How many recent messages'),
    },
  },
  async ({ chat, limit }) => {
    try {
      const entity = await resolveEntity(chat)
      const msgs = await client.getMessages(entity, { limit })
      return ok(msgs.map(formatMessage))
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_get_chat_history',
  {
    title: 'Page through a chat history',
    description:
      'Fetch older messages from a chat by paginating. Pass offsetId (the id of the oldest message you already have) to get the page before it.',
    inputSchema: {
      chat: z.string().describe('@username, numeric id, or exact title of the chat'),
      limit: z.number().int().min(1).max(200).default(50).describe('Messages per page'),
      offsetId: z
        .number()
        .int()
        .optional()
        .describe('Return messages older than this message id (omit for newest)'),
    },
  },
  async ({ chat, limit, offsetId }) => {
    try {
      const entity = await resolveEntity(chat)
      const msgs = await client.getMessages(entity, { limit, offsetId: offsetId ?? 0 })
      return ok({
        messages: msgs.map(formatMessage),
        oldestId: msgs.length ? msgs[msgs.length - 1].id : null,
      })
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_search',
  {
    title: 'Search Telegram messages',
    description:
      'Native MTProto full-text search. With "chat", searches inside that one chat; without it, searches globally across all your chats.',
    inputSchema: {
      query: z.string().min(1).describe('Text to search for'),
      chat: z
        .string()
        .optional()
        .describe('Optional: restrict to this @username/id/title. Omit for global search.'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max results'),
    },
  },
  async ({ query, chat, limit }) => {
    try {
      if (chat) {
        const entity = await resolveEntity(chat)
        const msgs = await client.getMessages(entity, { search: query, limit })
        return ok(msgs.map(formatMessage))
      }
      // Global search across all chats.
      const res = await client.invoke(
        new Api.messages.SearchGlobal({
          q: query,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit,
        }),
      )
      return ok((res.messages ?? []).map(formatMessage))
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_download_media',
  {
    title: 'Download media from messages to local files',
    description:
      'Download photo/document media from one or more messages in a chat to local image files, and return the saved file paths (so the images can be opened/viewed). Pass the message ids whose "media" was non-null in tg_read_messages / tg_search.',
    inputSchema: {
      chat: z.string().describe('@username, numeric id, or exact title of the chat'),
      ids: z.array(z.number().int()).min(1).max(20).describe('Message ids to download media from'),
      outDir: z
        .string()
        .optional()
        .describe('Optional output directory (defaults to telegram-mcp/downloads)'),
    },
  },
  async ({ chat, ids, outDir }) => {
    try {
      const entity = await resolveEntity(chat)
      const msgs = await client.getMessages(entity, { ids })
      const dir = outDir || path.join(import.meta.dirname, 'downloads')
      fs.mkdirSync(dir, { recursive: true })
      const results = []
      for (const m of msgs) {
        if (!m || !m.media) {
          results.push({ id: m?.id ?? null, saved: false, reason: 'no media on this message' })
          continue
        }
        const buf = await client.downloadMedia(m, {})
        if (!buf || !buf.length) {
          results.push({ id: m.id, saved: false, reason: 'empty download' })
          continue
        }
        const ext = m.photo ? 'jpg' : m.document?.mimeType?.split('/')[1] || 'bin'
        const file = path.join(dir, `media-${m.id}.${ext}`)
        fs.writeFileSync(file, buf)
        results.push({
          id: m.id,
          saved: true,
          path: file,
          bytes: buf.length,
          type: m.media.className,
        })
      }
      return ok(results)
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_send_message',
  {
    title: 'Send a message to a chat',
    description:
      'Send a text message to one chat (private chat, group, or channel you can post to). Optionally reply to an existing message. Returns the sent message id, date, and text.',
    inputSchema: {
      chat: z.string().describe('@username, numeric id, or exact title of the chat to send to'),
      text: z.string().min(1).describe('Message text to send'),
      replyToMsgId: z.number().int().optional().describe('Optional: id of a message to reply to'),
    },
  },
  async ({ chat, text, replyToMsgId }) => {
    try {
      const entity = await resolveEntity(chat)
      const sent = await client.sendMessage(entity, { message: text, replyTo: replyToMsgId })
      return ok(formatMessage(sent))
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

server.registerTool(
  'tg_send_file',
  {
    title: 'Send a picture or file to a chat',
    description:
      'Send a local image (or any file) to one chat, with an optional caption. Use a local filesystem path. Returns the sent message id, date, and caption.',
    inputSchema: {
      chat: z.string().describe('@username, numeric id, or exact title of the chat to send to'),
      path: z.string().min(1).describe('Absolute local filesystem path to the image/file to send'),
      caption: z.string().optional().describe('Optional caption text shown under the file'),
      replyToMsgId: z.number().int().optional().describe('Optional: id of a message to reply to'),
    },
  },
  async ({ chat, path: filePath, caption, replyToMsgId }) => {
    try {
      if (!fs.existsSync(filePath)) return fail(`File not found: ${filePath}`)
      const entity = await resolveEntity(chat)
      const sent = await client.sendFile(entity, { file: filePath, caption, replyTo: replyToMsgId })
      return ok(formatMessage(sent))
    } catch (e) {
      return fail(e?.message ?? e)
    }
  },
)

async function main() {
  await client.connect()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('telegram-mcp: connected and ready.')
}

main().catch((e) => {
  console.error('telegram-mcp fatal:', e?.message ?? e)
  process.exit(1)
})
