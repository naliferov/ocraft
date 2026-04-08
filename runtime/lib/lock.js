import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCKS_DIR = path.join(__dirname, '..')

const lockPath = name => path.join(LOCKS_DIR, `${name}.lock`)

const POLL_MS = 500

export const waitForUnlock = async (name) => {
  const file = lockPath(name)
  while (true) {
    try {
      await fs.access(file)
      await new Promise(r => setTimeout(r, POLL_MS))
    } catch {
      break
    }
  }
}

export const withLock = async (name, fn) => {
  const file = lockPath(name)

  await waitForUnlock(name)
  await fs.writeFile(file, String(process.pid))
  
  try {
    return await fn()
  } finally {
    await fs.unlink(file).catch(() => {})
  }
}
