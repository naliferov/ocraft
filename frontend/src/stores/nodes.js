import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref([])
  const activeNodeId = ref(null)

  const activeNode = computed(() => nodes.value.find(n => n.id === activeNodeId.value) ?? null)

  // Build the nesting hierarchy from each node's `parentId`. Identity stays the
  // flat `id`; the tree (and any path derived from it) is computed, never stored.
  const tree = computed(() => {
    const byId = new Map(nodes.value.map(n => [n.id, { ...n, children: [] }]))
    const roots = []
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return roots
  })

  const childrenOf = (id) => nodes.value.filter(n => n.parentId === id)

  // Path from the root as a `/`-joined chain of ids — the derived namespace.
  const pathOf = (id) => {
    const byId = new Map(nodes.value.map(n => [n.id, n]))
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
      body: JSON.stringify(body)
    })
  }

  // Flip a node's `collapsed` flag and persist it. Mutating the real node in
  // `nodes` (not the tree copy) reactively recomputes `tree`, so the sidebar
  // updates instantly; the save just makes the choice survive reloads.
  const toggleCollapsed = async (id) => {
    const node = nodes.value.find(n => n.id === id)
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

  return { nodes, activeNodeId, activeNode, tree, childrenOf, pathOf, load, save, toggleCollapsed }
})
