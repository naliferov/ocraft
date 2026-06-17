#!/usr/bin/env node
// Build (once) and run Claude Code in Docker, YOLO mode, with the ocraft repo
// mounted. Run: npm run yolo  (or: node claude-yolo.js)
//
// Auth: the FIRST run drops you into Claude's normal browser login. Because the
// container's home (/home/node) is kept in a persistent named volume
// (ocraft-claude-home), that login is saved and reused on every later run — so
// you only log in once. (CLAUDE_CODE_OAUTH_TOKEN from setup-token is for
// *non-interactive* `claude -p`/CI use; it does NOT skip the interactive login,
// so it's optional here and only forwarded if you've set it.)
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const IMAGE = 'claude-yolo'
const HOME_VOLUME = 'ocraft-claude-home' // persists login + Claude config across runs
// This script sits at the repo root, so its own directory is what we mount into
// the container and where .env lives.
const repoDir = path.dirname(fileURLToPath(import.meta.url))

// Optionally pull CLAUDE_CODE_OAUTH_TOKEN from the repo-root .env (for non-interactive
// use). An exported env var wins. .env is gitignored. Missing token is fine.
const loadTokenFromEnvFile = () => {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return
  let contents
  try {
    contents = readFileSync(path.join(repoDir, '.env'), 'utf-8')
  } catch {
    return
  }
  for (const line of contents.split('\n')) {
    const match = /^\s*CLAUDE_CODE_OAUTH_TOKEN\s*=\s*(.*)$/.exec(line)
    if (match) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = match[1].trim().replace(/^["']|["']$/g, '')
      return
    }
  }
}
loadTokenFromEnvFile()

// The image definition (inline so this script is self-contained). Runs as the
// non-root `node` user — --dangerously-skip-permissions refuses to run as root.
const dockerfile = [
  'FROM node:22',
  'RUN npm install -g @anthropic-ai/claude-code',
  'USER node',
  'WORKDIR /workspace',
  'ENTRYPOINT ["claude", "--dangerously-skip-permissions"]',
  '',
].join('\n')

const docker = (args, options = {}) => spawnSync('docker', args, options)

// Build the image only if it isn't there yet (stdin Dockerfile = no build context).
const imageExists = docker(['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
if (!imageExists) {
  console.log(`-> building image '${IMAGE}' (one-time, ~30s)...`)
  const build = docker(['build', '-t', IMAGE, '-'], {
    input: dockerfile,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (build.status !== 0) {
    console.error('x docker build failed')
    process.exit(build.status ?? 1)
  }
}

// Persistent home keeps your login between runs; mount the repo as the workspace.
const dockerArgs = [
  'run',
  '-it',
  '--rm',
  '-v',
  `${HOME_VOLUME}:/home/node`,
  '-v',
  `${repoDir}:/workspace`,
]
// Forward the token only if present (helps non-interactive use; harmless otherwise).
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) dockerArgs.push('-e', 'CLAUDE_CODE_OAUTH_TOKEN')
dockerArgs.push(IMAGE)

console.log(`-> launching Claude Code (YOLO) in ${repoDir} ...`)
console.log('   (first run: log in once in the browser — it is saved for next time)')
const run = docker(dockerArgs, { stdio: 'inherit' })
process.exit(run.status ?? 0)
