// store/pg.js — Postgres-backed node store, same interface as ./file.js. EVERY query is scoped by
// user_id — the multi-user isolation invariant. The node's promoted columns (type/name/parent_id)
// + a `data` jsonb (everything else) are merged back into the flat node shape the frontend uses.
// req.userId comes from the session (runtime/auth.js); the API gate guarantees it before handlers.
// See plans/multi-user-postgres-oauth-plan.txt.
import { sql } from '../db.ts'

const toBigint = (value) => (value == null ? null : Number(value))

// DB row → the flat node the frontend uses ({ id, name, type, parentId?, ...extras }). parentId
// is omitted for roots (matches the file store, where root state.json has no parentId).
const toNode = (row) => ({
  id: String(row.id),
  name: row.name,
  type: row.type,
  ...(row.parent_id == null ? {} : { parentId: String(row.parent_id) }),
  ...row.data,
})

// Flat node → promoted columns + the `data` jsonb (everything that isn't a column).
const split = (node) => {
  const { id: _id, name, type, parentId, ...rest } = node
  return { name: name ?? 'new node', type: type ?? 'html', parentId, data: rest }
}

// html/script/text carry a text body sidecar; content-type by type. (binary will store its own mime.)
const BODY_CONTENT_TYPE = {
  script: 'text/javascript',
  html: 'text/html; charset=utf-8',
  text: 'text/plain; charset=utf-8',
}

export const listNodes = async (userId) => {
  const rows = await sql`
    select id, parent_id, type, name, data from nodes where user_id = ${userId} order by id`
  return rows.map(toNode)
}

export const getNode = async (userId, id) => {
  const [row] = await sql`
    select id, parent_id, type, name, data from nodes where user_id = ${userId} and id = ${id}`
  if (!row) {
    return null
  }
  const { id: _id, ...node } = toNode(row) // match file.getNode: the flat node WITHOUT id
  return node
}

export const saveNode = async (userId, id, data) => {
  const { name, type, parentId, data: extra } = split(data)
  await sql`
    insert into nodes (id, user_id, parent_id, type, name, data, updated_at)
    values (${id}, ${userId}, ${toBigint(parentId)}, ${type}, ${name}, ${sql.json(extra)}, now())
    on conflict (id) do update set
      parent_id = excluded.parent_id, type = excluded.type, name = excluded.name,
      data = excluded.data, updated_at = now()
    where nodes.user_id = ${userId}`
}

export const createNode = async (userId, data) => {
  const { name, type, parentId, data: extra } = split(data)
  const [row] = await sql`
    insert into nodes (user_id, parent_id, type, name, data)
    values (${userId}, ${toBigint(parentId)}, ${type}, ${name}, ${sql.json(extra)})
    returning id`
  return { id: String(row.id), ...data }
}

export const childrenOf = async (userId, parentId) => {
  const rows = await sql`
    select id from nodes where user_id = ${userId} and parent_id = ${toBigint(parentId)}`
  return rows.map((row) => String(row.id))
}

export const deleteNode = async (userId, id) => {
  const children = await childrenOf(userId, id)
  if (children.length) {
    return { error: 'has-children', children }
  }
  await sql`delete from nodes where user_id = ${userId} and id = ${id}`
  return { ok: true }
}

export const getBody = async (userId, id) => {
  const [row] = await sql`
    select n.type, b.content, b.content_type
    from nodes n left join node_bodies b on b.node_id = n.id
    where n.user_id = ${userId} and n.id = ${id}`
  if (!row) {
    return null
  }
  // Binary nodes: serve the raw bytes under their own stored MIME (image/audio/video/svg/…),
  // flagged so the API sends them raw instead of through the UTF-8/gzip text path.
  if (row.type === 'binary') {
    return {
      content: row.content ?? Buffer.alloc(0),
      contentType: row.content_type ?? 'application/octet-stream',
      binary: true,
    }
  }
  const contentType = row.content_type ?? BODY_CONTENT_TYPE[row.type]
  if (!contentType) {
    return { content: '', contentType: 'text/plain; charset=utf-8' } // type carries no body
  }
  return { content: row.content ? row.content.toString('utf-8') : '', contentType }
}

export const saveBody = async (userId, id, body) => {
  const [node] = await sql`select type from nodes where user_id = ${userId} and id = ${id}`
  const contentType = node ? BODY_CONTENT_TYPE[node.type] : null
  if (!contentType) {
    return { error: 'no-body' }
  }
  await sql`
    insert into node_bodies (node_id, content, content_type, updated_at)
    values (${id}, ${Buffer.from(body)}, ${contentType}, now())
    on conflict (node_id) do update set
      content = excluded.content, content_type = excluded.content_type, updated_at = now()`
  return { ok: true }
}
