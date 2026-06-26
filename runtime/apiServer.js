import 'dotenv/config' // load <repo>/.env (API_TOKEN, PORT) — the service runs with cwd = repo root
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { getDirname } from './lib/path.js'
import * as runManager from './runManager.js'
// import * as aiRunner from './runners/ai.js' // DISABLED for prod — see registration below
import * as taskSource from './runners/task.js'
import * as serviceSource from './runners/service.js'

// Register the run KINDS with the universal run manager (./runManager.js): 'ai' is an
// owned/ephemeral runner (started + streamed + cancelled here); 'task' and 'service'
// are read-only SOURCES surfacing taskExecutor executions and serviceManager daemons
// in the one unified GET /api/runs view (they're started via the CLI / scheduler).
//
// ⚠️ SECURITY: the 'ai' runner executes the Claude Agent SDK with bypassPermissions
// (arbitrary file edits + shell), cwd = repo root. DISABLED for the prod deploy — any
// authed caller could otherwise run code on the box. Re-enable behind an explicit
// off-by-default env gate (OCRAFT_ENABLE_AGENT) when sandboxed. With it unregistered,
// POST /api/runs {kind:'ai'} returns "unknown kind", which is the intended refusal.
// runManager.registerRunner('ai', aiRunner)
runManager.registerRunner('task', taskSource)
runManager.registerRunner('service', serviceSource)

const currentDir = getDirname(import.meta.url) // runtime/
const NODES_DIR = path.join(currentDir, '..', 'data/nodes') // node store lives at <root>/data
const ASSETS_DIR = path.join(currentDir, '..', 'data/assets')
const DIST_DIR = path.join(currentDir, '..', 'frontend/dist') // built Vue SPA — served in prod after `npm run build`

// --- Auth ------------------------------------------------------------------
// Every request needs the secret API_TOKEN (.env). The browser sends it as an HttpOnly
// SESSION COOKIE — set by POST /api/login, invisible to JS, so an XSS can't steal it and
// the browser auto-attaches it on each request. A bearer header is also accepted (for
// non-browser callers). Unset API_TOKEN = open + a loud warning, so a fresh checkout
// doesn't silently break.
const API_TOKEN = process.env.API_TOKEN || ''
const SESSION_COOKIE = 'ocraft_session'
// Prod runs HTTPS-only behind a TLS proxy. In prod the session cookie gets `Secure` (never
// sent over http) and every response carries HSTS (so the browser refuses http:// to this
// origin going forward). Auto-on when NODE_ENV=production; COOKIE_SECURE=true forces it too.
// Off for local http://localhost dev so the cookie still rides over plain http.
const IS_PROD = process.env.NODE_ENV === 'production'
const COOKIE_SECURE = IS_PROD || process.env.COOKIE_SECURE === 'true'
if (!API_TOKEN) {
  console.warn(
    '⚠️  API_TOKEN is not set — the API server is UNAUTHENTICATED. Add API_TOKEN to .env to lock it.',
  )
}

// Constant-time token compare (length guard first, so timingSafeEqual gets equal-length
// buffers) — the token can't be recovered byte-by-byte from response timing.
const tokenMatches = (candidate) => {
  if (!candidate) {
    return false
  }
  const expected = Buffer.from(API_TOKEN)
  const given = Buffer.from(candidate)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return ''
}

const isAuthorized = (req) => {
  if (!API_TOKEN) {
    return true
  }
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  return tokenMatches(bearer) || tokenMatches(readCookie(req, SESSION_COOKIE))
}

// HttpOnly + SameSite=Strict (not sent cross-site → CSRF defense) + Secure in prod.
const sessionCookie = (token) =>
  [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=31536000',
    ...(COOKIE_SECURE ? ['Secure'] : []),
  ].join('; ')

const clearedCookie = () => `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`

// POST /api/login { token } → validate and set the session cookie. POST /api/logout →
// clear it. Both are reachable WITHOUT an existing session (that's how you get one).
// Brute-force throttle for /api/login: after LOGIN_MAX_FAILS bad attempts from one IP
// within LOGIN_WINDOW_MS, refuse with 429 until the window clears. A success clears the
// IP. Client IP comes from the proxy's X-Forwarded-For first hop (we own the proxy, and
// the app is localhost-bound so the header can't be forged from outside), else the socket.
const LOGIN_MAX_FAILS = 5
const LOGIN_WINDOW_MS = 60_000
const loginFailsByIp = new Map() // ip -> [recent failure timestamps]

