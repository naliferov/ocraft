#!/usr/bin/env node
// One-time interactive login. Prompts for phone + code (+ 2FA password if set),
// then writes the resulting MTProto session string into .env as TG_SESSION.
// Run with: npm run login   (or: node login.js)
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH

if (!apiId || !apiHash) {
  console.error(
    'Missing TG_API_ID / TG_API_HASH.\n' +
    'Get them from https://my.telegram.org -> API development tools,\n' +
    'then put them in telegram-mcp/.env (copy .env.example).'
  )
  process.exit(1)
}

const rl = readline.createInterface({ input, output })
const ask = (q) => rl.question(q)

const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 5,
})

try {
  await client.start({
    phoneNumber: () => ask('Phone number (international, e.g. +15551234567): '),
    phoneCode: () => ask('Login code (sent to you in Telegram): '),
    password: () => ask('2FA password (press Enter if you have none): '),
    onError: (err) => console.error(err),
  })

  const session = String(client.session.save())
  const me = await client.getMe()
  console.log(`\nLogged in as ${me.firstName ?? ''} ${me.lastName ?? ''} (@${me.username ?? 'n/a'}).`)

  // Upsert TG_SESSION into .env (next to this file).
  const envPath = path.join(import.meta.dirname, '.env')
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  const line = `TG_SESSION=${session}`
  env = /^TG_SESSION=.*$/m.test(env)
    ? env.replace(/^TG_SESSION=.*$/m, line)
    : (env.trimEnd() + '\n' + line + '\n')
  fs.writeFileSync(envPath, env)
  console.log(`Session saved to ${envPath}. Login is one-time; you can restart the MCP server now.`)
} catch (err) {
  console.error('Login failed:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await client.disconnect()
  rl.close()
  // GramJS keeps timers/update loops alive; force exit so the script doesn't hang.
  process.exit(process.exitCode ?? 0)
}
