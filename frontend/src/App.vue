<script setup>
import { ref, watch } from 'vue'
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

// Create a node (root-level when no parentId), select it so the user lands on it.
const createNode = async (parentId = null) => {
  const node = await store.create({ parentId })
  navigate(node.id)
}

// Delete surfaces the server's 409 ("has children") as a banner instead of failing
// silently; otherwise selection has already moved off the deleted node in the store.
const deleteError = ref('')
const removeNode = async (id) => {
  deleteError.value = ''
  try {
    await store.remove(id)
    if (store.activeNodeId) navigate(store.activeNodeId)
  } catch (err) {
    deleteError.value = err.message
  }
}

// Switch a deleted node back in from the undo pool and land on it.
const restoreNode = async (id) => {
  const node = await store.restore(id)
  if (node) navigate(node.id)
}

const renameNode = ({ id, name }) => store.rename(id, name)

// Reparent surfaces the cycle-guard error ("into its own descendant") in the banner.
const reparentNode = async ({ id, parentId }) => {
  deleteError.value = ''
  try {
    await store.reparent(id, parentId)
  } catch (err) {
    deleteError.value = err.message
  }
}
</script>

<template>
  <n-config-provider>
    <n-layout has-sider content-style="height: 100vh;">
      <n-layout-sider :width="240" bordered content-style="padding: 10px 8px 0 8px;">
        <div class="tree-toolbar">
          <span class="tree-title">Nodes</span>
          <button class="new-node" title="New root node" @click="createNode()">+ node</button>
        </div>
        <div v-if="deleteError" class="tree-error" @click="deleteError = ''">{{ deleteError }}</div>
        <div v-if="store.deletedNodes.length" class="trash-pool">
          <div class="trash-pool-title">Recently deleted</div>
          <div v-for="entry in store.deletedNodes" :key="entry.id" class="trash-item">
            <span class="trash-name" :title="entry.name">{{ entry.name }}</span>
            <button class="trash-restore" title="Restore" @click="restoreNode(entry.id)">↩</button>
          </div>
        </div>
        <NodeTree
          :nodes="store.tree"
          :active-id="store.activeNodeId"
          @select="navigate"
          @toggle="store.toggleCollapsed"
          @create="createNode"
          @rename="renameNode"
          @remove="removeNode"
          @reparent="reparentNode"
        />
      </n-layout-sider>

      <n-layout-content content-style="height: 100%; overflow: hidden;">
        <NodeItem v-if="route.params.id && store.activeNode" :key="store.activeNode.id" :node="store.activeNode" />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 6px 6px;
}
.tree-title {
  font-size: 0.8em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}
.new-node {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
  opacity: 0.8;
  cursor: pointer;
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
}
.new-node:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}
.tree-error {
  font-size: 0.8em;
  color: #ff8080;
  background: rgba(255, 80, 80, 0.12);
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 6px;
  cursor: pointer;
}
.trash-pool {
  margin-bottom: 8px;
  padding: 4px 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.trash-pool-title {
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.45;
  padding: 0 4px 4px;
}
.trash-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
}
.trash-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.6;
  font-size: 0.9em;
}
.trash-restore {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 0.9em;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.trash-restore:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}
</style>