const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for']
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown'
}

const recentFails = (ip) => {
  const cutoff = Date.now() - LOGIN_WINDOW_MS
  const fresh = (loginFailsByIp.get(ip) || []).filter((at) => at > cutoff)
  loginFailsByIp.set(ip, fresh)
  return fresh
}

const handleLogin = async (req, res) => {
  const ip = clientIp(req)
  if (recentFails(ip).length >= LOGIN_MAX_FAILS) {
    res
      .writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      .end(JSON.stringify({ error: 'too many attempts' }))
    return
  }
  let token = ''
  try {
    ;({ token } = await readBody(req))
  } catch (err) {
    if (err.statusCode) {
      throw err // payload too large → let the dispatch return 413, don't mask it as 401
    }
    // missing/invalid body → token stays '' → fails the check below (unless open)
  }
  if (API_TOKEN && !tokenMatches(token)) {
    loginFailsByIp.get(ip).push(Date.now()) // recentFails() seeded the array above
    res
      .writeHead(401, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'invalid token' }))
    return
  }
  loginFailsByIp.delete(ip) // success clears the throttle for this IP
  res
    .writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) })
    .end(JSON.stringify({ ok: true }))
}

const handleLogout = (res) => {
  res
    .writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': clearedCookie() })
    .end(JSON.stringify({ ok: true }))
}

// Node ids are numeric folder names; reject anything else so a `:id` can't smuggle a
// `..` into a filesystem path. (The /api/assets route has its own traversal guard.)
const isNodeId = (id) => /^[0-9]+$/.test(id)

const nodePath = (id) => path.join(NODES_DIR, id, 'state.json')

// Resolve a node's folder under NODES_DIR, rejecting anything that escapes it
// (an `id` of `..` would otherwise let DELETE rm a folder outside the data store).
const nodeDirSafe = (id) => {
  const full = path.resolve(NODES_DIR, id)
  if (full !== NODES_DIR && full.startsWith(NODES_DIR + path.sep)) {
    return full
  }
  return null
}

// Mint the next node id: the smallest unused positive integer (folder names are
// numeric strings, `"1"`, `"2"`, …). Scans existing folders for the max and +1.
const mintNodeId = async () => {
  const dirs = await fs.readdir(NODES_DIR)
  const maxId = dirs.reduce((max, dir) => {
    const num = Number(dir)
    return Number.isInteger(num) && num > max ? num : max
  }, 0)
  return String(maxId + 1)
}

// Ids of nodes whose `parentId` is `id` (children block a delete). Reads every
// node's state.json — fine at this scale; the store does the same on load.
const childrenOf = async (parentId) => {
  const dirs = await fs.readdir(NODES_DIR)
  const children = []
  for (const dir of dirs) {
    try {
      const { parentId: nodeParentId } = JSON.parse(await fs.readFile(nodePath(dir), 'utf-8'))
      if (nodeParentId === parentId) {
        children.push(dir)
      }
    } catch {
      // skip unreadable/partial node dirs
    }
  }
  return children
}

// Static asset serving (GET /api/assets/<relpath>). Used by the scene renderer to
// load clipart SVGs from data/assets/. Read-only; guarded against path traversal.
const ASSET_CONTENT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
}

const serveAsset = async (res, relPath) => {
  // Resolve under ASSETS_DIR and reject anything that escapes it (../ traversal).
  const full = path.resolve(ASSETS_DIR, decodeURIComponent(relPath))
  if (full !== ASSETS_DIR && !full.startsWith(ASSETS_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    const data = await fs.readFile(full)
    const type = ASSET_CONTENT_TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type }).end(data)
  } catch {
    res.writeHead(404).end('Not found')
  }
}

