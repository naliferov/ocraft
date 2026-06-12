import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)
const NODES_DIR = path.join(currentDir, 'data/nodes')
const ASSETS_DIR = path.join(currentDir, 'data/assets')

const nodePath = (id) => path.join(NODES_DIR, id, 'state.json')

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

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

const readText = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

const routes = {
  'GET /api/nodes': async (req, res) => {
    const dirs = await fs.readdir(NODES_DIR)
    const nodes = await Promise.all(
      dirs.map(async (id) => {
        const raw = await fs.readFile(nodePath(id), 'utf-8')
        const { id: _id, ...data } = JSON.parse(raw)
        return { id, ...data }
      })
    )
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(nodes))
  },

  'GET /api/nodes/:id': async (req, res, { id }) => {
    try {
      const raw = await fs.readFile(nodePath(id), 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(raw)
    } catch {
      res.writeHead(404).end('Not found')
    }
  },

  'GET /api/nodes/:id/script': async (req, res, { id }) => {
    try {
      const scriptPath = path.join(NODES_DIR, id, 'script.js')
      const raw = await fs.readFile(scriptPath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(raw)
    } catch {
      res.writeHead(404).end('Not found')
    }
  },

  'POST /api/nodes/:id/script': async (req, res, { id }) => {
    const code = await readText(req)
    const scriptPath = path.join(NODES_DIR, id, 'script.js')
    await fs.writeFile(scriptPath, code)
    res.writeHead(200).end('Saved')
  },

  // Compile an isWasm node's AssemblyScript source (script.js) to wasm on demand.
  // The frontend fetches this, instantiates it, and calls an export. asc is heavy,
  // so it's lazy-imported — the server pays nothing until wasm is requested.
  // Compile errors return 400 + the asc diagnostics so the editor can show them.
  'GET /api/nodes/:id/wasm': async (req, res, { id }) => {
    let source
    try {
      source = await fs.readFile(path.join(NODES_DIR, id, 'script.js'), 'utf-8')
    } catch {
      res.writeHead(404).end('Not found')
      return
    }
    const { default: asc } = await import('assemblyscript/asc')
    const { error, stderr, binary } = await asc.compileString(source, {
      optimizeLevel: 3,
      runtime: 'stub',
    })
    if (error || !binary) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end(stderr?.toString() || String(error))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/wasm' }).end(Buffer.from(binary))
  },

  'POST /api/nodes/:id': async (req, res, { id }) => {
    const body = await readBody(req)
    const dir = path.join(NODES_DIR, id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(nodePath(id), JSON.stringify(body, null, 2))
    res.writeHead(200).end('Saved')
  },
}

const matchUrl = (method, url) => {
  for (const key of Object.keys(routes)) {
    const [routeMethod, routePath] = key.split(' ')
    if (routeMethod !== method) continue
    
    const pattern = routePath.replace(/:\w+/g, '([^/]+)')
    const m = url.match(new RegExp(`^${pattern}$`))

    if (m) {
      const paramNames = [...routePath.matchAll(/:(\w+)/g)].map(x => x[1])
      const params = Object.fromEntries(paramNames.map((name, i) => {
        return [name, m[i + 1]]
      }))
      return { handler: routes[key], params }
    }
  }
  return null
}

const ASSETS_PREFIX = '/api/assets/'

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  // Asset files live under a nested path, which the :param matcher (which stops at
  // '/') can't capture — handle the prefix directly before the route table.
  if (req.method === 'GET' && path.startsWith(ASSETS_PREFIX)) {
    await serveAsset(res, path.slice(ASSETS_PREFIX.length))
    return
  }
  const route = matchUrl(req.method, path)
  if (route) {
    await route.handler(req, res, route.params)
    return
  }
  res.writeHead(404).end('Not found')
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
