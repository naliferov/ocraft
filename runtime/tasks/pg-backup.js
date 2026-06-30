// pg-backup.js — daily Postgres backup, run as an ocraft TASK by the scheduler
// (runtime/scheduler.js jobs[]), NOT a system cron. Reuses the executor's scheduling,
// execution record, ctx logging, and timeout — one automation model. See AGENTS.md.
//
// dump (custom format, via DATABASE_URL over TCP) -> verify archive -> offsite (if a remote
// is configured) -> rotate (drop dumps older than N days) -> log. Throws on failure so the
// execution record = error.
//
// Restore a dump (on the box as root — reads /root, connects over TCP via DATABASE_URL):
//   set -a; . /root/ocraft/.env; set +a
//   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <file.dump>
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// A dump of this DB is ~1s; 5 min is generous headroom (well under the 15 min executor default).
export const timeoutMs = 5 * 60 * 1000

// Run a command to completion; reject on nonzero exit (with stderr). Streams stdout to a file
// when `toFile` is given (so a binary dump never sits in memory), otherwise drains it.
const spawnCommand = (command, args, { env, toFile } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: env ?? process.env })
    let stderr = ''
    let streamDone = !toFile
    let exitedOk = false
    const settle = () => {
      if (streamDone && exitedOk) {
        resolve()
      }
    }
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    if (toFile) {
      const out = createWriteStream(toFile)
      out.on('error', reject)
      out.on('finish', () => {
        streamDone = true
        settle()
      })
      child.stdout.pipe(out)
    } else {
      child.stdout.resume()
    }
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(0, 300)}`))
        return
      }
      exitedOk = true
      settle()
    })
  })

export const run = async (ctx) => {
  const databaseUrl = ctx.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — nothing to back up')
  }
  const url = new URL(databaseUrl)
  const dbName = url.pathname.replace(/^\//, '') || 'ocraft'
  const backupDir = ctx.env.OCRAFT_BACKUP_DIR || path.join(os.homedir(), 'ocraft-backups')
  const keepDays = Number(ctx.env.OCRAFT_BACKUP_KEEP_DAYS) || 30
  const rcloneRemote = ctx.env.OCRAFT_BACKUP_RCLONE_REMOTE || ''

  const pgEnv = { ...ctx.env, PGPASSWORD: decodeURIComponent(url.password) }
  const connArgs = [
    '-h',
    url.hostname,
    '-p',
    url.port || '5432',
    '-U',
    decodeURIComponent(url.username),
    dbName,
  ]

  await fs.mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z'
  const file = path.join(backupDir, `${dbName}-${stamp}.dump`)

  // 1. dump — stream pg_dump's custom-format output straight to disk
  ctx.log(`dumping ${dbName} → ${path.basename(file)}`)
  await spawnCommand('pg_dump', ['-Fc', ...connArgs], { env: pgEnv, toFile: file })
  const { size } = await fs.stat(file)
  if (!size) {
    throw new Error('dump is empty')
  }
  const sizeMb = (size / 1024 / 1024).toFixed(1)

  // 2. verify the archive is well-formed (cheap; a full restore-check is monthly/manual)
  await spawnCommand('pg_restore', ['--list', file])
  ctx.log(`verified archive (${sizeMb} MB)`)

  // 3. offsite — a local-only dump dies with the droplet (disabled until a remote is set)
  if (rcloneRemote) {
    await spawnCommand('rclone', ['copy', file, rcloneRemote])
    ctx.log(`offsite → ${rcloneRemote}`)
  } else {
    ctx.log('offsite disabled (set OCRAFT_BACKUP_RCLONE_REMOTE to enable)')
  }

  // 4. rotate — drop dumps older than `keepDays`. Age by mtime (format-agnostic). Rotation runs
  // only AFTER a fresh dump exists (and never deletes the one just written), so it can never
  // delete its way down to zero backups.
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  const dumps = (await fs.readdir(backupDir)).filter(
    (name) => name.startsWith(`${dbName}-`) && name.endsWith('.dump'),
  )
  let removed = 0
  for (const name of dumps) {
    const dumpPath = path.join(backupDir, name)
    if (dumpPath === file) {
      continue
    }
    const { mtimeMs } = await fs.stat(dumpPath)
    if (mtimeMs < cutoff) {
      await fs.unlink(dumpPath)
      removed += 1
    }
  }
  ctx.log(
    `done — ${sizeMb} MB, kept ${dumps.length - removed}, dropped ${removed} older than ${keepDays}d`,
  )

  return {
    file,
    sizeMb: Number(sizeMb),
    offsite: Boolean(rcloneRemote),
    kept: dumps.length - removed,
    removed,
  }
}
