#!/usr/bin/env node
// Thin MCP server over Gmail via IMAP.
// List mailboxes, list/search/read messages, download attachments, and delete
// (move to Trash).
// Auth: an app password (not your account password). Set GMAIL_USER and
// GMAIL_APP_PASSWORD in .env. Requires 2-Step Verification on the account, then
// generate an app password at https://myaccount.google.com/apppasswords.
// Mostly read-only: the read/list/search/download tools open every mailbox with
// { readOnly: true } and never touch flags or read state. The one exception is
// gmail_delete_message, which opens the mailbox writable to move a message to
// Trash (reversible — Gmail purges Trash after ~30 days).
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const USER = process.env.GMAIL_USER
// App passwords are shown in 4-char groups for readability; the spaces are
// cosmetic — strip all whitespace so it works pasted either way.
const PASS = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')

if (!USER || !PASS) {
  // stderr only — stdout is the MCP stdio channel and must stay clean.
  console.error(
    'gmail-mcp: missing GMAIL_USER and/or GMAIL_APP_PASSWORD.\n' +
    'Enable 2-Step Verification, create an app password at\n' +
    'https://myaccount.google.com/apppasswords, and set both in gmail-mcp/.env.'
  )
  process.exit(1)
}

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: String(msg) }] })

// A fresh connection per tool call — the server is invoked intermittently, so we
// connect, do the work, and log out rather than holding an idle socket open.
function makeClient() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: USER, pass: PASS },
    logger: false, // keep stdout/stderr clean for the MCP channel
  })
}

async function withClient(fn) {
  const client = makeClient()
  await client.connect()
  try {
    return await fn(client)
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

// Open a mailbox read-only for the duration of fn, then release the lock.
async function withMailbox(client, mailbox, fn) {
  const lock = await client.getMailboxLock(mailbox, { readOnly: true })
  try {
    return await fn()
  } finally {
    lock.release()
  }
}

// Open a mailbox writable (no readOnly flag) for the duration of fn. Only used
// by gmail_delete_message; everything else stays read-only.
async function withMailboxRW(client, mailbox, fn) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    return await fn()
  } finally {
    lock.release()
  }
}

// Gmail's "All Mail" folder is localized; resolve it via the \All special-use
// flag rather than hard-coding the English "[Gmail]/All Mail".
async function resolveAllMail(client) {
  const boxes = await client.list()
  const all = boxes.find((b) => b.specialUse === '\\All')
  return all?.path || '[Gmail]/All Mail'
}

// Trash is localized too; resolve it via the \Trash special-use flag.
async function resolveTrash(client) {
  const boxes = await client.list()
  const trash = boxes.find((b) => b.specialUse === '\\Trash')
  return trash?.path || '[Gmail]/Trash'
}

// Format an envelope address list ([{ name, address }]) as "Name <email>" strings.
const fmtAddrs = (list) =>
  (list ?? []).map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).filter(Boolean)

// Walk a bodyStructure tree and collect attachment-like parts (those with a
// filename or an "attachment" disposition), keyed by their IMAP part id.
function collectAttachments(node, out = []) {
  if (!node) return out
  if (Array.isArray(node.childNodes)) node.childNodes.forEach((c) => collectAttachments(c, out))
  const filename = node.dispositionParameters?.filename || node.parameters?.name || null
  const isAttachment = node.disposition === 'attachment' || (!!filename && node.part)
  if (isAttachment && node.part) {
    out.push({
      part: node.part,
      filename,
      contentType: node.type && node.subtype ? `${node.type}/${node.subtype}`.toLowerCase() : null,
      size: node.size ?? null,
      encoding: node.encoding ?? null,
    })
  }
  return out
}

const fmtSummary = (msg) => ({
  uid: msg.uid,
  subject: msg.envelope?.subject ?? null,
  from: fmtAddrs(msg.envelope?.from),
  to: fmtAddrs(msg.envelope?.to),
  date: msg.envelope?.date ?? null,
  seen: msg.flags ? msg.flags.has('\\Seen') : null,
  flagged: msg.flags ? msg.flags.has('\\Flagged') : null,
  size: msg.size ?? null,
  hasAttachments: msg.bodyStructure ? collectAttachments(msg.bodyStructure).length > 0 : null,
})

