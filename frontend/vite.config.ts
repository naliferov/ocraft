import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The backend API server (port 3001) runs as its own managed process now —
// see runtime/services/api.js (`node runtime/cli.js service start api`). Vite only
// proxies /api to it; it no longer spawns the backend itself.
//
// AUTH: the backend gates every /api request on a session cookie. Sign in at /login (email+password,
// or Google when configured); the backend sets an HttpOnly, SameSite=Lax cookie the browser
// auto-attaches (JS never holds anything secret). So the proxy is a plain forward — the cookie
// rides along on same-origin localhost.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // ws: true also forwards the /api/ws websocket-hub upgrade (runtime/wsServer.ts).
      '/api': { target: 'http://localhost:3001', ws: true },
      // Legacy hub path — old script-node bodies still hardcode /ws.
      '/ws': { target: 'http://localhost:3001', ws: true },
    },
  },
})
