import path from 'node:path'
import { getTime } from './lib/time.js'
import { saveExecution, loadEntryState, saveEntryState } from './storage.js'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)

export const execute = async (name, args = []) => {

  const entryPath = path.join(currentDir, 'entries', `${name}.js`)

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
    env: process.env,
    state: {
      load: () => loadEntryState(name),
      save: (state) => saveEntryState(name, state)
    },
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
    ctx.log(`error: ${err.message}`)
  }

  const finishedAt = new Date().toISOString()
  const execution = { entry: name, startedAt, finishedAt, status, result, logs, error }
  
  await saveExecution(execution)

  return execution
}
