import { execute } from './executor.js'
import { loadSchedulerState, saveSchedulerState } from './storage.js'
import { log } from './lib/log.js'
import { withLock } from './lib/lock.js'

const hours = h => h * 60 * 60 * 1000

const jobs = [
  {
    id: 'test',
    entry: 'test',
    args: ['superawesome'],
    intervalMs: hours(1)
  }
]

export const runScheduler = () => withLock('scheduler', async () => {
  const state = await loadSchedulerState()
  const now = Date.now()

  for (const job of jobs) {
    const lastRunAt = state[job.id]?.lastRunAt ?? 0
    if (now - lastRunAt < job.intervalMs) continue

    log(`[scheduler] running ${job.id}`)
    await execute(job.entry, job.args)

    state[job.id] = { lastRunAt: now }
    await saveSchedulerState(state)
  }
})

