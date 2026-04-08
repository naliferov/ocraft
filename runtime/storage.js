import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXECUTIONS_DIR = path.join(__dirname, 'executions')
const MAX_EXECUTIONS = 1000

export const saveExecution = async (execution) => {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true })
  const id = `${Date.now()}-${execution.name}`
  const filePath = path.join(EXECUTIONS_DIR, `${id}.json`)
  await fs.writeFile(filePath, JSON.stringify(execution, null, 2))
  await rotateExecutions()
  return id
}

const rotateExecutions = async () => {
  const files = (await fs.readdir(EXECUTIONS_DIR)).sort()
  const excess = files.length - MAX_EXECUTIONS
  if (excess > 0) {
    for (const f of files.slice(0, excess)) {
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
      const [timestamp, ...nameParts] = f.replace('.json', '').split('-')
      return { id: f.replace('.json', ''), name: nameParts.join('-'), timestamp: Number(timestamp) }
    })
}

const SCHEDULER_STATE_FILE = path.join(__dirname, 'scheduler-state.json')

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