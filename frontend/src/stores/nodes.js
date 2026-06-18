import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// A deleted node's body sidecar (a script node's script.js, an html node's
// content.html — both served by /body) rides along on the pooled node under this
// Symbol key. JSON.stringify skips symbol-keyed props, so it never leaks back into
// state.json when the node is re-saved on restore.
const BODY = Symbol('body')

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref([])
  const activeNodeId = ref(null)
  // Undo pool: node snapshots removed in this session, newest first. A node that
  // had a script.js carries it on the snapshot under the SCRIPT symbol, so `restore`
  // can switch it back into `nodes` whole.
  const deletedNodes = ref([])

  const activeNode = computed(
    () => nodes.value.find((node) => node.id === activeNodeId.value) ?? null,
  )

  // Build the nesting hierarchy from each node's `parentId`. Identity stays the
  // flat `id`; the tree (and any path derived from it) is computed, never stored.
  const tree = computed(() => {
    const byId = new Map(nodes.value.map((node) => [node.id, { ...node, children: [] }]))
    const roots = []
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    // Sort siblings alphabetically by name (instead of fs-readdir / id order).
    // localeCompare handles unicode (Cyrillic) + numbers; case-insensitive.
    const byName = (left, right) =>
      (left.name || '').localeCompare(right.name || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    for (const node of byId.values()) node.children.sort(byName)
    roots.sort(byName)
    return roots
  })

  const childrenOf = (id) => nodes.value.filter((node) => node.parentId === id)

  // Path from the root as a `/`-joined chain of ids — the derived namespace.
  const pathOf = (id) => {
    const byId = new Map(nodes.value.map((node) => [node.id, node]))
    const parts = []
    const seen = new Set()
    let cur = byId.get(id)
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      parts.unshift(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : null
    }
    return parts.join('/')
  }

  const load = async () => {
    const res = await fetch('/api/nodes')
    nodes.value = await res.json()
  }

  const save = async (id, data) => {
    // `id` is derived from the folder name by the server, so keep it out of the
    // stored body — the URL already carries it.
    const { id: _omit, ...body } = data
    await fetch(`/api/nodes/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // Create a node with a server-minted id. `parentId` nests it under a category;
  // omitting `type` makes a plain scene node. Pushes the returned node into
  // `nodes` so `tree` recomputes and the sidebar shows it immediately.
  const create = async ({ type, parentId = null, name = 'new node' } = {}) => {
    const body = { name }
    if (type) body.type = type
    if (parentId) body.parentId = parentId
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const node = await res.json()
    nodes.value.push(node)
    return node
  }

  // Delete a node. The server refuses with 409 if it still has children — surface
  // that as an error so the caller can tell the user instead of silently failing.
  // On success, stash the node's full data (plus its script.js, if any) in the undo
  // pool, drop it locally (tree recomputes), and move selection off it.
  const remove = async (id) => {
    const node = nodes.value.find((candidate) => candidate.id === id)
    // Script/html nodes keep their body in a sidecar file (script.js / content.html,
    // outside state.json), so grab it before deleting — restore needs it to bring the
    // node back whole. /body serves whichever type has one; skip the fetch for types
    // that don't (no needless 404 on scene/category deletes).
    let body = null
    if (node?.type === 'script' || node?.type === 'html') {
      const bodyRes = await fetch(`/api/nodes/${id}/body`)
      if (bodyRes.ok) body = await bodyRes.text()
    }

    const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const { children = [] } = await res.json().catch(() => ({}))
      throw new Error(`Can't delete: node has ${children.length} child node(s)`)
    }
    if (!res.ok) throw new Error('Delete failed')

    if (node) {
      const snapshot = { ...node }
      if (body != null) snapshot[BODY] = body
      deletedNodes.value.unshift(snapshot)
    }
    nodes.value = nodes.value.filter((candidate) => candidate.id !== id)
    if (activeNodeId.value === id) activeNodeId.value = nodes.value[0]?.id ?? null
  }

  // Switch a deleted node back into the store. POST /api/nodes/:id is an upsert, so
  // re-saving recreates the folder at the *same* id (path/identity preserved); a
  // deleted node never had children (delete 409s otherwise), so nothing is orphaned.
  // Restores the body sidecar too (from the BODY symbol), then drops it from the pool.
  const restore = async (id) => {
    const index = deletedNodes.value.findIndex((node) => node.id === id)
    if (index === -1) return null
    const node = deletedNodes.value[index]
    const body = node[BODY]
    await save(id, node) // symbol keys are ignored by JSON.stringify — never hit state.json
    if (body != null) {
      await fetch(`/api/nodes/${id}/body`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
      })
    }
    delete node[BODY]
    nodes.value.push(node)
    deletedNodes.value.splice(index, 1)
    return node
  }

  // Rename in place (mutates `node.name` so the tree updates live) and persist.
  const rename = async (id, name) => {
    const node = nodes.value.find((candidate) => candidate.id === id)
    if (!node) return
    node.name = name
    await save(id, node)
  }

  // Move a node under `parentId` (null/undefined = back to root). Mutating
  // `parentId` recomputes the tree live. Cycle guard: a node can't move into its
  // own subtree — `pathOf(parentId)` is the target's root→target id chain, so if
  // the dragged id appears in it, the target is the node itself or a descendant.
  const reparent = async (id, parentId) => {
    if (id === parentId) return
    const node = nodes.value.find((candidate) => candidate.id === id)
    if (!node) return
    if (parentId && pathOf(parentId).split('/').includes(id)) {
      throw new Error("Can't move a node into its own descendant")
    }
    node.parentId = parentId || undefined
    await save(id, node)
  }

  // Flip a node's `collapsed` flag and persist it. Mutating the real node in
  // `nodes` (not the tree copy) reactively recomputes `tree`, so the sidebar
  // updates instantly; the save just makes the choice survive reloads.
  const toggleCollapsed = async (id) => {
    const node = nodes.value.find((candidate) => candidate.id === id)
    if (!node) return
    node.collapsed = !node.collapsed
    await save(id, node)
  }

  watch(nodes, (list) => {
    if (list.length < 0) {
      activeNodeId.value = null
      return
    }
    if (!activeNodeId.value) {
      activeNodeId.value = list[0].id
    }
  })

  return {
    nodes,
    activeNodeId,
    activeNode,
    deletedNodes,
    tree,
    childrenOf,
    pathOf,
    load,
    save,
    create,
    remove,
    restore,
    rename,
    reparent,
    toggleCollapsed,
  }
})
