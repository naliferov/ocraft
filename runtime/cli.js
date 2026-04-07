import 'dotenv/config'

const [command, ...args] = process.argv.slice(2)

const commands = {
  'run': async () => {
    const [name, ...fnArgs] = args
    if (!name) {
      console.error('Usage: node cli.js run <function-name> [args...]')
      process.exit(1)
    }
    const { execute } = await import('./functions/executor.js')
    const execution = await execute(name, fnArgs)
    console.log(`\nStatus: ${execution.status}`)
  },
}

const exec = commands[command]
if (!exec) {
  console.error('Usage: node cli.js <command> [args...]')
  console.error('Commands: run <function-name>')
  process.exit(1)
}

exec()
