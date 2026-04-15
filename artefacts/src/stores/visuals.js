import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useVisualsStore = defineStore('visuals', () => {
  const visuals = ref([])
  const activeId = ref(null)

  const active = computed(() => visuals.value.find(v => v.id === activeId.value) ?? null)

  const load = async () => {
    const res = await fetch('/api/artefacts')
    visuals.value = await res.json()
  }

  const save = async (id, data) => {
    await fetch(`/api/artefacts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  watch(visuals, (list) => {
    if (list.length > 0 && !activeId.value) {
      activeId.value = list[0].id
    }
  })

  return { visuals, activeId, active, load, save }
})
