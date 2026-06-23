#!/usr/bin/env node
// Standalone media downloader — uses the same MTProto session as the MCP server.
// Handy when the MCP host can't hot-reload a newly added tool: run this directly.
// Usage: node media-download.js <chat> <messageId> [messageId...]
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH
const sessionStr = process.env.TG_SESSION

const [, , chatRef, ...idArgs] = process.argv
if (!chatRef || !idArgs.length) {
  console.error('Usage: node media-download.js <chat> <messageId> [messageId...]')
  process.exit(1)
}
const ids = idArgs.map(Number)

const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 5,
})

async function resolveEntity(ref) {
  const refText = String(ref).trim()
  if (/^@?[a-zA-Z]/.test(refText)) {
    try {
      return await client.getEntity(refText.startsWith('@') ? refText : '@' + refText)
    } catch {
      /* fall through */
    }
    try {
      return await client.getEntity(refText)
    } catch {
      /* fall through */
    }
  }
  if (/^-?\d+$/.test(refText)) {
    try {
      return await client.getEntity(Number(refText))
    } catch {
      /* fall through */
    }
  }
  const dialogs = await client.getDialogs({ limit: 200 })
  const match = dialogs.find(
    (dialog) =>
      String(dialog.id) === refText ||
      dialog.entity?.username?.toLowerCase() === refText.replace(/^@/, '').toLowerCase() ||
      dialog.title === refText,
  )
  if (match) {
    return match.entity
  }
  throw new Error(`Could not resolve chat "${ref}"`)
}

async function main() {
  await client.connect()
  const entity = await resolveEntity(chatRef)
  const msgs = await client.getMessages(entity, { ids })
  const dir = path.join(import.meta.dirname, 'downloads')
  fs.mkdirSync(dir, { recursive: true })
  for (const message of msgs) {
    if (!message || !message.media) {
      console.log(`#${message?.id}: no media`)
      continue
    }
    const buf = await client.downloadMedia(message, {})
    if (!buf?.length) {
      console.log(`#${message.id}: empty download`)
      continue
    }
    const ext = message.photo ? 'jpg' : message.document?.mimeType?.split('/')[1] || 'bin'
    const file = path.join(dir, `media-${message.id}.${ext}`)
    fs.writeFileSync(file, buf)
    console.log(`#${message.id}: saved ${file} (${buf.length} bytes)`)
  }
  await client.disconnect()
  process.exit(0)
}

main().catch((error) => {
  console.error('error:', error?.message ?? error)
  process.exit(1)
})
