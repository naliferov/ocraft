import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { writeFile } from 'node:fs/promises'
import { resolve, sep, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Dev-only writer for the in-app doc editor: POST /__save-doc?name=<doc> writes the body to
// docs/<doc>.html. apply:'serve' keeps it out of the static build (which stays read-only); the
// name is confined to docs/ so a crafted name can't escape the folder.
const docsDir = resolve(fileURLToPath(new URL('./docs', import.meta.url)))
const saveDoc = (): Plugin => ({
  name: 'ocraft-save-doc',
  apply: 'serve',
  // A doc file is a dep of App.vue via import.meta.glob, so its change hot-updates the whole
  // component and the UI blinks. Instead, push the new content over a custom event (the client
  // patches just the open doc) and return [] to cancel the default re-render.
  async handleHotUpdate({ file, read, server }) {
    if (!file.startsWith(docsDir + sep)) return
    const html = await read()
    server.ws.send({
      type: 'custom',
      event: 'ocraft:doc',
      data: { name: basename(file, '.html'), html },
    })
    return []
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/__save-doc')) return next()
      const name = new URL(req.url, 'http://localhost').searchParams.get('name') ?? ''
      const file = resolve(docsDir, `${name}.html`)
      if (!name || name.includes('/') || name.includes('\\') || !file.startsWith(docsDir + sep)) {
        res.statusCode = 400
        res.end('bad doc name')
        return
      }
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        await writeFile(file, body)
        res.setHeader('content-type', 'application/json')
        res.end('{"ok":true}')
      })
    })
  },
})

// Scripts are .vue files under ./scripts, compiled by Vite and discovered via import.meta.glob in
// App.vue — no runtime engine. Devlab itself is offline; the /api and /ws proxies below exist only
// for the handful of ported scripts that talk to a LIVE ocraft api service (harness → /api/claude,
// refactory loading vlang sources by node id, the ws testers → the /ws hub). With the api service
// down those scripts degrade to their own error handling; everything else runs fully offline.
export default defineConfig({
  // solid handles only .jsx/.tsx (Solid scripts); vue handles .vue — no overlap.
  plugins: [vue(), solid({ extensions: ['.jsx', '.tsx'] }), tailwindcss(), saveDoc()],
  server: {
    proxy: {
      // ws: true also forwards the /api/ws websocket upgrade (the hub lives under /api now)
      '/api': { target: 'http://localhost:3001', ws: true },
    },
  },
})
