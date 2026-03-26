import http from 'http'
import fs from 'fs/promises'
import { getDirname } from '../../supervisor/utils.js'
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

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})