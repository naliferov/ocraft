// store/import-files.js — one-off: copy the file node store (data/nodes/*) into Postgres under an
// EXISTING user (pass an email or id; users are never deleted, so no throwaway placeholder owner).
// TWO passes (insert all nodes, THEN set parents) so the parent_id FK is never violated by import
// order. Idempotent-ish (on conflict do nothing). Run via `cli.js import-nodes <email|id>`.
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from '../lib/path.js'
import { sql } from '../db.js'

const NODES_DIR = path.join(getDirname(import.meta.url), '..', '..', 'data/nodes')
const NODE_BODY = {
  script: { file: 'script.js', contentType: 'text/javascript' },
  html: { file: 'content.html', contentType: 'text/html; charset=utf-8' },
}

// Resolve which EXISTING user to attach the imported nodes to. Pass an email or numeric id; with
// neither, use the sole user when there's exactly one. Never creates a placeholder — users aren't
// deleted, so a throwaway owner would just be permanent junk.
const resolveOwner = async (target) => {
  if (target) {
    const [user] = /^\d+$/.test(String(target))
      ? await sql`select id from users where id = ${Number(target)}`
      : await sql`select id from users where email = ${String(target).toLowerCase()}`
    if (!user) {
      throw new Error(`no user matching "${target}" — sign in first, then import`)
    }
    return user.id
  }
  const users = await sql`select id from users`
  if (!users.length) {
    throw new Error('no users yet — sign in first, then import')
  }
  if (users.length > 1) {
    throw new Error('multiple users — pass the target: import-nodes <email|id>')
  }
  return users[0].id
}

export const importFiles = async (target) => {
  if (!sql) {
    throw new Error('DATABASE_URL is not set — nothing to import into')
  }
  const ownerId = await resolveOwner(target)

  const dirs = (await fs.readdir(NODES_DIR))
    .filter((dir) => /^[0-9]+$/.test(dir))
    .sort((left, right) => Number(left) - Number(right))

  const parsed = []
  for (const id of dirs) {
    try {
      const state = JSON.parse(await fs.readFile(path.join(NODES_DIR, id, 'state.json'), 'utf-8'))
      parsed.push({ id, state })
    } catch {
      // skip unreadable / partial node dirs
    }
  }

  // Pass 1 — insert every node WITHOUT a parent, so pass 2's parent_id FK always resolves.
  for (const { id, state } of parsed) {
    const { id: _id, name = 'new node', type = 'html', parentId: _parentId, ...rest } = state
    await sql`
      insert into nodes (id, user_id, type, name, data)
      values (${Number(id)}, ${ownerId}, ${type}, ${name}, ${sql.json(rest)})
      on conflict (id) do nothing`
  }

  // Pass 2 — set parents now that every node exists.
  for (const { id, state } of parsed) {
    if (state.parentId != null) {
      await sql`update nodes set parent_id = ${Number(state.parentId)}
                where id = ${Number(id)} and user_id = ${ownerId}`
    }
  }

  // Bodies (html content.html / script script.js).
  let bodies = 0
  for (const { id, state } of parsed) {
    const spec = NODE_BODY[state.type]
    if (!spec) {
      continue
    }
    try {
      const content = await fs.readFile(path.join(NODES_DIR, id, spec.file), 'utf-8')
      await sql`
        insert into node_bodies (node_id, content, content_type)
        values (${Number(id)}, ${Buffer.from(content)}, ${spec.contentType})
        on conflict (node_id) do nothing`
      bodies++
    } catch {
      // node has no body file yet — fine
    }
  }

  // Keep the bigserial sequence ahead of the imported explicit ids (so new createNode won't collide).
  await sql`select setval('nodes_id_seq', (select max(id) from nodes))`
  console.log(`import: ${parsed.length} nodes, ${bodies} bodies → user ${ownerId}`)
  await sql.end()
}
