import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { getDirname } from './utils.js'
import mime from 'mime-types'

const currentDir = getDirname(import.meta.url)


const resolveFile = async (url) => {
  let file
  const fPath = `${currentDir}${url}`
  try { 
    file = await fs.readFile(fPath)
  } catch {}

  return file
}

const map = {
  '/': async (req,res) => {
    const html = await fs.readFile(`${currentDir}/index.html`, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(html)
    return
  },
  '/save': async (req, res) => {
    const authHeader = req.headers['authorization'] || ''
    const incomingToken = authHeader.replace('Bearer ', '').trim()

    const tokenPath = path.join(currentDir, '../token')
    const fileToken = (await fs.readFile(tokenPath, 'utf8')).trim()

    if (!incomingToken || incomingToken !== fileToken) {
      res.writeHead(401).end('Unauthorized')
      return
    }

    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    await fs.writeFile(`${currentDir}/index.html`, body, 'utf8')
    
    res.writeHead(200).end('Saved')
    return
  },
}

const server = http.createServer(async(req, res) => {
  const url = req.url
  
  const handler = map[url]
  if (handler) {
    await handler(req, res)
    return
  }

  const file = await resolveFile(url)
  if (file) {
    const type = mime.lookup(url) || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type }).end(file)
    return
  }

  res.writeHead(404).end('Not found')
  return
})

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on 80 port')
})