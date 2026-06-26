// SOURCE adapter for the universal run manager (../runManager.js): surfaces taskExecutor
// executions (runtime/state/taskExecutions/) as read-only runs of kind 'task'. Tasks are
// started by the scheduler or the CLI (`node runtime/cli.js run <task>`), NOT over HTTP
// — this adapter only AGGREGATES their recorded state into the unified GET /api/runs
// view. (taskExecutor writes a 'running' record at start and overwrites it on
// completion, so in-flight tasks show up too.)
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from '../lib/path.js'

const TASK_EXECUTIONS_DIR = path.join(getDirname(import.meta.url), '..', 'state', 'taskExecutions')
const RECENT = 25 // how many most-recent executions to surface

const STATUS = { success: 'done', error: 'error', running: 'running' }

const toRecord = (execution) => ({
  id: execution.id,
  kind: 'task',
  label: execution.task ?? execution.name ?? execution.id,
  status: STATUS[execution.status] ?? execution.status ?? 'done',
  startedAt: execution.startedAt ?? null,
  finishedAt: execution.finishedAt ?? null,
  meta: { durationMs: execution.durationMs ?? null, error: execution.error ?? null },
})

export const list = async () => {
  let files
  try {
    files = await fs.readdir(TASK_EXECUTIONS_DIR)
  } catch {
    return [] // no executions yet
  }
  const recent = files
    .filter((file) => file.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, RECENT)
  const records = await Promise.all(
    recent.map(async (file) => {
      try {
        return toRecord(JSON.parse(await fs.readFile(path.join(TASK_EXECUTIONS_DIR, file), 'utf-8')))
      } catch {
        return null
      }
    }),
  )
  return records.filter(Boolean)
}

export const get = async (id) => {
  try {
    const execution = JSON.parse(await fs.readFile(path.join(TASK_EXECUTIONS_DIR, `${id}.json`), 'utf-8'))
    return { ...toRecord(execution), log: execution.logs ?? [], result: execution.result ?? null }
  } catch {
    return null // not a task-execution id
  }
}
