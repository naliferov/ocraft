import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The backend API server (port 3001) runs as its own managed process now —
// see runtime/services/backend.js (`node bin/cli.js service start backend`). Vite only
// proxies /api to it; it no longer spawns the backend itself. (The old
// backendPlugin spawned it once and never respawned, so a single backend death
// took /api down for the whole session.)
//
// Build stays on the DEFAULT runtime-only Vue. View script nodes that ship a
// `template` string get the compiler bolted on at runtime, lazily and code-split,
// without changing the app's build — see composables/useScriptView.js.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
