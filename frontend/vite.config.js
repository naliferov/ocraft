import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn } from 'node:child_process'
import path from 'node:path'

const backendPlugin = () => {
  let proc

  const start = () => {
    proc?.kill()
    proc = spawn('node', [path.resolve('../backend/server.js')], { stdio: 'inherit' })
  }

  return {
    name: 'backend',
    buildStart: start
  }
}

export default defineConfig({
  plugins: [vue(), backendPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})