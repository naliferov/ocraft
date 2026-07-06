// auth.js — sessions + per-user identity. Email+password is the default sign-in for dev / self-host
// (needs nothing but Postgres); Google OAuth is an OPTIONAL provider (set GOOGLE_CLIENT_ID/SECRET).
// Prod (NODE_ENV=production) is Google-ONLY — the email+password routes are disabled there.
//
// Sign-in IS sign-up: signup() creates a users row (email + a scrypt password_hash); the first Google
// login creates one too (a users row + a linked accounts row), and links to an existing email account
// when the verified Google email already has one. Sessions are opaque random ids stored in Postgres
// (sessions table); the cookie carries the id, not anything secret. resolveUser(req) returns the
// caller's user_id (or null) for every request. There is NO dev bypass — dev and prod run the same
// code; only config differs (DATABASE_URL, the Google redirect host, COOKIE_SECURE).
import type { IncomingMessage, ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { readBody } from './lib/http.ts'
import { sql } from './db.ts'

const scrypt = promisify(crypto.scrypt)

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const SESSION_COOKIE = 'ocraft_session'
const STATE_COOKIE = 'ocraft_oauth_state'
const SESSION_TTL_DAYS = 30
const IS_PROD = process.env.NODE_ENV === 'production'
const COOKIE_SECURE = IS_PROD || process.env.COOKIE_SECURE === 'true'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MIN_PASSWORD = 8

// Auth at all needs a database (users + sessions live in pg). Email+password works with just that;
// Google additionally needs its two creds — the SPA shows the Google button only when this is true.
export const authConfigured = Boolean(sql)
export const googleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && sql)

// Prod is Google-ONLY: email+password is disabled when NODE_ENV=production (the public instance
// signs in with Google — no password storage / reset surface). Dev and non-prod self-hosts allow it.
export const emailAuthEnabled = !IS_PROD

const readCookie = (req: IncomingMessage, name: string) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return ''
}

// HttpOnly cookies. SameSite=Lax (not Strict) so the cookie survives the top-level redirect back
// from Google, and so an external link to the app arrives logged-in; Lax still blocks the cookie on
// cross-site POST/DELETE, which is the CSRF-dangerous case for this REST API. Secure in prod.
const cookie = (name, value, maxAgeSeconds) =>
  [
    `${name}=${value}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    ...(COOKIE_SECURE ? ['Secure'] : []),
  ].join('; ')

const sendJson = (res, status, obj) =>
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj))

const readJson = async (req: IncomingMessage) => {
  try {
    return await readBody(req)
  } catch {
    return null
  }
}

// --- password hashing — Node's built-in scrypt (memory-hard), NO external dependency ---
// Stored as scrypt$<salt-hex>$<hash-hex>; a per-password random salt means identical passwords
// hash differently, and verification is constant-time.
const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16)
  const hash = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

const verifyPassword = async (password, stored) => {
  const [scheme, saltHex, hashHex] = (stored || '').split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    return false
  }
  const expected = Buffer.from(hashHex, 'hex')
  const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// --- sessions (pg) ---
const createSession = async (userId) => {
  const id = crypto.randomBytes(32).toString('hex')
  await sql`insert into sessions (id, user_id, expires_at)
            values (${id}, ${userId}, now() + (${SESSION_TTL_DAYS} * interval '1 day'))`
  return id
}

const userForSession = async (sessionId) => {
  if (!sql || !sessionId) {
    return null
  }
  const [row] = await sql`select user_id from sessions
                          where id = ${sessionId} and (expires_at is null or expires_at > now())`
  return row ? row.user_id : null
}

// Mint a session for userId and write the cookie + a JSON body in one 200 response.
const signIn = async (res, userId, payload) => {
  const sessionId = await createSession(userId)
  res
    .writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie(SESSION_COOKIE, sessionId, SESSION_TTL_DAYS * 86400),
    })
    .end(JSON.stringify(payload))
}

// The caller's user_id for this request, or null — strictly from a valid session cookie. NO dev
// bypass: dev and prod run identical code; only config differs. No session → null → 401.
export const resolveUser = async (req: IncomingMessage) =>
  userForSession(readCookie(req, SESSION_COOKIE))

// --- email + password ---
// signup: a first-time account (email must be free). login: an existing one. Both set the session
// cookie on success. The login error is deliberately identical for unknown-email vs wrong-password.
export const signup = async (req: IncomingMessage, res: ServerResponse) => {
  if (!emailAuthEnabled) {
    return sendJson(res, 403, { error: 'Email sign-in is disabled on this server — use Google' })
  }
  if (!sql) {
    return sendJson(res, 503, { error: 'Auth unavailable — DATABASE_URL is not set' })
  }
  const { email: rawEmail = '', password = '' } = (await readJson(req)) || {}
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { error: 'Enter a valid email address' })
  }
  if (password.length < MIN_PASSWORD) {
    return sendJson(res, 400, { error: `Password must be at least ${MIN_PASSWORD} characters` })
  }
  const [existing] = await sql`select id from users where email = ${email}`
  if (existing) {
    return sendJson(res, 409, { error: 'That email is already registered — sign in instead' })
  }
  const passwordHash = await hashPassword(password)
  const [user] = await sql`insert into users (email, password_hash)
                           values (${email}, ${passwordHash}) returning id`
  await signIn(res, user.id, { ok: true, email })
}

export const login = async (req: IncomingMessage, res: ServerResponse) => {
  if (!emailAuthEnabled) {
    return sendJson(res, 403, { error: 'Email sign-in is disabled on this server — use Google' })
  }
  if (!sql) {
    return sendJson(res, 503, { error: 'Auth unavailable — DATABASE_URL is not set' })
  }
  const { email: rawEmail = '', password = '' } = (await readJson(req)) || {}
  const email = rawEmail.trim().toLowerCase()
  const [user] = await sql`select id, password_hash from users where email = ${email}`
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return sendJson(res, 401, { error: 'Wrong email or password' })
  }
  await signIn(res, user.id, { ok: true, email })
}

// --- Google OAuth (optional provider) ---
// Find-or-create a user by provider account (first sign-in = sign-up). Links to an existing user
// when the verified provider email already has an account, so Google-after-email doesn't duplicate.
const upsertUser = async (provider, providerAccountId, email, name) => {
  const [linked] = await sql`select user_id from accounts
                             where provider = ${provider} and provider_account_id = ${providerAccountId}`
  if (linked) {
    return linked.user_id
  }
  const normEmail = email ? email.trim().toLowerCase() : null
  let userId
  if (normEmail) {
    const [byEmail] = await sql`select id from users where email = ${normEmail}`
    userId = byEmail ? byEmail.id : undefined
  }
  if (!userId) {
    const [user] = await sql`insert into users (email, name) values (${normEmail}, ${name}) returning id`
    userId = user.id
  }
  await sql`insert into accounts (user_id, provider, provider_account_id)
            values (${userId}, ${provider}, ${providerAccountId})`
  return userId
}

// The callback URL must match what's registered in Google Cloud. Derive it from the forwarded
// proto/host (Cloudflare/Caddy in prod) so local (localhost:5173) and prod (the domain) both work.
const redirectUri = (req: IncomingMessage) => {
  // APP_ORIGIN pins the public origin. Set it in dev to http://localhost:5173 (the Vite port): the
  // Vite proxy makes the api see its own :3001 host, so header-derivation would send the wrong
  // redirect_uri. In prod behind Cloudflare the forwarded headers are correct → APP_ORIGIN optional.
  if (process.env.APP_ORIGIN) {
    return `${process.env.APP_ORIGIN}/api/auth/google/callback`
  }
  const proto = req.headers['x-forwarded-proto'] || (COOKIE_SECURE ? 'https' : 'http')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}/api/auth/google/callback`
}

