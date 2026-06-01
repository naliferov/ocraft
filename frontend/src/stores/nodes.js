import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref([])
  const activeNodeId = ref(null)

  const activeNode = computed(() => nodes.value.find(n => n.id === activeNodeId.value) ?? null)

  const load = async () => {
    const res = await fetch('/api/nodes')
    nodes.value = await res.json()
  }

  const save = async (id, data) => {
    await fetch(`/api/nodes/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  watch(nodes, (list) => {
    if (list.length > 0 && !activeNodeId.value) {
      activeNodeId.value = list[0].id
    }
  })

  return { nodes, activeNodeId, activeNode, load, save }
})
