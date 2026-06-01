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
    time: {
      now: getTime,
    },
  }

  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const id = `${startedAt.replace(/[:.]/g, '-').slice(0, 19)}-${name}`
  let result, status = 'success', error

  await saveExecution({ id, entry: name, startedAt, status: 'running', logs })

  try {
    result = await fn(ctx)
  } catch (err) {
    status = 'error'
    error = err.message
    ctx.log(`error: ${err.message}`)
  }

  const finishedAt = new Date().toISOString()
  const durationMs = Date.now() - startedMs
  const execution = { id, entry: name, startedAt, finishedAt, durationMs, status, result, logs, error }
  
  await saveExecution(execution)

  return execution
}
