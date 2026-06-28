// store/migrate.js — apply pending SQL migrations from ./migrations/*.sql, in order, each in a
// transaction, tracked in schema_migrations so re-running is a no-op. Run via `cli.js migrate`
// (needs DATABASE_URL). Forward-only — to change schema, add a new numbered file.
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from '../lib/path.js'
import { sql } from '../db.js'

const MIGRATIONS_DIR = path.join(getDirname(import.meta.url), 'migrations')

export const migrate = async () => {
  if (!sql) {
    throw new Error('DATABASE_URL is not set — nothing to migrate against')
  }
  await sql`create table if not exists schema_migrations (
    version text primary key, applied_at timestamptz not null default now()
  )`
  const done = new Set((await sql`select version from schema_migrations`).map((row) => row.version))
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort()

  let applied = 0
  for (const file of files) {
    if (done.has(file)) {
      continue
    }
    const ddl = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf-8')
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl)
      await tx`insert into schema_migrations (version) values (${file})`
    })
    console.log(`applied ${file}`)
    applied++
  }
  console.log(applied ? `migrate: ${applied} applied` : 'migrate: already up to date')
  await sql.end()
}
