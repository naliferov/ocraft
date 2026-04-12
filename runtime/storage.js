import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from './lib/path.js'

const currentDir = getDirname(import.meta.url)
const EXECUTIONS_DIR = path.join(currentDir, 'executions')
const MAX_EXECUTIONS = 500

export const saveExecution = async (execution) => {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true })
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const id = `${date}-${execution.name}`
  const filePath = path.join(EXECUTIONS_DIR, `${id}.json`)
  await fs.writeFile(filePath, JSON.stringify(execution, null, 2))
  await rotateExecutions()
  return id
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

const SCHEDULER_STATE_FILE = path.join(currentDir, 'scheduler-state.json')

export const loadSchedulerState = async () => {
  try {
    const raw = await fs.readFile(SCHEDULER_STATE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export const saveSchedulerState = async (state) => {
  await fs.writeFile(SCHEDULER_STATE_FILE, JSON.stringify(state, null, 2))
}