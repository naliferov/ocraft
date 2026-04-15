import { execute } from './executor.js'
import { loadSchedulerState, saveSchedulerState } from './storage.js'
import { log } from './lib/log.js'
import { withLock } from './lib/lock.js'

const minutes = m => m * 60 * 1000
const hours = h => h * 60 * 60 * 1000
const match = (schedule, date) => {
  if (schedule.hour !== '*' && schedule.hour !== date.getHours()) return false
  if (schedule.minute !== '*' && schedule.minute !== date.getMinutes()) return false
  return true
}

const isActiveHour = (activeHours, date) => {
  const h = date.getHours()
  return h >= activeHours.from && h < activeHours.to
}

const jobs = [
  {
    id: 'test',
    entry: 'test',
    args: ['argument-of-test-function'],
    intervalMs: minutes(1)
  },
  {
    id: 'send-reminder',
    entry: 'send-reminder',
    args: ['reminder-text'],
    schedule: { hour: '*', minute: 0 }
  },
  //todo: add check mail reminder

  {
    id: 'telegram-send-movement-reminder',
    entry: 'telegram-send-movement-reminder',
    intervalMs: hours(1),
    activeHours: { from: 8, to: 22 }
  }
]

export const runScheduler = () => withLock('scheduler', async () => {
  const state = await loadSchedulerState()
  const now = Date.now()
  const date = new Date(now)

  for (const job of jobs) {
    if (job.activeHours && !isActiveHour(job.activeHours, now)) {
      continue
    }

    if (job.intervalMs) {
      const lastRunAt = state[job.id]?.lastRunAt ?? 0
      if (now - lastRunAt < job.intervalMs) continue
    } else if (job.schedule) {
      if (!match(job.schedule, date)) continue
      const lastRunAt = state[job.id]?.lastRunAt ?? 0
      if (now - lastRunAt < minutes(1)) continue
    }

    log(`[scheduler] running ${job.id}`)
    await execute(job.entry, job.args)

    state[job.id] = { lastRunAt: now }
    await saveSchedulerState(state)
  }
})

