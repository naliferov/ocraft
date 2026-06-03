#!/usr/bin/env node
// One-shot logout. Connects with the current TG_SESSION, terminates that session
// on Telegram's side (auth.logOut), then removes TG_SESSION from .env.
// Run with: npm run logout   (or: node logout.js)
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH
const sessionStr = process.env.TG_SESSION

if (!apiId || !apiHash) {
  console.error('Missing TG_API_ID / TG_API_HASH in telegram-mcp/.env.')
  process.exit(1)
}

if (!sessionStr) {
  console.log('No TG_SESSION set — already logged out. Nothing to do.')
  process.exit(0)
}

const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 5,
})

try {
  await client.connect()
  await client.invoke(new Api.auth.LogOut())
  console.log('Logged out: the session has been terminated on Telegram.')

  // Remove the TG_SESSION line from .env so the stale string isn't reused.
  const envPath = path.join(import.meta.dirname, '.env')
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf-8')
    const stripped = env.replace(/^TG_SESSION=.*$\n?/m, '')
    fs.writeFileSync(envPath, stripped)
    console.log(`Removed TG_SESSION from ${envPath}. Run \`npm run login\` to authenticate again.`)
  }
} catch (err) {
  console.error('Logout failed:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await client.disconnect()
  // GramJS keeps timers/update loops alive; force exit so the script doesn't hang.
  process.exit(process.exitCode ?? 0)
}
