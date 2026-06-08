#!/usr/bin/env node
// One-time QR login (like Telegram Web / Desktop "Link Device").
// Renders a QR you scan from your phone: Telegram app -> Settings -> Devices ->
// Link Desktop Device. No SMS / login code needed. Writes TG_SESSION into .env.
// Run with: npm run login:qr   (or: node login-qr.js)
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import qrcode from 'qrcode-terminal'
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
  await client.connect()
  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      // Called once per generated token; Telegram refreshes it every ~30s, so
      // this may fire several times. Re-render the QR each time.
      qrCode: async (code) => {
        const token = code.token.toString('base64url')
        const url = `tg://login?token=${token}`
        console.clear()
        console.log('Scan with your phone: Telegram -> Settings -> Devices -> Link Desktop Device\n')
        qrcode.generate(url, { small: true })
        console.log(`\n(or paste this into a browser on a logged-in device: ${url})`)
        console.log('\nWaiting for you to scan...')
      },
      // Account has 2FA enabled -> Telegram asks for the cloud password after scan.
      password: async () => ask('\n2FA password: '),
      onError: (err) => { console.error('QR login error:', err?.message ?? err); return true },
    }
  )

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
  console.log(`Session saved to ${envPath}. Restart the MCP server (or /mcp) now.`)
} catch (err) {
  console.error('Login failed:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await client.disconnect()
  rl.close()
  // GramJS keeps timers/update loops alive; force exit so the script doesn't hang.
  process.exit(process.exitCode ?? 0)
}
