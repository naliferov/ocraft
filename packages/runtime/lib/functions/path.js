import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const getDirname = (metaUrl) => {
  return path.dirname(fileURLToPath(metaUrl))
}
