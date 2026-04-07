import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXECUTIONS_DIR = path.join(__dirname, 'executions')

export const saveExecution = async (execution) => {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true })
  const id = `${Date.now()}-${execution.name}`
  const filePath = path.join(EXECUTIONS_DIR, `${id}.json`)
  await fs.writeFile(filePath, JSON.stringify(execution, null, 2))
  return id
}
