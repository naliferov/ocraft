<script setup>
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { useArtifactsStore } from './stores/artifacts.js'
import ArtifactItem from './components/ArtifactItem.vue'

const store = useArtifactsStore()
const router = useRouter()
const route = useRoute()

onMounted(() => store.load())

watch(() => store.artifacts, (list) => {

  if (!list.length) return
  if (route.params.id) return

  const firstId = list[0].id
  router.replace(`/artifact/${firstId}`)
})

watch(() => route.params.id, (id) => {
  if (id) store.activeArtifactId = id
}, { immediate: true })

const navigate = (id) => router.push(`/artifact/${id}`)
</script>

<template>
  <n-config-provider>
    <n-layout has-sider content-style="height: 100vh;">
      <n-layout-sider :width="240" bordered content-style="padding: 10px 0 0 10px;">
        <div class="artifact-item"
          v-for="v in store.artifacts"
          :key="v.id"
          @click="navigate(v.id)"
        >{{ v.id }}</div>
      </n-layout-sider>

      <n-layout-content content-style="height: 100%; overflow: hidden;">
        <ArtifactItem v-if="store.activeArtifact" :key="store.activeArtifact.id" :artifact="store.activeArtifact" />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.artifact-item {
  cursor: pointer;
}
</style>