// --- Frontend (built Vue SPA) -------------------------------------------------
// In production this same process also serves frontend/dist (built by `npm run
// build`), so the editor and the API share one origin — the SameSite=Strict session
// cookie requires it. Served WITHOUT auth: the bundle holds no secrets (the token
// isn't baked into the build) and the login page must load before a session exists.
// In dev this is unused — Vite serves the SPA and proxies /api here.
const STATIC_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

// Serve index.html — the SPA entry. no-cache so a redeploy (which renames the hashed
// asset files index.html points at) is picked up at once; a missing file means the
// frontend simply wasn't built.
const serveIndexHtml = async (res) => {
  try {
    const html = await fs.readFile(path.join(DIST_DIR, 'index.html'))
    res
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      .end(html)
  } catch {
    res.writeHead(404).end('Frontend not built — run `npm run build` in frontend/')
  }
}

// Serve a built-SPA file under DIST_DIR, falling back to index.html so vue-router's
// history-mode routes (/node/:id) resolve on direct load / refresh. A path WITH a file
// extension that isn't found is a real 404 — only extension-less paths (client routes)
// fall back to index.html. Path-guarded against ../ traversal out of DIST_DIR.
const serveStatic = async (res, urlPath) => {
  const relPath = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).slice(1)
  const full = path.resolve(DIST_DIR, relPath)
  if (full === DIST_DIR || full.startsWith(DIST_DIR + path.sep)) {
    try {
      const data = await fs.readFile(full)
      const type =
        STATIC_CONTENT_TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream'
      // Vite content-hashes everything under /assets/ — cache those forever.
      const cacheControl = urlPath.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl }).end(data)
      return
    } catch {
      // not a real file — fall through to the SPA fallback
    }
  }
  if (path.extname(urlPath)) {
    res.writeHead(404).end('Not found')
    return
  }
  await serveIndexHtml(res)
}

// Send a text/JSON body, gzipped when the client accepts it. The text-heavy reads
// here (the node list, html content bodies, script source) compress ~4-5×; tiny
// bodies skip it (the gzip header overhead isn't worth it). Single-user local dev
// server, so synchronous gzip is fine.
const sendText = (req, res, body, contentType) => {
  const buffer = Buffer.from(body)
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip')
  if (acceptsGzip && buffer.length > 512) {
    res
      .writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
      })
      .end(zlib.gzipSync(buffer))
  } else {
    res.writeHead(200, { 'Content-Type': contentType }).end(buffer)
  }
}

// Cap request bodies so a client can't exhaust memory by streaming an unbounded payload
// (readBody is reachable pre-auth via POST /api/login). Reject early on the declared
// Content-Length, and abort mid-stream if the actual bytes exceed the cap. The thrown
// error carries statusCode 413, which the top-level dispatch turns into a 413 response.
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 5 * 1024 * 1024 // 5 MB

const tooLarge = () => {
  const err = new Error('payload too large')
  err.statusCode = 413
  return err
}

