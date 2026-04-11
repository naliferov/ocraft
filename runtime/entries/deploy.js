import { execSync } from 'node:child_process'
import { waitForUnlock } from '../lib/lock.js'

export const run = async (ctx) => {
  ctx.log('waiting for scheduler lock...')
  await waitForUnlock('scheduler')

  ctx.log('running git pull...')
  const output = execSync('git pull', { encoding: 'utf-8' })
  ctx.log(output.trim())
}
