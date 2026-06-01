import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)
const NODES_DIR = path.join(currentDir, 'data/nodes')

const nodePath = (id) => path.join(NODES_DIR, id, 'state.json')

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

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  const route = matchUrl(req.method, path)
  if (route) {
    await route.handler(req, res, route.params)
    return
  }
  res.writeHead(404).end('Not found')
})

server.listen(3001, () => {
  console.log('API server running on port 3001')
})
