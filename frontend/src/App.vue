<script setup>
import { watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { useNodesStore } from './stores/nodes.js'
import NodeItem from './components/NodeItem/NodeItem.vue'
import NodeTree from './components/NodeTree.vue'

const store = useNodesStore()
const router = useRouter()
const route = useRoute()

watch(() => route.params.id, (id) => {
  if (id) store.activeNodeId = id
}, { immediate: true })

const navigate = (id) => router.push(`/node/${id}`)
</script>

<template>
  <n-config-provider>
    <n-layout has-sider content-style="height: 100vh;">
      <n-layout-sider :width="240" bordered content-style="padding: 10px 8px 0 8px;">
        <NodeTree
          :nodes="store.tree"
          :active-id="store.activeNodeId"
          @select="navigate"
          @toggle="store.toggleCollapsed"
        />
      </n-layout-sider>

      <n-layout-content content-style="height: 100%; overflow: hidden;">
        <NodeItem v-if="route.params.id && store.activeNode" :key="store.activeNode.id" :node="store.activeNode" />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

