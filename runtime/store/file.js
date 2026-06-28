// store/file.js — the file-backed node store: today's behavior, lifted out of api.js
// behind the nodeStore interface (see ./index.js). One folder per node under
// data/nodes/<id>/ — state.json (metadata) + an optional body sidecar (script.js /
// content.html) chosen by type.
//
// Every function takes `userId` first, for forward-compatibility with the multi-user pivot
// (Postgres + per-user isolation — see plans/multi-user-postgres-oauth-plan.txt). The FILE
// store IGNORES it: this is the single-owner local store, one tree, so `userId` is meaningless
// here (hence `_userId`). store/pg.js will scope every query by it.
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDirname } from '../lib/path.js'

const currentDir = getDirname(import.meta.url) // runtime/store/
const NODES_DIR = path.join(currentDir, '..', '..', 'data/nodes') // <repo>/data/nodes

const nodePath = (id) => path.join(NODES_DIR, id, 'state.json')

// A node's body lives in a sidecar file (kept out of state.json so the node LIST stays tiny).
// Which file + content-type is decided by node type. Add a type here to give it a body.
const NODE_BODY = {
  script: { file: 'script.js', contentType: 'text/javascript' },
  html: { file: 'content.html', contentType: 'text/html; charset=utf-8' },
}

// Resolve a node's folder under NODES_DIR, rejecting anything that escapes it (an `id` of
// `..` would otherwise let a delete rm a folder outside the data store).
const nodeDirSafe = (id) => {
  const full = path.resolve(NODES_DIR, id)
  return full !== NODES_DIR && full.startsWith(NODES_DIR + path.sep) ? full : null
}

// --- the nodeStore interface (file implementation) ---

export const listNodes = async (_userId) => {
  const dirs = await fs.readdir(NODES_DIR)
  return Promise.all(
    dirs.map(async (id) => {
      const { id: _id, ...data } = JSON.parse(await fs.readFile(nodePath(id), 'utf-8'))
      return { id, ...data }
    }),
  )
}

export const getNode = async (_userId, id) => {
  try {
    return JSON.parse(await fs.readFile(nodePath(id), 'utf-8'))
  } catch {
    return null
  }
}

export const saveNode = async (_userId, id, data) => {
  await fs.mkdir(path.join(NODES_DIR, id), { recursive: true })
  await fs.writeFile(nodePath(id), JSON.stringify(data, null, 2))
}

// Create with a server-minted id — the smallest unused positive integer (folder names are
// numeric strings "1","2",…). Returns the new node incl. its id.
export const createNode = async (_userId, data) => {
  const dirs = await fs.readdir(NODES_DIR)
  const maxId = dirs.reduce((max, dir) => {
    const num = Number(dir)
    return Number.isInteger(num) && num > max ? num : max
  }, 0)
  const id = String(maxId + 1)
  await fs.mkdir(path.join(NODES_DIR, id), { recursive: true })
  await fs.writeFile(nodePath(id), JSON.stringify(data, null, 2))
  return { id, ...data }
}

// Ids of nodes whose parentId is `id` (children block a delete). Reads every node's
// state.json — fine at this scale; the store does the same on load.
export const childrenOf = async (_userId, parentId) => {
  const dirs = await fs.readdir(NODES_DIR)
  const children = []
  for (const dir of dirs) {
    try {
      const { parentId: nodeParentId } = JSON.parse(await fs.readFile(nodePath(dir), 'utf-8'))
      if (nodeParentId === parentId) {
        children.push(dir)
      }
    } catch {
      // skip unreadable / partial node dirs
    }
  }
  return children
}

// Delete a node's folder. Refuses if it still has children (no silent orphaning). Path-guarded.
// Returns {ok:true} | {error:'forbidden'} | {error:'has-children', children}.
export const deleteNode = async (userId, id) => {
  const dir = nodeDirSafe(id)
  if (!dir) {
    return { error: 'forbidden' }
  }
  const children = await childrenOf(userId, id)
  if (children.length) {
    return { error: 'has-children', children }
  }
  await fs.rm(dir, { recursive: true, force: true })
  return { ok: true }
}

// A node's body sidecar. getBody returns {content, contentType} for an existing node — empty
// content when the node has no body yet OR its type carries no sidecar — or null if the node
// itself is missing. saveBody writes it, or returns {error:'no-body'} for a bodiless type.
export const getBody = async (userId, id) => {
  const node = await getNode(userId, id)
  if (!node) {
    return null
  }
  const spec = NODE_BODY[node.type] ?? null
  if (!spec) {
    return { content: '', contentType: 'text/plain; charset=utf-8' }
  }
  try {
    const content = await fs.readFile(path.join(NODES_DIR, id, spec.file), 'utf-8')
    return { content, contentType: spec.contentType }
  } catch {
    return { content: '', contentType: spec.contentType }
  }
}

export const saveBody = async (userId, id, body) => {
  const node = await getNode(userId, id)
  const spec = node ? (NODE_BODY[node.type] ?? null) : null
  if (!spec) {
    return { error: 'no-body' }
  }
  await fs.writeFile(path.join(NODES_DIR, id, spec.file), body)
  return { ok: true }
}