const readRaw = async (req) => {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    throw tooLarge()
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      req.destroy()
      throw tooLarge()
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

const readBody = async (req) => JSON.parse(await readRaw(req))
const readText = (req) => readRaw(req)

// A node's body lives in a sidecar file (kept out of state.json so the node list
// stays tiny). Which file + content-type is decided by node type — both are served
// through the single /body endpoint below. Add a type here to give it a body.
const NODE_BODY = {
  script: { file: 'script.js', contentType: 'text/javascript' },
  html: { file: 'content.html', contentType: 'text/html; charset=utf-8' },
}

// Resolve a node's body-sidecar spec from its type, or null if the node is missing
// or its type carries no body. Reads state.json (small — metadata only now).
const bodySpecOf = async (id) => {
  try {
    const { type } = JSON.parse(await fs.readFile(nodePath(id), 'utf-8'))
    return NODE_BODY[type] ?? null
  } catch {
    return null
  }
}

const routes = {
  'GET /api/nodes': async (req, res) => {
    const dirs = await fs.readdir(NODES_DIR)
    const nodes = await Promise.all(
      dirs.map(async (id) => {
        const raw = await fs.readFile(nodePath(id), 'utf-8')
        const { id: _id, ...data } = JSON.parse(raw)
        return { id, ...data }
      }),
    )
    sendText(req, res, JSON.stringify(nodes), 'application/json')
  },

  'GET /api/nodes/:id': async (req, res, { id }) => {
    try {
      const raw = await fs.readFile(nodePath(id), 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(raw)
    } catch {
      res.writeHead(404).end('Not found')
    }
  },

  // A node's body sidecar — a script node's script.js, an html node's content.html.
  // One CRUD pair for both: the file + content-type come from the node's type (see
  // NODE_BODY). Kept out of state.json so the node list stays tiny (GET /api/nodes);
  // gzipped on read since bodies are the heavy part.
  'GET /api/nodes/:id/body': async (req, res, { id }) => {
    // The node itself must exist (a genuinely missing node → 404). But an existing
    // node with no body *yet* returns an empty 200, not a 404 — this covers a node
    // whose type carries no body sidecar, and (the reported case) a freshly-created
    // node switched to html/script in the editor before its first Save: the server
    // still sees the old type, or content.html isn't written yet. Returning 200
    // empty lets the editor load cleanly instead of logging a spurious 404.
    let node
    try {
      node = JSON.parse(await fs.readFile(nodePath(id), 'utf-8'))
    } catch {
      res.writeHead(404).end('Not found')
      return
    }
    const spec = NODE_BODY[node.type] ?? null
    if (!spec) {
      sendText(req, res, '', 'text/plain; charset=utf-8')
      return
    }
    try {
      const raw = await fs.readFile(path.join(NODES_DIR, id, spec.file), 'utf-8')
      sendText(req, res, raw, spec.contentType)
    } catch {
      sendText(req, res, '', spec.contentType)
    }
  },

  'POST /api/nodes/:id/body': async (req, res, { id }) => {
    const spec = await bodySpecOf(id)
    if (!spec) {
      res.writeHead(400).end('Node type has no body')
      return
    }
    await fs.writeFile(path.join(NODES_DIR, id, spec.file), await readText(req))
    res.writeHead(200).end('Saved')
  },


  'POST /api/nodes/:id': async (req, res, { id }) => {
    const body = await readBody(req)
    const dir = path.join(NODES_DIR, id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(nodePath(id), JSON.stringify(body, null, 2))
    res.writeHead(200).end('Saved')
  },

  // Create a node with a server-minted id (the body carries no id — that's what
  // distinguishes this from the upsert above). Returns the new node incl. its id.
  'POST /api/nodes': async (req, res) => {
    const body = await readBody(req)
    const id = await mintNodeId()
    await fs.mkdir(path.join(NODES_DIR, id), { recursive: true })
    await fs.writeFile(nodePath(id), JSON.stringify(body, null, 2))
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id, ...body }))
  },

  // Delete a node's folder. Refuses with 409 if it still has children (no silent
  // orphaning — the caller must reparent/delete them first). Path-guarded so an
  // `id` like `..` can't escape the data store.
  'DELETE /api/nodes/:id': async (req, res, { id }) => {
    const dir = nodeDirSafe(id)
    if (!dir) {
      res.writeHead(403).end('Forbidden')
      return
    }
    const children = await childrenOf(id)
    if (children.length) {
      res
        .writeHead(409, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Node has children', children }))
      return
    }
    try {
      await fs.rm(dir, { recursive: true, force: true })
      res.writeHead(200).end('Deleted')
    } catch (error) {
      res
        .writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: error.message }))
    }
  },

  // --- Universal RUN manager — one view over everything that runs (see ./runManager.js) ---
  // GET /api/runs lists AI runs (owned/ephemeral) + service daemons + task executions
  // as one uniform record set. POST starts on-demand 'ai' runs (task/service are
  // observe-only here). ⚠️ The 'ai' runner runs Claude with bypassPermissions —
  // single-user / trusted only — never expose this server to a network without sandboxing.
  'POST /api/runs': async (req, res) => {
    try {
      const { kind, input = {} } = await readBody(req)
      if (!kind) {
        throw new Error('kind (string) required')
      }
      const run = runManager.start(kind, input)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
    } catch (error) {
      res
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: error.message }))
    }
  },

  'GET /api/runs': async (req, res) => {
    const kind = new URL(req.url, 'http://localhost').searchParams.get('kind') || undefined
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(await runManager.list(kind)))
  },

  'GET /api/runs/:id': async (req, res, { id }) => {
    const run = await runManager.get(id)
    if (!run) {
      res
        .writeHead(404, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
  },

  // Server-Sent Events: a snapshot, then live deltas until the run ends or the
  // client disconnects. The handler returns immediately; the socket stays open
  // (no res.end) and is fed by the controller's listener.
  'GET /api/runs/:id/stream': async (req, res, { id }) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    // A client can vanish (ECONNRESET) between heartbeats. Writing to the dropped socket
    // emits an 'error' on res that, with no listener, would crash the process — and a
    // late write can fire before the 'close' cleanup below runs. Swallow the error event
    // and guard every write so a gone client just stops receiving, it never takes us down.
    res.on('error', () => {})
    const safeWrite = (chunk) => {
      if (res.writableEnded || res.destroyed) {
        return
      }
      try {
        res.write(chunk)
      } catch {
        // socket closed under us — the 'close' handler tears down the subscription
      }
    }
    const send = (event) => safeWrite(`data: ${JSON.stringify(event)}\n\n`)
    const unsubscribe = runManager.subscribe(id, send)
    if (!unsubscribe) {
      send({ type: 'error', error: 'not found' })
      res.end()
      return
    }
    const heartbeat = setInterval(() => safeWrite(': ping\n\n'), 15000)
    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  },

  'POST /api/runs/:id/cancel': async (req, res, { id }) => {
    const ok = await runManager.cancel(id)
    res
      .writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ cancelled: ok }))
  },

  'POST /api/runs/:id/resume': async (req, res, { id }) => {
    try {
      let input = {}
      try {
        input = await readBody(req)
      } catch {
        // empty body is fine — resume with no new input
      }
      const run = runManager.resume(id, input)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
    } catch (error) {
      res
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: error.message }))
    }
  },
}

