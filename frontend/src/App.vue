<script setup>
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { useNodesStore } from './stores/nodes.js'
import NodeItem from './components/NodeItem.vue'

const store = useNodesStore()
const router = useRouter()
const route = useRoute()

onMounted(() => store.load())

watch(() => store.nodes, (list) => {
  if (!list.length) return
  if (route.params.id) return

  const firstId = list[0].id
  router.replace(`/node/${firstId}`)
})

watch(() => route.params.id, (id) => {
  if (id) store.activeNodeId = id
}, { immediate: true })

const navigate = (id) => router.push(`/node/${id}`)
</script>

<template>
  <n-config-provider>
    <n-layout has-sider content-style="height: 100vh;">
      <n-layout-sider :width="240" bordered content-style="padding: 10px 0 0 10px;">
        <div class="node-item"
          v-for="n in store.nodes"
          :key="n.id"
          @click="navigate(n.id)"
        >{{ n.name }}</div>
      </n-layout-sider>

      <n-layout-content content-style="height: 100%; overflow: hidden;">
        <NodeItem v-if="store.activeNode" :key="store.activeNode.id" :node="store.activeNode" />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.node-item {
  cursor: pointer;
}
</style>
