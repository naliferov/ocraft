import { createSupervisor } from './src/supervisor/supervisor.js'
import { getProcessList } from './src/supervisor/utils.js'
import { analyzeProject } from './src/tasks/analyze-project.js'

const [command, ...args] = process.argv.slice(2)

const commands = {
  'start-supervisor': async () => {
      const supervisor = createSupervisor()
      await supervisor.start()
  },
  'list-procs': async () => {
    const processList = await getProcessList()
    for (const pid in processList) {
      const command = processList[pid].command
      if (command.includes('service-manager/src/services')) {
        console.log(command)
      }
    }
  },
  'analyze-project': async () => {
    const projectPath = args[0]

    console.log('analyze project')
    //await analyzeProject(projectPath)
  },
}

const exec = commands[command]
if (!exec) {
  console.error('Usage: node cli.js <command> [args...]')
  console.error('Commands: start-worker-manager')
  process.exit(1)
}

exec(...args)
