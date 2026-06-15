import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)
const ROOT_DIR = path.join(currentDir, '..') // repo root — the cwd the ai-chat agent works in
const NODES_DIR = path.join(currentDir, 'data/nodes')
const ASSETS_DIR = path.join(currentDir, 'data/assets')

// Render prior chat turns as plain context so each ai-chat request carries the
// conversation (the endpoint is stateless; the node stores the history).
const buildChatPrompt = (history, message) => {
  if (!history?.length) return message
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
    .join('\n\n')
  return `Continuing our conversation. History so far:\n\n${transcript}\n\nUser: ${message}`
}

const nodePath = (id) => path.join(NODES_DIR, id, 'state.json')

// Resolve a node's folder under NODES_DIR, rejecting anything that escapes it
// (an `id` of `..` would otherwise let DELETE rm a folder outside the data store).
const nodeDirSafe = (id) => {
  const full = path.resolve(NODES_DIR, id)
  if (full !== NODES_DIR && full.startsWith(NODES_DIR + path.sep)) return full
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
      if (nodeParentId === parentId) children.push(dir)
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

// Send a text/JSON body, gzipped when the client accepts it. The text-heavy reads
// here (the node list, html content bodies, script source) compress ~4-5×; tiny
// bodies skip it (the gzip header overhead isn't worth it). Single-user local dev
// server, so synchronous gzip is fine.
const sendText = (req, res, body, contentType) => {
  const buffer = Buffer.from(body)
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip')
  if (acceptsGzip && buffer.length > 512) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding',
    }).end(zlib.gzipSync(buffer))
  } else {
    res.writeHead(200, { 'Content-Type': contentType }).end(buffer)
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
      })
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
    const spec = await bodySpecOf(id)
    if (!spec) {
      res.writeHead(404).end('Not found')
      return
    }
    try {
      const raw = await fs.readFile(path.join(NODES_DIR, id, spec.file), 'utf-8')
      sendText(req, res, raw, spec.contentType)
    } catch {
      res.writeHead(404).end('Not found')
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

  // Compile an isWasm node's AssemblyScript source (script.js) to wasm on demand.
  // The frontend fetches this, instantiates it, and calls an export. asc is heavy,
  // so it's lazy-imported — the server pays nothing until wasm is requested.
  // Compile errors return 400 + the asc diagnostics so the editor can show them.
  'GET /api/nodes/:id/wasm': async (req, res, { id }) => {
    let source
    try {
      source = await fs.readFile(path.join(NODES_DIR, id, NODE_BODY.script.file), 'utf-8')
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
      res.writeHead(409, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Node has children', children }))
      return
    }
    try {
      await fs.rm(dir, { recursive: true, force: true })
      res.writeHead(200).end('Deleted')
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }))
    }
  },

  // ⚠️ SECURITY: this runs the Claude Agent SDK with permissionMode 'bypassPermissions'
  // and full Read/Write/Edit/Bash tools, cwd = repo root. Anything that can reach
  // this endpoint (localhost:3001 / the Vite proxy) can make Claude edit files and
  // run shell commands on this machine. It's intended for local single-user dev only —
  // do NOT expose this server to a network. Auth is the user's own Claude Code login
  // (Pro/Max subscription via ~/.claude or CLAUDE_CODE_OAUTH_TOKEN); no API key is used.
  'POST /api/ai-chat': async (req, res) => {
    const { message, history = [] } = await readBody(req)
    if (!message || typeof message !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'message (string) required' }))
      return
    }

    const { query } = await import('@anthropic-ai/claude-agent-sdk') // lazy: server boots without loading the SDK
    const prompt = buildChatPrompt(history, message)

    let text = ''
    const toolUses = []
    let result = null
    try {
      for await (const event of query({
        prompt,
        options: { cwd: ROOT_DIR, permissionMode: 'bypassPermissions', maxTurns: 30 },
      })) {
        if (event.type === 'assistant') {
          for (const block of event.message.content) {
            if (block.type === 'text') text += block.text
            else if (block.type === 'tool_use') toolUses.push({ name: block.name, input: block.input })
          }
        } else if (event.type === 'result') {
          result = { subtype: event.subtype, cost: event.total_cost_usd, turns: event.num_turns, sessionId: event.session_id }
        }
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ text: text.trim(), toolUses, result }))
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
