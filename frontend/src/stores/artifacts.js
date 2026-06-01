import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useArtifactsStore = defineStore('artifacts', () => {
  const artifacts = ref([])
  const activeArtifactId = ref(null)

  const activeArtifact = computed(() => artifacts.value.find(a => a.id === activeArtifactId.value) ?? null)

  const load = async () => {
    const res = await fetch('/api/artifacts')
    artifacts.value = await res.json()
  }

  const save = async (id, data) => {
    await fetch(`/api/artifacts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  watch(artifacts, (list) => {
    if (list.length > 0 && !activeArtifactId.value) {
      activeArtifactId.value = list[0].id
    }
  })

  return { artifacts, activeArtifactId, activeArtifact, load, save }
})
