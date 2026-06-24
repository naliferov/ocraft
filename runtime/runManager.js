// Universal RUN manager — one interface over everything that runs on the server.
//
// "Run" is the generalized unit of execution. Each KIND is an adapter registered
// via registerRunner(kind, adapter). Two adapter shapes:
//
//   • OWNED (ephemeral) — adapter.start(input, hooks) -> handle{ cancel() }. The
//     manager owns the record, streams events via hooks, and cancels it. The work
//     may still be an OS process (the 'ai' kind's Agent SDK spawns the claude CLI;
//     cancel() -> the SDK SIGKILLs it). Lives in-memory; lost on restart. e.g. 'ai'.
//
//   • SOURCE (external) — adapter.list() / get(id) [ / stop(id) ]. The thing is
//     started & persisted elsewhere; the manager only AGGREGATES its live state into
//     the unified view. e.g. 'service' (serviceManager daemons, durable) and 'task'
//     (taskExecutor executions). Started via CLI/scheduler, observed here.
//
// So GET /api/runs is ONE list across services + AI runs + task executions, with a
// uniform record + status/stream/cancel. (Folding the engines together fully is a
// later phase — see plans/unified-run-interface-plan.txt.)

import crypto from 'node:crypto'

const RUNS = new Map() // runId -> record
const RECENT_CAP = 100 // keep memory bounded: drop oldest FINISHED runs past this

// kind -> adapter. OWNED adapter: { start(input, hooks) -> handle{cancel()} } (hooks:
// onSession/onText/onTool/onLog/onResult/onDone/onError). SOURCE adapter:
// { list() -> [record], get(id) -> record|null, stop?(id) -> bool }.
const runners = new Map()
export const registerRunner = (kind, adapter) => runners.set(kind, adapter)

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
  if (typeof runner.start !== 'function') {
    throw new Error(`run kind "${kind}" is observe-only — it's started elsewhere (CLI / scheduler)`)
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

// Unified list: in-memory OWNED runs + every SOURCE adapter's live records. async,
// since sources read disk (executions, service state). A flaky source is skipped.
export const list = async (kind) => {
  const owned = [...RUNS.values()].filter((run) => !kind || run.kind === kind).map(summary)
  const external = []
  for (const [sourceKind, adapter] of runners) {
    if ((kind && sourceKind !== kind) || typeof adapter.list !== 'function') {
      continue
    }
    try {
      external.push(...(await adapter.list()))
    } catch {
      // a flaky source shouldn't break the whole list
    }
  }
  return [...owned, ...external].sort((left, right) =>
    (right.startedAt || '').localeCompare(left.startedAt || ''),
  )
}

export const get = async (id) => {
  const run = RUNS.get(id)
  if (run) {
    return full(run)
  }
  for (const adapter of runners.values()) {
    if (typeof adapter.get !== 'function') {
      continue
    }
    try {
      const record = await adapter.get(id)
      if (record) {
        return record
      }
    } catch {
      // ignore a source that can't resolve this id
    }
  }
  return null
}

export const cancel = async (id) => {
  const run = RUNS.get(id)
  if (run) {
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
  // a SOURCE kind that supports stop (none in v1 — service/task stay CLI-controlled)
  for (const adapter of runners.values()) {
    if (typeof adapter.stop !== 'function') {
      continue
    }
    try {
      if (await adapter.stop(id)) {
        return true
      }
    } catch {
      // best-effort
    }
  }
  return false
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