const server = new McpServer({ name: 'gmail', version: '1.0.0' })

server.registerTool(
  'gmail_list_mailboxes',
  {
    title: 'List Gmail mailboxes',
    description: 'List mailboxes/labels (path, name, special-use flag like \\Inbox, \\Sent, \\All, \\Trash). Use a path with the message tools.',
    inputSchema: {},
  },
  async () => {
    try {
      return await withClient(async (client) => {
        const boxes = await client.list()
        return ok(boxes.map((b) => ({
          path: b.path,
          name: b.name,
          specialUse: b.specialUse ?? null,
          subscribed: b.subscribed ?? null,
        })))
      })
    } catch (e) { return fail(e?.message ?? e) }
  }
)

server.registerTool(
  'gmail_list_messages',
  {
    title: 'List recent messages',
    description: 'List the most recent messages in a mailbox (default INBOX), newest first. Returns compact summaries (uid, subject, from/to, date, read state, size, hasAttachments). Use the uid with gmail_get_message.',
    inputSchema: {
      mailbox: z.string().default('INBOX').describe('Mailbox path (default: INBOX). See gmail_list_mailboxes.'),
      limit: z.number().int().min(1).max(200).default(25).describe('How many recent messages to return'),
    },
  },
  async ({ mailbox, limit }) => {
    try {
      return await withClient(async (client) =>
        withMailbox(client, mailbox, async () => {
          const total = client.mailbox.exists || 0
          if (total === 0) return ok([])
          const start = Math.max(1, total - limit + 1)
          const out = []
          for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, size: true, bodyStructure: true })) {
            out.push(fmtSummary(msg))
          }
          out.sort((a, b) => (b.uid ?? 0) - (a.uid ?? 0)) // newest first
          return ok(out)
        })
      )
    } catch (e) { return fail(e?.message ?? e) }
  }
)

server.registerTool(
  'gmail_search',
  {
    title: 'Search messages',
    description: 'Search messages using native Gmail search syntax (e.g. "from:foo@bar.com has:attachment newer_than:7d", "subject:invoice"). Searches All Mail by default. Returns compact summaries, newest first; the returned "mailbox" must be passed to gmail_get_message/gmail_download_attachment (uids are per-mailbox).',
    inputSchema: {
      query: z.string().min(1).describe('Gmail search query (X-GM-RAW syntax)'),
      mailbox: z.string().optional().describe('Mailbox to search (default: the All Mail folder)'),
      limit: z.number().int().min(1).max(200).default(25).describe('Max results'),
    },
  },
  async ({ query, mailbox, limit }) => {
    try {
      return await withClient(async (client) => {
        const box = mailbox || (await resolveAllMail(client))
        return withMailbox(client, box, async () => {
          const uids = await client.search({ gmailRaw: query }, { uid: true })
          if (!uids || uids.length === 0) return ok({ mailbox: box, count: 0, messages: [] })
          const pick = uids.slice(-limit) // highest (newest) uids
          const out = []
          for await (const msg of client.fetch(pick, { envelope: true, flags: true, size: true, bodyStructure: true }, { uid: true })) {
            out.push(fmtSummary(msg))
          }
          out.sort((a, b) => (b.uid ?? 0) - (a.uid ?? 0))
          return ok({ mailbox: box, count: out.length, messages: out })
        })
      })
    } catch (e) { return fail(e?.message ?? e) }
  }
)

