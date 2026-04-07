import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTime } from './lib/time.js'
//import { saveExecution } from './storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const execute = async (name, args = []) => {
  const entryPath = path.join(__dirname, 'entries', `${name}.js`)

  let mod
  try {
    mod = await import(entryPath)
  } catch {
    throw new Error(`Entry "${name}" not found`)
  }

  const fn = mod.run
  if (typeof fn !== 'function') {
    throw new Error(`Entry "${name}" must export a run function`)
  }

  const logs = []
  const ctx = {
    args,
    log: (msg) => {
      const entry = { time: getTime(), msg }
      logs.push(entry)
      console.log(`[${entry.time}] ${msg}`)
    },
    lib: {
      time: {
        now: getTime,
      },
      path: {
        resolve: (...parts) => path.resolve(...parts),
      },
    },
  }

  const startedAt = new Date().toISOString()
  let result, status = 'success', error

  try {
    result = await fn(ctx)
  } catch (err) {
    status = 'error'
    error = err.message
    console.error(err)
  }

  const finishedAt = new Date().toISOString()

  const execution = { name, startedAt, finishedAt, status, result, logs, error }
  //await saveExecution(execution)

  return execution
}
