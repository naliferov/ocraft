import 'dotenv/config' // load <repo>/.env (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, PORT) — cwd = repo root
import path from 'node:path'
import { getDirname } from './lib/path.js'
import {
  readBody,
  readText,
  sendText,
  matchUrl,
  serveStatic,
  serveAsset,
  createServer,
} from './lib/http.js'
import * as runManager from './runManager.js'
// import * as aiRunner from './runners/ai.js' // DISABLED for prod — see registration below
import * as taskSource from './runners/task.js'
import * as serviceSource from './runners/service.js'
import { attachWsServer } from './wsServer.js'
import * as fileStore from './store/file.js'
import * as pgStore from './store/pg.js'
import {
  authConfigured,
  googleConfigured,
  emailAuthEnabled,
  resolveUser,
  signup,
  login,
  startGoogleLogin,
  handleGoogleCallback,
  logout,
} from './auth.js'

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
const ASSETS_DIR = path.join(currentDir, '..', 'data/assets')
const DIST_DIR = path.join(currentDir, '..', 'frontend/dist') // built Vue SPA — served in prod after `npm run build`

// Pick the node store: Postgres when DATABASE_URL is set (prod / pg-dev), else the file store
// (the local default — your tree on disk). Both implement the same interface (runtime/store/).
const nodeStore = process.env.DATABASE_URL ? pgStore : fileStore

// --- Auth ------------------------------------------------------------------
// Sessions + identity live in runtime/auth.js: email+password by default, Google OAuth optional.
// Every request resolves to a user_id (threaded as req.userId) from a session cookie — there is NO
// dev bypass, so auth needs a DB (users/sessions live in Postgres). Prod (NODE_ENV=production) is
// Google-ONLY: the email+password routes are disabled and it requires Google fully configured,
// failing closed otherwise — a public deploy must have its sign-in provider wired up. (Self-hosting
// email-only? Skip NODE_ENV=production and set COOKIE_SECURE=true for TLS — email works, no Google.)
const IS_PROD = process.env.NODE_ENV === 'production'
if (IS_PROD && !googleConfigured) {
  console.error(
    '❌ FATAL: NODE_ENV=production but Google OAuth is not configured (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL) — refusing to start.',
  )
  process.exit(1)
}
if (!authConfigured) {
  console.warn(
    '⚠️  No DATABASE_URL — auth and the node store are unavailable; set it (see .env.example). Every request will 401.',
  )
}

// Node ids are numeric folder names; reject anything else so a `:id` can't smuggle a
// `..` into a filesystem path. (The /api/assets route has its own traversal guard.)
const isNodeId = (id) => /^[0-9]+$/.test(id)

// Content types for static assets (GET /api/assets/<relpath>) — clipart SVGs etc. for the
// scene renderer. Passed to lib/http serveAsset, which does the read + traversal guard.
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