const matchUrl = (method, url) => {
  for (const key of Object.keys(routes)) {
    const [routeMethod, routePath] = key.split(' ')
    if (routeMethod !== method) {
      continue
    }

    const pattern = routePath.replace(/:\w+/g, '([^/]+)')
    const match = url.match(new RegExp(`^${pattern}$`))

    if (match) {
      const paramNames = [...routePath.matchAll(/:(\w+)/g)].map((paramMatch) => paramMatch[1])
      const params = Object.fromEntries(
        paramNames.map((name, index) => {
          return [name, match[index + 1]]
        }),
      )
      return { handler: routes[key], params, key }
    }
  }
  return null
}

const ASSETS_PREFIX = '/api/assets/'

// A dropped/reset connection (the client closed mid-request or mid-response) shows up as
// one of these codes. They carry no server state — the only correct response is to stop
// touching that socket, never to crash. Used by the request catch and the process guards.
const isTransientNetworkError = (err) =>
  !!err &&
  ['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ECANCELED', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'].includes(
    err.code,
  )

const server = http.createServer(async (req, res) => {
  // If the client drops the connection, 'error' fires on the request/response stream;
  // with no listener Node throws it as an uncaught exception and the process dies. A
  // vanished client needs no response — swallow it here for every route.
  req.on('error', () => {})
  res.on('error', () => {})
  // Prod is HTTPS-only: tell the browser to refuse http:// to this origin for a year.
  // setHeader (not writeHead) so it merges into every route's response. TLS itself is
  // terminated by the front proxy; the app is bound to localhost (see server.listen).
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  try {
    await handleRequest(req, res)
  } catch (err) {
    // A handler threw: bad JSON body, a malformed %-escape, an fs error, a write to a
    // socket the client already closed, … Convert it to a response instead of letting it
    // bubble out as an unhandled rejection (which would take the whole server down).
    if (isTransientNetworkError(err)) {
      return // client went away mid-flight — nothing to send, nothing worth logging loudly
    }
    // Client-fault errors get their own status (413 over-size, 400 malformed JSON); only a
    // genuine server fault is a 500 and worth logging loudly.
    const status = err.statusCode || (err instanceof SyntaxError ? 400 : 500)
    if (status >= 500) {
      console.error(`[api] ${req.method} ${req.url} failed:`, err)
    }
    if (!res.headersSent) {
      res
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: status === 500 ? 'internal error' : err.message }))
    } else {
      res.destroy()
    }
  }
})