export const startGoogleLogin = (req: IncomingMessage, res: ServerResponse) => {
  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
  })
  res
    .writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': cookie(STATE_COOKIE, state, 600), // short-lived, verified on the callback (CSRF)
    })
    .end()
}

export const handleGoogleCallback = async (req: IncomingMessage, res: ServerResponse) => {
  const query = new URL(req.url, 'http://localhost').searchParams
  // Google can hand the failure back as ?error= (e.g. access_denied) — surface + log it.
  if (query.get('error')) {
    console.error('[auth] google returned error:', query.get('error'))
    res.writeHead(400).end(`Google sign-in failed: ${query.get('error')}`)
    return
  }
  const code = query.get('code')
  const state = query.get('state')
  if (!code || !state || state !== readCookie(req, STATE_COOKIE)) {
    console.error(
      '[auth] callback state mismatch — code:',
      Boolean(code),
      'state-cookie:',
      Boolean(readCookie(req, STATE_COOKIE)),
    )
    res.writeHead(400).end('OAuth state mismatch')
    return
  }
  // Exchange the code for tokens (server-to-server, over TLS).
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  })
  const tokens = (await tokenRes.json()) as any
  if (!tokens.id_token) {
    console.error('[auth] token exchange failed:', tokens.error, '-', tokens.error_description)
    res.writeHead(502).end(`Google token exchange failed: ${tokens.error || 'no id_token'}`)
    return
  }
  // The id_token is a JWT; trust it because it came straight from Google's token endpoint over TLS
  // (no signature check needed for the authorization-code flow). Payload: { sub, email, name }.
  const profile = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
  const userId = await upsertUser('google', profile.sub, profile.email, profile.name)
  const sessionId = await createSession(userId)
  res
    .writeHead(302, {
      Location: '/',
      'Set-Cookie': [cookie(SESSION_COOKIE, sessionId, SESSION_TTL_DAYS * 86400), cookie(STATE_COOKIE, '', 0)],
    })
    .end()
}

export const logout = async (req: IncomingMessage, res: ServerResponse) => {
  if (sql) {
    const sessionId = readCookie(req, SESSION_COOKIE)
    if (sessionId) {
      await sql`delete from sessions where id = ${sessionId}`
    }
  }
  res
    .writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) })
    .end(JSON.stringify({ ok: true }))
}
