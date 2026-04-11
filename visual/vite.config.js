import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn } from 'node:child_process'
import path from 'node:path'

const backendPlugin = () => {
  let proc

  const start = () => {
    proc?.kill()
    proc = spawn('node', [path.resolve('server.js')], { stdio: 'inherit' })
  }

  return {
    name: 'backend',
    buildStart: start,
    watchChange(id) {
      if (id.endsWith('server.js')) start()
    }
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