const handleRequest = async (req, res) => {
  const path = req.url.split('?')[0]
  // Login/logout manage the session cookie — reachable WITHOUT an existing session.
  if (req.method === 'POST' && path === '/api/login') {
    await handleLogin(req, res)
    return
  }
  if (req.method === 'POST' && path === '/api/logout') {
    handleLogout(res)
    return
  }
  // GET /api/session → report auth state WITHOUT gating (always 200, never 401). The SPA
  // asks this once on load to decide app-vs-login, instead of inferring it from a data
  // request's 401. Ungated like login/logout — it reveals only a boolean, not any data.
  if (req.method === 'GET' && path === '/api/session') {
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ authorized: isAuthorized(req) }))
    return
  }
  // Serve the built frontend (frontend/dist) for any non-API GET — no auth (see
  // serveStatic). All /api/* requests fall through to the auth gate below.
  if (req.method === 'GET' && !path.startsWith('/api/')) {
    await serveStatic(res, path)
    return
  }
  // Everything else needs a valid session cookie or bearer (open if API_TOKEN unset).
  if (!isAuthorized(req)) {
    res
      .writeHead(401, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'unauthorized' }))
    return
  }
  // Asset files live under a nested path, which the :param matcher (which stops at
  // '/') can't capture — handle the prefix directly before the route table.
  if (req.method === 'GET' && path.startsWith(ASSETS_PREFIX)) {
    await serveAsset(res, path.slice(ASSETS_PREFIX.length))
    return
  }
  const route = matchUrl(req.method, path)
  if (route) {
    // Node ids index folders on disk — reject a non-numeric `:id` (e.g. `..`) before it
    // reaches a handler. (Run ids are UUIDs, so this guards only the node routes.)
    if (route.key.includes('/api/nodes/:id') && !isNodeId(route.params.id)) {
      res
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'bad node id' }))
      return
    }
    await route.handler(req, res, route.params)
    return
  }
  res.writeHead(404).end('Not found')
}

// A connection that errors before/while we parse the request (abrupt reset, garbage
// bytes) surfaces here, not in the request handler. Reply 400 if the socket can still
// take it, else just drop it — never let it bubble into an uncaught exception.
server.on('clientError', (err, socket) => {
  if (socket.writable && !socket.destroyed) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  } else {
    socket.destroy()
  }
})

// Listen-level faults (e.g. EADDRINUSE) — log instead of an opaque crash.
server.on('error', (err) => {
  console.error('[api] server error:', err)
})

// Last-resort process guards so a dropped connection can NEVER bring the server down.
// Transient socket errors (ECONNRESET/EPIPE/…) carry no state — log quietly and keep
// serving. A genuinely unexpected error is logged loudly; we keep running because nothing
// supervises this process yet (serviceManager spawns it detached + unref'd and does not
// act on autoRestart). Once a supervisor is in place (systemd Restart=on-failure, or
// honoured autoRestart — see plans/prod-security-hardening-plan.txt §10 / production-
// readiness-plan.txt §3.4), switch the non-transient branch to process.exit(1) so a real
// crash restarts with clean state instead of limping on.
process.on('uncaughtException', (err) => {
  if (isTransientNetworkError(err)) {
    console.warn(`[api] ignored transient socket error: ${err.code}`)
    return
  }
  console.error('[api] uncaught exception (kept process alive):', err)
})
process.on('unhandledRejection', (reason) => {
  if (isTransientNetworkError(reason)) {
    console.warn(`[api] ignored transient socket rejection: ${reason.code}`)
    return
  }
  console.error('[api] unhandled rejection (kept process alive):', reason)
})

// Bind to localhost by default so the API is reachable ONLY through the front TLS proxy,
// never directly on a public interface. Override with BIND_HOST=0.0.0.0 for LAN/dev use.
const PORT = process.env.PORT || 3001
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'
server.listen(PORT, BIND_HOST, () => {
  console.log(`API server running on http://${BIND_HOST}:${PORT}`)
})
