import 'dotenv/config'
import { execute } from './runtime/executor.js'
import { listExecutions } from './runtime/storage.js'
import { runScheduler } from './runtime/scheduler.js'

const [command, ...args] = process.argv.slice(2)

const commands = {
  'run': async () => {
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
}

const exec = commands[command]
if (!exec) {
  console.error('Usage: node cli.js <command> [args...]')
  console.error('Commands: run <function-name>')
  process.exit(1)
}

exec()