server.registerTool(
  'gmail_get_message',
  {
    title: 'Read one message',
    description: 'Fetch a full message by uid from a mailbox: headers, plain-text body, and a list of attachments (each with a "part" id to pass to gmail_download_attachment).',
    inputSchema: {
      uid: z.number().int().describe('Message uid (from gmail_list_messages / gmail_search)'),
      mailbox: z.string().default('INBOX').describe('Mailbox the uid belongs to (default: INBOX; for search results use the "mailbox" it returned)'),
    },
  },
  async ({ uid, mailbox }) => {
    try {
      return await withClient(async (client) =>
        withMailbox(client, mailbox, async () => {
          let source = null
          let bodyStructure = null
          let flags = null
          for await (const msg of client.fetch(`${uid}`, { source: true, bodyStructure: true, flags: true }, { uid: true })) {
            source = msg.source
            bodyStructure = msg.bodyStructure
            flags = msg.flags
          }
          if (!source) return fail(`message uid ${uid} not found in ${mailbox}`)
          const parsed = await simpleParser(source)
          return ok({
            uid,
            mailbox,
            subject: parsed.subject ?? null,
            from: parsed.from?.text ?? null,
            to: parsed.to?.text ?? null,
            cc: parsed.cc?.text ?? null,
            date: parsed.date ?? null,
            seen: flags ? flags.has('\\Seen') : null,
            text: parsed.text ?? null,
            attachments: collectAttachments(bodyStructure),
          })
        })
      )
    } catch (e) { return fail(e?.message ?? e) }
  }
)

server.registerTool(
  'gmail_download_attachment',
  {
    title: 'Download an attachment',
    description: 'Download one attachment (by message uid + part id from gmail_get_message) to a local file, and return the saved path.',
    inputSchema: {
      uid: z.number().int().describe('Message uid'),
      part: z.string().min(1).describe('Attachment part id (from gmail_get_message attachments[].part)'),
      mailbox: z.string().default('INBOX').describe('Mailbox the uid belongs to (default: INBOX)'),
      outDir: z.string().optional().describe('Output directory (defaults to gmail-mcp/downloads)'),
    },
  },
  async ({ uid, part, mailbox, outDir }) => {
    try {
      return await withClient(async (client) =>
        withMailbox(client, mailbox, async () => {
          const { content, meta } = await client.download(`${uid}`, part, { uid: true })
          if (!content) return fail(`no content for uid ${uid} part ${part}`)
          const dir = outDir || path.join(import.meta.dirname, 'downloads')
          fs.mkdirSync(dir, { recursive: true })
          const safe = (meta?.filename || `attachment-${uid}-${part}`).replace(/[/\\]/g, '_')
          const file = path.join(dir, safe)
          await pipeline(content, fs.createWriteStream(file))
          const { size } = fs.statSync(file)
          return ok({ saved: true, path: file, filename: safe, contentType: meta?.contentType ?? null, bytes: size })
        })
      )
    } catch (e) { return fail(e?.message ?? e) }
  }
)

server.registerTool(
  'gmail_delete_message',
  {
    title: 'Delete a message (move to Trash)',
    description: 'Delete a message by uid by moving it to Trash. In Gmail this is reversible — the message stays in Trash for ~30 days before being purged automatically. Pass the mailbox the uid belongs to (default INBOX; for search results use the "mailbox" that search returned).',
    inputSchema: {
      uid: z.number().int().describe('Message uid (from gmail_list_messages / gmail_search)'),
      mailbox: z.string().default('INBOX').describe('Mailbox the uid belongs to (default: INBOX)'),
    },
  },
  async ({ uid, mailbox }) => {
    try {
      return await withClient(async (client) => {
        const trash = await resolveTrash(client)
        if (mailbox === trash) {
          return fail(`uid ${uid} is already in Trash (${trash}); permanent purge is not supported by this tool`)
        }
        return withMailboxRW(client, mailbox, async () => {
          // Confirm the message exists first so we return a clear error rather
          // than silently succeeding on a no-op move.
          let found = false
          for await (const _ of client.fetch(`${uid}`, { uid: true }, { uid: true })) { found = true }
          if (!found) return fail(`message uid ${uid} not found in ${mailbox}`)
          // In Gmail, moving to Trash drops all other labels — this is exactly
          // what the web UI's "Delete" button does.
          await client.messageMove(`${uid}`, trash, { uid: true })
          return ok({ deleted: true, uid, from: mailbox, movedTo: trash })
        })
      })
    } catch (e) { return fail(e?.message ?? e) }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('gmail-mcp: connected and ready.')
}

main().catch((e) => {
  console.error('gmail-mcp fatal:', e?.message ?? e)
  process.exit(1)
})
