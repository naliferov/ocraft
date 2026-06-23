// Generic on-demand RUN controller (kernel-side; depends on nothing in runtime/).
//
// A "run" is an API-initiated, tracked, observable job — started via POST /api/runs,
// watched via GET /api/runs[/:id][/stream], stopped via .../cancel, continued via
// .../resume. It is deliberately a THIRD process kind, distinct from:
//   - runtime/tasks  (scheduled / finite, hard-timeout, fired by the scheduler)
//   - services       (permanent daemons under serviceManager)
// Only the lifecycle (start → running → done|error|cancelled, list/status/stream/
// cancel) is generic here; what actually runs is supplied by a pluggable RUNNER
// registered per `kind` (see kernel/runners/ai.js). Input is opaque to the
// controller — it just hands it to the runner.
//
// Runs live in-memory in the api-server process: a restart loses live runs (a
// runner's underlying session may persist on disk and be resumable, but the
// in-process loop is gone). Durable cross-restart runs would need a separate
// worker — see the Roadmap.

import crypto from 'node:crypto'

const RUNS = new Map() // runId -> record
const RECENT_CAP = 100 // keep memory bounded: drop oldest FINISHED runs past this

// kind -> runner. A runner is { start(input, hooks) -> handle }, where handle may
// expose cancel(). hooks: { onSession, onText, onTool, onLog, onResult, onDone, onError }.
const runners = new Map()
export const registerRunner = (kind, runner) => runners.set(kind, runner)

// Trimmed view for the list endpoint — full text/log would bloat it.
const summary = (run) => ({
  id: run.id,
  kind: run.kind,
  label: run.label,
  status: run.status,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  sessionId: run.sessionId,
  cost: run.cost,
  turns: run.turns,
  tools: run.toolUses.map((tool) => tool.name),
  textTail: run.text.slice(-280),
})

// Full view for GET /:id and the SSE snapshot.
const full = (run) => ({ ...summary(run), text: run.text, toolUses: run.toolUses, log: run.log })

const emit = (run, event) => {
  for (const send of run.listeners) {
    try {
      send(event)
    } catch {
      // a dead listener (closed SSE) — dropped on its own 'close' handler
    }
  }
}

const append = (run, msg) => {
  const line = { time: new Date().toISOString(), msg }
  run.log.push(line)
  emit(run, { type: 'log', line })
}

const finish = (run, status) => {
  if (run.status !== 'running') {
    return
  } // first terminal transition wins
  run.status = status
  run.finishedAt = new Date().toISOString()
  emit(run, { type: 'done', status })
  emit(run, { type: 'end' })
  run.listeners.clear()
}

export const start = (kind, input = {}) => {
  const runner = runners.get(kind)
  if (!runner) {
    throw new Error(`unknown run kind "${kind}"`)
  }

  const id = crypto.randomUUID()
  const run = {
    id,
    kind,
    label: input.label || kind,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    sessionId: null,
    cost: null,
    turns: null,
    text: '',
    toolUses: [],
    error: null,
    log: [],
    listeners: new Set(),
    handle: null,
    input,
  }
  RUNS.set(id, run)
  trim()

  const hooks = {
    onSession: (sessionId) => {
      run.sessionId = sessionId
      append(run, `session ${sessionId}`)
      emit(run, { type: 'session', sessionId })
    },
    onText: (delta) => {
      run.text += delta
      emit(run, { type: 'text', delta })
    },
    onTool: (tool) => {
      run.toolUses.push(tool)
      append(run, `tool: ${tool.name}`)
    },
    onLog: (msg) => append(run, msg),
    onResult: (result) => {
      if (result.cost != null) {
        run.cost = result.cost
      }
      if (result.turns != null) {
        run.turns = result.turns
      }
      if (result.sessionId) {
        run.sessionId = result.sessionId
      }
      if (result.text && !run.text) {
        run.text = result.text
      } // fallback if no streamed deltas
    },
    onDone: () => finish(run, 'done'),
    onError: (err) => {
      run.error = err?.message || String(err)
      append(run, `error: ${run.error}`)
      finish(run, 'error')
    },
  }

  try {
    run.handle = runner.start(input, hooks)
  } catch (err) {
    hooks.onError(err)
  }
  return summary(run)
}

export const list = (kind) => {
  const all = [...RUNS.values()]
  const picked = kind ? all.filter((run) => run.kind === kind) : all
  return picked.map(summary).sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export const get = (id) => {
  const run = RUNS.get(id)
  return run ? full(run) : null
}

export const cancel = (id) => {
  const run = RUNS.get(id)
  if (!run) {
    return false
  }
  if (run.status === 'running') {
    try {
      run.handle?.cancel?.()
    } catch {
      // runner cancel is best-effort
    }
    append(run, 'cancel requested')
    finish(run, 'cancelled')
  }
  return true
}

// Resume = start a NEW run that continues a prior one (runner-specific: the AI
// runner passes input.resume as the SDK session to resume). Requires the prior run
// to have a sessionId.
export const resume = (id, input = {}) => {
  const prev = RUNS.get(id)
  if (!prev) {
    throw new Error('run not found')
  }
  if (!prev.sessionId) {
    throw new Error(`run "${id}" has no session to resume`)
  }
  return start(prev.kind, {
    ...input,
    resume: prev.sessionId,
    label: input.label || `${prev.label} (resumed)`,
  })
}

// SSE: send a snapshot, then stream live events until the run ends or the client
// disconnects. Returns an unsubscribe fn, or null if the run is unknown.
export const subscribe = (id, send) => {
  const run = RUNS.get(id)
  if (!run) {
    return null
  }
  send({ type: 'snapshot', run: full(run) })
  if (run.status !== 'running') {
    send({ type: 'end' })
    return () => {}
  }
  run.listeners.add(send)
  return () => run.listeners.delete(send)
}

const trim = () => {
  if (RUNS.size <= RECENT_CAP) {
    return
  }
  const finished = [...RUNS.values()]
    .filter((run) => run.status !== 'running')
    .sort((left, right) => (left.finishedAt || '').localeCompare(right.finishedAt || ''))
  while (RUNS.size > RECENT_CAP && finished.length) {
    RUNS.delete(finished.shift().id)
  }
}
