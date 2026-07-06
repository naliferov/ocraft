import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Scripts are .vue files under ./scripts, compiled by Vite and discovered via import.meta.glob in
// App.vue — no runtime engine. Devlab itself is offline; the /api and /ws proxies below exist only
// for the handful of ported scripts that talk to a LIVE ocraft api service (harness → /api/claude,
// refactory loading vlang sources by node id, the ws testers → the /ws hub). With the api service
// down those scripts degrade to their own error handling; everything else runs fully offline.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      // ws: true also forwards the /api/ws websocket upgrade (the hub lives under /api now)
      '/api': { target: 'http://localhost:3001', ws: true },
    },
  },
})
