import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The backend API server (port 3001) runs as its own managed process now —
// see backend/procs/backend.js (`node cli.js proc start backend`). Vite only
// proxies /api to it; it no longer spawns the backend itself. (The old
// backendPlugin spawned it once and never respawned, so a single backend death
// took /api down for the whole session.)
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
