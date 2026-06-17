import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { getDirname } from './lib/path.js'
import { getTime } from './lib/time.js'
import { withLock } from './lib/lock.js'

const currentDir = getDirname(import.meta.url)
const ROOT_DIR = path.join(currentDir, '..')
const PROCS_DIR = path.join(currentDir, 'procs') // one config file per proc
const STATE_DIR = path.join(currentDir, 'state/procs') // per-proc runtime state + logs
const MAX_LOG_BYTES = 2 * 1024 * 1024 // rotate the log on start once it exceeds 2MB

const statePath = (id) => path.join(STATE_DIR, `${id}.json`)
const logPath = (id) => path.join(STATE_DIR, `${id}.log`)
const lockName = (id) => `proc-${id}` // one lock per proc, so procs never block each other

// --- config: discovered from the filesystem, like backend/entries -----------

const loadConfig = async (id) => {
  try {
    const mod = await import(path.join(PROCS_DIR, `${id}.js`))
    return { id, ...mod.default }
  } catch {
    return null
  }
}

const listConfigs = async () => {
  let files
  try {
    files = await fsp.readdir(PROCS_DIR)
  } catch {
    return []
  }
  const ids = files.filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3))
  const configs = await Promise.all(ids.map(loadConfig))
  return configs.filter(Boolean)
}

// --- per-proc runtime state, like backend/state/entries/<name>.json ---------

const loadProcState = async (id) => {
  try {
    return JSON.parse(await fsp.readFile(statePath(id), 'utf-8'))
  } catch {
    return {}
  }
}

const saveProcState = async (id, rec) => {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  await fsp.writeFile(statePath(id), JSON.stringify(rec, null, 2))
}

// --- helpers ----------------------------------------------------------------

// `kill(pid, 0)` sends no signal but throws ESRCH if the pid is gone, so it
// doubles as a liveness probe. (Caveat: the OS can recycle a pid after a crash,
// so this can occasionally report a stale pid as alive — acceptable here.)
const isAlive = (pid) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const appendLog = async (id, line) => {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  await fsp.appendFile(logPath(id), `${line}\n`)
}

const rotateIfLarge = async (id) => {
  try {
    const { size } = await fsp.stat(logPath(id))
    if (size > MAX_LOG_BYTES) await fsp.rename(logPath(id), `${logPath(id)}.1`)
  } catch {
    /* no log yet */
  }
}

// Merge a config with its saved state into the live view returned to callers.
const statusOf = (cfg, rec = {}) => {
  const running = isAlive(rec.pid)
  return {
    id: cfg.id,
    cmd: cfg.cmd,
    args: cfg.args ?? [],
    autoRestart: !!cfg.autoRestart,
    running,
    status: running ? 'running' : (rec.status ?? 'stopped'),
    pid: running ? rec.pid : null,
    startedAt: rec.startedAt ?? null,
    stoppedAt: rec.stoppedAt ?? null,
    uptimeMs: running && rec.startedAt ? Date.now() - new Date(rec.startedAt).getTime() : null,
    error: rec.error ?? null,
  }
}

// Best-effort state update from the async 'error' handler (fires after the
// startProc lock has already released, so it takes the lock itself).
const markFailed = (id, message) =>
  withLock(lockName(id), async () => {
    const rec = await loadProcState(id)
    await saveProcState(id, {
      ...rec,
      status: 'failed',
      pid: null,
      error: message,
      stoppedAt: getTime(),
    })
  })

// --- public API -------------------------------------------------------------

export const listProcs = async () => {
  const configs = await listConfigs()
  return Promise.all(configs.map(async (cfg) => statusOf(cfg, await loadProcState(cfg.id))))
}

export const getProc = async (id) => {
  const cfg = await loadConfig(id)
  if (!cfg) throw new Error(`No proc config "${id}"`)
  return statusOf(cfg, await loadProcState(id))
}

export const startProc = (id) =>
  withLock(lockName(id), async () => {
    const cfg = await loadConfig(id)
    if (!cfg) throw new Error(`No proc config "${id}"`)

    const rec = await loadProcState(id)
    if (isAlive(rec.pid)) return statusOf(cfg, rec) // one instance per config

    await fsp.mkdir(STATE_DIR, { recursive: true })
    await rotateIfLarge(id)

    const cwd = cfg.cwd ? path.resolve(ROOT_DIR, cfg.cwd) : ROOT_DIR
    const out = fs.openSync(logPath(id), 'a')
    fs.writeSync(
      out,
      `\n[${getTime()}] --- start: ${cfg.cmd} ${(cfg.args ?? []).join(' ')} (cwd ${cwd}) ---\n`,
    )

    let child
    try {
      child = spawn(cfg.cmd, cfg.args ?? [], {
        cwd,
        env: { ...process.env, ...(cfg.env ?? {}) },
        detached: true, // own process group, so it outlives this process
        stdio: ['ignore', out, out], // write straight to the log fd (survives our exit)
      })
    } finally {
      fs.closeSync(out) // the child kept its own dup of the fd
    }

    // ENOENT (bad cmd) and other spawn faults surface asynchronously here. Without
    // a listener Node rethrows and would crash a long-lived server process.
    child.on('error', (err) => {
      appendLog(id, `[${getTime()}] --- spawn error: ${err.message} ---`).catch(() => {})
      markFailed(id, err.message).catch(() => {})
    })

    if (!child.pid) {
      // synchronous spawn failure
      const failed = { pid: null, status: 'failed', error: 'spawn failed', stoppedAt: getTime() }
      await saveProcState(id, failed)
      return statusOf(cfg, failed)
    }

    child.unref()
    const started = {
      pid: child.pid,
      status: 'running',
      startedAt: getTime(),
      stoppedAt: null,
      error: null,
    }
    await saveProcState(id, started)
    return statusOf(cfg, started)
  })

export const stopProc = (id, { graceMs = 3000 } = {}) =>
  withLock(lockName(id), async () => {
    const cfg = await loadConfig(id)
    if (!cfg) throw new Error(`No proc config "${id}"`)

    const rec = await loadProcState(id)
    const pid = rec.pid

    if (!isAlive(pid)) {
      const stopped = { ...rec, status: 'stopped', pid: null, stoppedAt: getTime() }
      await saveProcState(id, stopped)
      return statusOf(cfg, stopped)
    }

    // Negative pid targets the whole process group (the detached child leads it),
    // so any grandchildren go down too. SIGTERM first, then SIGKILL after grace.
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      /* already gone */
    }

    const deadline = Date.now() + graceMs
    while (Date.now() < deadline && isAlive(pid)) {
      await new Promise((r) => setTimeout(r, 100))
    }

    let signal = 'SIGTERM'
    if (isAlive(pid)) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
      signal = 'SIGKILL'
    }

    await appendLog(id, `[${getTime()}] --- stop (${signal}) ---`)
    const stopped = { ...rec, status: 'stopped', pid: null, stoppedAt: getTime() }
    await saveProcState(id, stopped)
    return statusOf(cfg, stopped)
  })

// Not wrapped in withLock: it composes stop + start, each of which locks on its
// own (withLock is not reentrant, so wrapping would deadlock).
export const restartProc = async (id) => {
  await stopProc(id)
  return startProc(id)
}

export const readLog = async (id, { lines = 200 } = {}) => {
  if (!(await loadConfig(id))) throw new Error(`No proc config "${id}"`)
  try {
    const raw = await fsp.readFile(logPath(id), 'utf-8')
    return raw.split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

export const clearLog = async (id) => {
  if (!(await loadConfig(id))) throw new Error(`No proc config "${id}"`)
  await fsp.writeFile(logPath(id), '')
}
