import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)
const EXECUTIONS_DIR = path.join(currentDir, 'executions')
const MAX_EXECUTIONS = 500

export const saveExecution = async (execution) => {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true })
  const filePath = path.join(EXECUTIONS_DIR, `${execution.id}.json`)
  await fs.writeFile(filePath, JSON.stringify(execution, null, 2))
  await rotateExecutions()
  return execution.id
}

const rotateExecutions = async () => {
  const files = (await fs.readdir(EXECUTIONS_DIR)).sort()
  if (files.length > MAX_EXECUTIONS) {
    for (const f of files.slice(0, files.length - MAX_EXECUTIONS)) {
      await fs.unlink(path.join(EXECUTIONS_DIR, f))
    }
  }
}

export const listExecutions = async () => {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true })
  const files = await fs.readdir(EXECUTIONS_DIR)

  return files
    .sort()
    .reverse()
    .map(f => {
      const base = f.replace('.json', '')
      const dateStr = base.slice(0, 19).replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3')
      const name = base.slice(20)
      return { id: base, name, timestamp: new Date(dateStr).getTime() }
    })
}

const STATE_DIR = path.join(currentDir, 'state')
const SCHEDULER_STATE_FILE = path.join(STATE_DIR, 'scheduler.json')
const entryStatePath = (name) => path.join(STATE_DIR, 'entries', `${name}.json`)

export const loadSchedulerState = async () => {
  try {
    const raw = await fs.readFile(SCHEDULER_STATE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export const saveSchedulerState = async (state) => {
  await fs.mkdir(path.dirname(SCHEDULER_STATE_FILE), { recursive: true })
  await fs.writeFile(SCHEDULER_STATE_FILE, JSON.stringify(state, null, 2))
}

export const loadEntryState = async (name) => {
  try {
    const raw = await fs.readFile(entryStatePath(name), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export const saveEntryState = async (name, state) => {
  const file = entryStatePath(name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(state, null, 2))
}