import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The backend API server (port 3001) runs as its own managed process now —
// see runtime/services/api.js (`node runtime/cli.js service start api`). Vite only
// proxies /api to it; it no longer spawns the backend itself.
//
// AUTH: the backend requires a bearer token (API_TOKEN in <repo>/.env) on every
// request. The browser supplies it — entered once at /login, stored in localStorage,
// and attached to every /api call by the global fetch wrapper (src/lib/apiAuth.js).
// So the proxy is a plain forward; the token isn't baked into the build.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
