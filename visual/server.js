import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from './utils.js'

const currentDir = getDirname(import.meta.url)
const VISUALS_DIR = path.join(currentDir, 'data/visuals')

const visualPath = (id) => path.join(VISUALS_DIR, id, 'state.json')

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

const routes = {
  'GET /api/visuals': async (req, res) => {
    const dirs = await fs.readdir(VISUALS_DIR)
    const visuals = await Promise.all(
      dirs.map(async (id) => {
        const raw = await fs.readFile(visualPath(id), 'utf-8')
        return { id, ...JSON.parse(raw) }
      })
    )
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(visuals))
  },

  'GET /api/visuals/:id': async (req, res, { id }) => {
    try {
      const raw = await fs.readFile(visualPath(id), 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(raw)
    } catch {
      res.writeHead(404).end('Not found')
    }
  },

  'POST /api/visuals/:id': async (req, res, { id }) => {
    const body = await readBody(req)
    const dir = path.join(VISUALS_DIR, id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(visualPath(id), JSON.stringify(body, null, 2))
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
      const params = Object.fromEntries(paramNames.map((name, i) => [name, m[i + 1]]))
      return { handler: routes[key], params }
    }
  }
  return null
}

const server = http.createServer(async (req, res) => {
  const route = matchUrl(req.method, req.url)
  if (route) {
    await route.handler(req, res, route.params)
    return
  }
  res.writeHead(404).end('Not found')
})

server.listen(3001, () => {
  console.log('API server running on port 3001')
})
