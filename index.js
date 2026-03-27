import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { getDirname } from './utils.js'
import mime from 'mime-types'

const currentDir = getDirname(import.meta.url)

const server = http.createServer(async(req, res) => {
  const url = req.url
  
  if (url === '/') {
    const html = await fs.readFile(`${currentDir}/index.html`, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(html)
    return
  }
  if (url === '/save') {
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
  }
  
  let file
  const fPath = `${currentDir}${url}`
  try { file = await fs.readFile(fPath) } catch {}
  
  if (file) {
    const type = mime.lookup(fPath) || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type }).end(file)
  } else {
    res.writeHead(404).end('Not found')
  }
})

server.listen(80, () => {
  console.log('Server running on 80 port')
})