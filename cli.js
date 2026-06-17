import 'dotenv/config'
import { execute } from './backend/executor.js'
import { listExecutions } from './backend/storage.js'
import { runScheduler } from './backend/scheduler.js'
import {
  listProcs,
  getProc,
  startProc,
  stopProc,
  restartProc,
  readLog,
  clearLog,
} from './backend/procManager.js'

const [command, ...args] = process.argv.slice(2)

//check deploy

const commands = {
  run: async () => {
    const [name, ...fnArgs] = args
    if (!name) {
      console.error('Usage: node cli.js run <function-name> [args...]')
      process.exit(1)
    }

    const execution = await execute(name, fnArgs)
    console.log(`\nStatus: ${execution.status}`)
  },
  'start-scheduler': async () => {
    await runScheduler()
  },
  'list-executions': async () => {
    const executions = await listExecutions()
    if (executions.length === 0) {
      console.log('No executions yet')
      return
    }
    for (const execution of executions) {
      const d = new Date(execution.timestamp)
      const pad = (n) => String(n).padStart(2, '0')
      const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      console.log(`${date}  ${execution.name}  (${execution.id})`)
    }
  },
  proc: async () => {
    const [sub, id, ...rest] = args
    const fmt = (s) => {
      const dot = s.running ? '●' : '○'
      const pid = s.pid ? `pid ${s.pid}` : ''
      const up = s.uptimeMs != null ? `(${Math.round(s.uptimeMs / 1000)}s)` : ''
      const err = s.error ? `— ${s.error}` : ''
      return `${dot} ${s.id.padEnd(16)} ${s.status.padEnd(8)} ${pid} ${up} ${err}`.trimEnd()
    }
    const requireId = (usage) => {
      if (!id) {
        console.error(usage)
        process.exit(1)
      }
    }

    try {
      switch (sub) {
        case undefined:
        case 'list': {
          const all = await listProcs()
          if (all.length === 0) {
            console.log('No procs configured')
            return
          }
          for (const s of all) console.log(fmt(s))
          return
        }
        case 'status':
          requireId('Usage: node cli.js proc status <id>')
          console.log(JSON.stringify(await getProc(id), null, 2))
          return
        case 'start':
          requireId('Usage: node cli.js proc start <id>')
          console.log(fmt(await startProc(id)))
          return
        case 'stop':
          requireId('Usage: node cli.js proc stop <id>')
          console.log(fmt(await stopProc(id)))
          return
        case 'restart':
          requireId('Usage: node cli.js proc restart <id>')
          console.log(fmt(await restartProc(id)))
          return
        case 'logs': {
          requireId('Usage: node cli.js proc logs <id> [lines]')
          const lines = rest[0] ? Number(rest[0]) : 200
          console.log(await readLog(id, { lines }))
          return
        }
        case 'clear-logs':
          requireId('Usage: node cli.js proc clear-logs <id>')
          await clearLog(id)
          console.log(`Cleared logs for ${id}`)
          return
        default:
          console.error(`Unknown proc subcommand: ${sub}`)
          console.error('Subcommands: list, status, start, stop, restart, logs, clear-logs')
          process.exit(1)
      }
    } catch (err) {
      console.error(err.message)
      process.exit(1)
    }
  },
}

const exec = commands[command]
if (!exec) {
  console.error('Usage: node cli.js <command> [args...]')
  console.error('Commands:')
  console.error('  run <function-name> [args...]')
  console.error('  start-scheduler')
  console.error('  list-executions')
  console.error('  proc <list|status|start|stop|restart|logs|clear-logs> [id] [lines]')
  process.exit(1)
}

exec()