// Node CRUD goes through nodeStore (file-backed today; Postgres + per-user isolation later —
// see plans/multi-user-postgres-oauth-plan.txt). Handlers thread req.userId: unset in
// single-user mode (the file store ignores it), populated from the session once OAuth lands.
const routes = {
  'GET /api/nodes': async (req, res) => {
    sendText(req, res, JSON.stringify(await nodeStore.listNodes(req.userId)), 'application/json')
  },

  'GET /api/nodes/:id': async (req, res, { id }) => {
    const node = await nodeStore.getNode(req.userId, id)
    if (!node) {
      res.writeHead(404).end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(node))
  },

  // A node's body sidecar — a script node's script.js, an html node's content.html. The store
  // resolves which file + content-type from the node's type. An existing node with no body yet
  // returns an empty 200 (not a 404) so the editor loads cleanly; a missing node is a 404.
  'GET /api/nodes/:id/body': async (req, res, { id }) => {
    const body = await nodeStore.getBody(req.userId, id)
    if (!body) {
      res.writeHead(404).end('Not found')
      return
    }
    // Binary bodies (image/audio/video/…) go out as raw bytes under their MIME; text bodies
    // (html/script) keep the gzip-aware text path.
    if (body.binary) {
      res
        .writeHead(200, { 'Content-Type': body.contentType, 'Content-Length': body.content.length })
        .end(body.content)
      return
    }
    sendText(req, res, body.content, body.contentType)
  },

  'POST /api/nodes/:id/body': async (req, res, { id }) => {
    const result = await nodeStore.saveBody(req.userId, id, await readText(req))
    if (result.error) {
      res.writeHead(400).end('Node type has no body')
      return
    }
    res.writeHead(200).end('Saved')
  },

  'POST /api/nodes/:id': async (req, res, { id }) => {
    await nodeStore.saveNode(req.userId, id, await readBody(req))
    res.writeHead(200).end('Saved')
  },

  // Create a node with a server-minted id (the body carries no id — that's what distinguishes
  // this from the upsert above). Returns the new node incl. its id.
  'POST /api/nodes': async (req, res) => {
    const node = await nodeStore.createNode(req.userId, await readBody(req))
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(node))
  },

  // Delete a node. The store refuses with has-children if it still has children (no silent
  // orphaning — reparent/delete them first), and forbidden if the id escapes the data store.
  'DELETE /api/nodes/:id': async (req, res, { id }) => {
    const result = await nodeStore.deleteNode(req.userId, id)
    if (result.error === 'forbidden') {
      res.writeHead(403).end('Forbidden')
      return
    }
    if (result.error === 'has-children') {
      res
        .writeHead(409, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Node has children', children: result.children }))
      return
    }
    res.writeHead(200).end('Deleted')
  },

  // --- Universal RUN manager — one view over everything that runs (see ./runManager.js) ---
  // GET /api/runs lists AI runs (owned/ephemeral) + service daemons + task executions
  // as one uniform record set. POST starts on-demand 'ai' runs (task/service are
  // observe-only here). ⚠️ The 'ai' runner runs Claude with bypassPermissions —
  // single-user / trusted only — never expose this server to a network without sandboxing.
  // 'POST /api/runs': async (req, res) => {
  //   try {
  //     const { kind, input = {} } = await readBody(req)
  //     if (!kind) {
  //       throw new Error('kind (string) required')
  //     }
  //     const run = runManager.start(kind, input)
  //     res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
  //   } catch (error) {
  //     res
  //       .writeHead(400, { 'Content-Type': 'application/json' })
  //       .end(JSON.stringify({ error: error.message }))
  //   }
  // },

  // 'GET /api/runs': async (req, res) => {
  //   const kind = new URL(req.url, 'http://localhost').searchParams.get('kind') || undefined
  //   res
  //     .writeHead(200, { 'Content-Type': 'application/json' })
  //     .end(JSON.stringify(await runManager.list(kind)))
  // },

  // 'GET /api/runs/:id': async (req, res, { id }) => {
  //   const run = await runManager.get(id)
  //   if (!run) {
  //     res
  //       .writeHead(404, { 'Content-Type': 'application/json' })
  //       .end(JSON.stringify({ error: 'not found' }))
  //     return
  //   }
  //   res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
  // },

  // // Server-Sent Events: a snapshot, then live deltas until the run ends or the
  // // client disconnects. The handler returns immediately; the socket stays open
  // // (no res.end) and is fed by the controller's listener.
  // 'GET /api/runs/:id/stream': async (req, res, { id }) => {
  //   res.writeHead(200, {
  //     'Content-Type': 'text/event-stream',
  //     'Cache-Control': 'no-cache',
  //     Connection: 'keep-alive',
  //   })
  //   // A client can vanish (ECONNRESET) between heartbeats. Writing to the dropped socket
  //   // emits an 'error' on res that, with no listener, would crash the process — and a
  //   // late write can fire before the 'close' cleanup below runs. Swallow the error event
  //   // and guard every write so a gone client just stops receiving, it never takes us down.
  //   res.on('error', () => {})
  //   const safeWrite = (chunk) => {
  //     if (res.writableEnded || res.destroyed) {
  //       return
  //     }
  //     try {
  //       res.write(chunk)
  //     } catch {
  //       // socket closed under us — the 'close' handler tears down the subscription
  //     }
  //   }
  //   const send = (event) => safeWrite(`data: ${JSON.stringify(event)}\n\n`)
  //   const unsubscribe = runManager.subscribe(id, send)
  //   if (!unsubscribe) {
  //     send({ type: 'error', error: 'not found' })
  //     res.end()
  //     return
  //   }
  //   const heartbeat = setInterval(() => safeWrite(': ping\n\n'), 15000)
  //   req.on('close', () => {
  //     clearInterval(heartbeat)
  //     unsubscribe()
  //   })
  // },

  // 'POST /api/runs/:id/cancel': async (req, res, { id }) => {
  //   const ok = await runManager.cancel(id)
  //   res
  //     .writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' })
  //     .end(JSON.stringify({ cancelled: ok }))
  // },

  // 'POST /api/runs/:id/resume': async (req, res, { id }) => {
  //   try {
  //     let input = {}
  //     try {
  //       input = await readBody(req)
  //     } catch {
  //       // empty body is fine — resume with no new input
  //     }
  //     const run = runManager.resume(id, input)
  //     res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(run))
  //   } catch (error) {
  //     res
  //       .writeHead(400, { 'Content-Type': 'application/json' })
  //       .end(JSON.stringify({ error: error.message }))
  //   }
  // },
}

