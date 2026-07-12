import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { writeFile, readdir } from 'node:fs/promises'
import { resolve, sep, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Dev-only writer for the in-app doc editor: POST /__save-doc?name=<doc>&ext=<html|md> writes the
// body to docs/<doc>.<ext>. apply:'serve' keeps it out of the static build (which stays read-only);
// the name is confined to docs/ so a crafted name can't escape the folder. Docs come in two source
// formats — .html fragments and .md — and both flow through the same edit/save path.
const docsDir = resolve(fileURLToPath(new URL('./docs', import.meta.url)))
const docFormatOf = (file: string) =>
  file.endsWith('.md') ? 'md' : file.endsWith('.html') ? 'html' : null
const saveDoc = (): Plugin => ({
  name: 'ocraft-save-doc',
  apply: 'serve',
  // A doc file is a dep of App.vue via import.meta.glob, so its change hot-updates the whole
  // component and the UI blinks. Instead, push the raw source over a custom event (the client
  // patches just the open doc, compiling md as needed) and return [] to cancel the default re-render.
  async handleHotUpdate({ file, read, server }) {
    const format = docFormatOf(file)
    if (!file.startsWith(docsDir + sep) || !format) return
    const source = await read()
    server.ws.send({
      type: 'custom',
      event: 'ocraft:doc',
      data: { name: basename(file, `.${format}`), source, format },
    })
    return []
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/__save-doc')) return next()
      const params = new URL(req.url, 'http://localhost').searchParams
      const name = params.get('name') ?? ''
      const ext = params.get('ext') === 'md' ? 'md' : 'html'
      const file = resolve(docsDir, `${name}.${ext}`)
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

// Bins (public/bins/*) are static files served as-is — Vite copies public/ verbatim and does NOT
// index it, so unlike docs/scripts they can't be found by import.meta.glob. Instead of a hand-kept
// manifest, this plugin BUILDS the manifest from the folder: served dynamically at /bins/manifest.json
// in dev, and written into the output at build. Drop a file in public/bins and it just appears; type
// is inferred from the extension (mirrors AssetView.vue's branches).
const binsSrc = resolve(fileURLToPath(new URL('./public/bins', import.meta.url)))
const binTypeOf = (file: string) => {
  const name = file.toLowerCase()
  if (name.endsWith('.txt.gz') || name.endsWith('.txt.gzip')) return 'gz-text'
  if (/\.(txt|md|csv|log|json)$/.test(name)) return 'txt'
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)) return 'image'
  if (/\.(opus|mp3|ogg|wav|m4a|flac|aac)$/.test(name)) return 'audio'
  if (/\.(mp4|webm|mov|mkv)$/.test(name)) return 'video'
  return 'file' // AssetView falls through to a download link
}
const binNameOf = (file: string) =>
  file
    .replace(/\.(gz|gzip)$/i, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
const buildBinManifest = async (dir: string) => {
  const files = (await readdir(dir).catch(() => []))
    .filter((f) => f !== 'manifest.json' && !f.startsWith('.'))
    .sort()
  return files.map((file) => ({ name: binNameOf(file), file, type: binTypeOf(file) }))
}
const bins = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'ocraft-bins-manifest',
    configResolved(config) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== '/bins/manifest.json') return next()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(await buildBinManifest(binsSrc)))
      })
    },
    // public/ (incl. bins/) is copied to outDir during build; write the generated manifest alongside.
    async closeBundle() {
      const manifest = await buildBinManifest(resolve(outDir, 'bins'))
      await writeFile(resolve(outDir, 'bins/manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    },
  }
}

// Scripts are .vue files under ./scripts, compiled by Vite and discovered via import.meta.glob in
// App.vue — no runtime engine. Devlab itself is offline; the /api and /ws proxies below exist only
// for the handful of ported scripts that talk to a LIVE ocraft api service (harness → /api/claude,
// refactory loading vlang sources by node id, the ws testers → the /ws hub). With the api service
// down those scripts degrade to their own error handling; everything else runs fully offline.
export default defineConfig({
  // solid handles only .jsx/.tsx (Solid scripts); vue handles .vue — no overlap.
  plugins: [vue(), solid({ extensions: ['.jsx', '.tsx'] }), tailwindcss(), saveDoc(), bins()],
  server: {
    proxy: {
      // ws: true also forwards the /api/ws websocket upgrade (the hub lives under /api now)
      '/api': { target: 'http://localhost:3001', ws: true },
    },
  },
})
