import 'dotenv/config' // load <repo>/.env (PORT, BIN_REGISTRY_DIR) — cwd = repo root
import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { getDirname } from './lib/path.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readBody, matchUrl, serveStatic, createServer, type Handler } from './lib/http.ts'
import { attachWsServer } from './wsServer.ts'

const IS_PROD = process.env.NODE_ENV === 'production'
const currentDir = getDirname(import.meta.url) // runtime/
const DIST_DIR = path.join(currentDir, '..', 'frontend/dist') // built Vue SPA — served in prod after `npm run build`

// --- Binary registry (local-only) --------------------------------------------
// BIN_REGISTRY_DIR points at a directory of media files served by bare name on
// GET /api/bin/:name (vlang's `i<alias>` resolves here — `igos` → gos.jpg).
// Unset (prod) = the route is never registered. Lookup compares :name against the
// directory listing, so nothing from the request ever touches the filesystem.
const BIN_DIR = process.env.BIN_REGISTRY_DIR
const BIN_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
}

// --- Frontend (built Vue SPA) -------------------------------------------------
// In prod this same process serves frontend/dist (built by `npm run build`) for every non-/api GET,
// so the app + API share one origin. Served without auth — the offline app has no login. In dev
// this path is unused: Vite serves the SPA and proxies /api here.
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

const routes: Record<string, Handler> = {
  // Serve a registry file by bare name (extension resolved from the dir listing). Dev-only via BIN_DIR.
  ...(BIN_DIR && {
    'GET /api/bin/:name': async (req, res, { name }) => {
      const entries = await fs.readdir(BIN_DIR)
      const match = entries.find((entry) => path.parse(entry).name === name)
      if (!match) {
        res.writeHead(404).end('Not found')
        return
      }
      const content = await fs.readFile(path.join(BIN_DIR, match))
      const mime = BIN_MIME[path.extname(match).toLowerCase()] ?? 'application/octet-stream'
      // Range support — <video> stalls without it (Chrome needs 206es to buffer/seek).
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
      if (range) {
        const start = range[1] ? Number(range[1]) : 0
        const end = range[2] ? Number(range[2]) : content.length - 1
        res
          .writeHead(206, {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${content.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
          })
          .end(content.subarray(start, end + 1))
        return
      }
      res
        .writeHead(200, {
          'Content-Type': mime,
          'Content-Length': content.length,
          'Accept-Ranges': 'bytes',
        })
        .end(content)
    },
  }),

  // Minimal LLM endpoint for the harness script — DEV ONLY (never registered in prod; no auth, must
  // not ship to a networked box). One headless `claude -p` turn using this machine's Claude Code
  // login. `--tools ""` keeps it a pure text call. Stateless: no --resume, every call fresh — the
  // caller sends whatever context it wants in the prompt. Returns { text, usage, cost, model }.
  ...(!IS_PROD && {
    'POST /api/claude': async (req, res) => {
      const { prompt, system, model, effort } = await readBody(req)
      const args = [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--tools',
        '',
        '--exclude-dynamic-system-prompt-sections',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ]
      if (system) {
        args.push('--system-prompt', system)
      }
      if (model) {
        args.push('--model', model)
      }
      if (effort) {
        args.push('--effort', effort)
      }
      const claudeBin = path.join(homedir(), '.local/bin/claude')
      const stdout = await new Promise<string>((resolve, reject) => {
        const options = { cwd: tmpdir(), timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }
        execFile(claudeBin, args, options, (error, out, errOut) =>
          error ? reject(new Error(errOut || error.message)) : resolve(out),
        )
      })
      const result = JSON.parse(stdout)
      // The CLI reports the model(s) it actually ran under modelUsage (keyed by model id).
      const usedModel = Object.keys(result.modelUsage ?? {}).join(', ') || undefined
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          text: result.result,
          usage: result.usage,
          cost: result.total_cost_usd,
          model: usedModel,
        }),
      )
    },
  }),
}

const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
  // Prod is HTTPS-only (TLS terminated by Cloudflare): tell the browser to refuse http:// for a
  // year. setHeader (not writeHead) so it merges into every route's response below.
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  const path = req.url.split('?')[0]
  // Serve the built frontend (frontend/dist) for any non-API GET.
  if (req.method === 'GET' && !path.startsWith('/api/')) {
    await serveStatic(res, {
      dir: DIST_DIR,
      urlPath: path,
      contentTypes: STATIC_CONTENT_TYPES,
      notBuiltMessage: 'Frontend not built — run `npm run build` in frontend/',
    })
    return
  }
  const route = matchUrl(routes, req.method, path)
  if (route) {
    await route.handler(req, res, route.params)
    return
  }
  res.writeHead(404).end('Not found')
}

// Build the hardened HTTP server (per-request error guards, dispatch try/catch with 413/400/500
// mapping, and process guards — all in lib/http) around our handler, attach the WS exchange, then
// bind. Localhost by default so the API is reachable ONLY through the front TLS proxy / Cloudflare;
// override with BIND_HOST=0.0.0.0 for LAN/dev use.
const server = createServer(handleRequest)
attachWsServer(server) // token-gated (room token on connect)

const PORT = Number(process.env.PORT) || 3001
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1'
server.listen(PORT, BIND_HOST, () => {
  console.log(`API server running on http://${BIND_HOST}:${PORT}`)
})