const ASSETS_PREFIX = '/api/assets/'

const handleRequest = async (req, res) => {
  // Prod is HTTPS-only (TLS terminated by the front proxy / Cloudflare): tell the browser
  // to refuse http:// to this origin for a year. setHeader (not writeHead) so it merges
  // into every route's response below.
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  const path = req.url.split('?')[0]
  // Auth endpoints — reachable WITHOUT a session (that's how you get one). Email+password by
  // default; the Google OAuth dance is optional (only wired to a button when googleConfigured).
  if (req.method === 'POST' && path === '/api/auth/signup') {
    await signup(req, res)
    return
  }
  if (req.method === 'POST' && path === '/api/auth/login') {
    await login(req, res)
    return
  }
  if (req.method === 'GET' && path === '/api/auth/google') {
    startGoogleLogin(req, res)
    return
  }
  if (req.method === 'GET' && path === '/api/auth/google/callback') {
    await handleGoogleCallback(req, res)
    return
  }
  // Serve the built frontend (frontend/dist) for any non-API GET — no auth (see serveStatic).
  if (req.method === 'GET' && !path.startsWith('/api/')) {
    await serveStatic(res, {
      dir: DIST_DIR,
      urlPath: path,
      contentTypes: STATIC_CONTENT_TYPES,
      notBuiltMessage: 'Frontend not built — run `npm run build` in frontend/',
    })
    return
  }
  // Who's calling? The session cookie's user, or null. Threaded into every node handler as
  // req.userId (the per-user isolation in store/pg.js keys off it).
  req.userId = await resolveUser(req)
  // Logout clears the session — reachable even with an expired one.
  if (req.method === 'POST' && path === '/api/logout') {
    await logout(req, res)
    return
  }
  // GET /api/session → the SPA asks once on load to decide app-vs-login. Ungated; reveals only
  // booleans. googleConfigured tells it whether to show the "Sign in with Google" button.
  if (req.method === 'GET' && path === '/api/session') {
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ authorized: Boolean(req.userId), googleConfigured, emailAuthEnabled }))
    return
  }
  // Everything else needs a signed-in user.
  if (!req.userId) {
    res
      .writeHead(401, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'unauthorized' }))
    return
  }
  // Asset files live under a nested path, which the :param matcher (which stops at
  // '/') can't capture — handle the prefix directly before the route table.
  if (req.method === 'GET' && path.startsWith(ASSETS_PREFIX)) {
    await serveAsset(res, {
      dir: ASSETS_DIR,
      relPath: path.slice(ASSETS_PREFIX.length),
      contentTypes: ASSET_CONTENT_TYPES,
    })
    return
  }
  const route = matchUrl(routes, req.method, path)
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

// Build the hardened HTTP server (per-request error guards, dispatch try/catch with
// 413/400/500 mapping, and uncaught/unhandledRejection process guards — all in lib/http)
// around our request handler, attach the WS exchange on /ws, then bind. Bound to localhost
// by default so the API is reachable ONLY through the front TLS proxy / Cloudflare; override
// with BIND_HOST=0.0.0.0 for LAN/dev use.
const server = createServer(handleRequest)
attachWsServer(server, { resolveUser })

const PORT = process.env.PORT || 3001
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'
server.listen(PORT, BIND_HOST, () => {
  console.log(`API server running on http://${BIND_HOST}:${PORT}`)
})
