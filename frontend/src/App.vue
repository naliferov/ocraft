<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NConfigProvider, NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { useNodesStore } from './stores/nodes.js'
import NodeItem from './components/NodeItem/NodeItem.vue'
import NodeTree from './components/NodeTree.vue'
import Terminal from './components/Terminal.vue'
import Login from './components/Login.vue'
import { logout } from './lib/apiAuth.js'

const store = useNodesStore()
const router = useRouter()
const route = useRoute()

watch(
  () => route.params.id,
  (id) => {
    if (id) {
      store.activeNodeId = id
    }
  },
  { immediate: true },
)

const navigate = (id) => router.push(`/node/${id}`)

// Sign out: clear the server session, then HARD-navigate to /login. A full reload (not router.push)
// drops the Pinia store too, so the next sign-in can never see the previous user's tree.
const signOut = async () => {
  await logout()
  window.location.href = '/login'
}

// Search the tree by node name. Prune to branches that contain a match (keeping
// ancestors so the path stays visible); while searching, NodeTree force-expands
// and highlights matches. Case-insensitive; localeCompare-free `includes` handles
// unicode (Cyrillic) fine.
const searchQuery = ref('')
const pruneBySearch = (nodes, needle) => {
  const kept = []
  for (const node of nodes) {
    const children = pruneBySearch(node.children, needle)
    const selfMatches = (node.name || '').toLowerCase().includes(needle)
    if (selfMatches || children.length) {
      kept.push({ ...node, children })
    }
  }
  return kept
}
const displayTree = computed(() => {
  const needle = searchQuery.value.trim().toLowerCase()
  return needle ? pruneBySearch(store.tree, needle) : store.tree
})

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
    if (store.activeNodeId) {
      navigate(store.activeNodeId)
    }
  } catch (err) {
    deleteError.value = err.message
  }
}

// Switch a deleted node back in from the undo pool and land on it.
const restoreNode = async (id) => {
  const node = await store.restore(id)
  if (node) {
    navigate(node.id)
  }
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
    <Login v-if="route.path === '/login'" />
    <div v-else class="app-col">
      <n-layout class="main-row" has-sider content-style="height: 100%;">
        <n-layout-sider :width="240" bordered content-style="padding: 10px 8px 0 8px;">
          <div class="tree-toolbar">
            <div class="tree-brand">
              <span
                class="tree-logo"
                title="Home"
                role="link"
                tabindex="0"
                @click="router.push('/')"
                @keydown.enter="router.push('/')"
                >ocraft</span
              >
              <span class="tree-title">Nodes</span>
            </div>
            <div class="tree-actions">
              <button class="new-node" title="New root node" @click="createNode()">+ node</button>
              <button class="logout-btn" title="Sign out" @click="signOut">log out</button>
            </div>
          </div>
          <div class="tree-search">
            <input
              v-model="searchQuery"
              class="tree-search-input"
              type="search"
              placeholder="Search nodes…"
            />
            <button
              v-if="searchQuery"
              class="tree-search-clear"
              title="Clear search"
              @click="searchQuery = ''"
            >
              ×
            </button>
          </div>
          <div v-if="deleteError" class="tree-error" @click="deleteError = ''">{{ deleteError }}</div>
          <div v-if="store.deletedNodes.length" class="trash-pool">
            <div class="trash-pool-title">Recently deleted</div>
            <div v-for="entry in store.deletedNodes" :key="entry.id" class="trash-item">
              <span class="trash-name" :title="entry.name">{{ entry.name }}</span>
              <button class="trash-restore" title="Restore" @click="restoreNode(entry.id)">↩</button>
            </div>
          </div>
          <div v-if="searchQuery.trim() && !displayTree.length" class="tree-empty">
            No nodes match “{{ searchQuery.trim() }}”.
          </div>
          <NodeTree
            :nodes="displayTree"
            :active-id="store.activeNodeId"
            :query="searchQuery.trim()"
            :expand-all="!!searchQuery.trim()"
            @select="navigate"
            @toggle="store.toggleCollapsed"
            @create="createNode"
            @rename="renameNode"
            @remove="removeNode"
            @reparent="reparentNode"
          />
        </n-layout-sider>

        <n-layout-content content-style="height: 100%; overflow: hidden;">
          <NodeItem
            v-if="route.params.id && store.activeNode"
            :key="store.activeNode.id"
            :node="store.activeNode"
          />
          <!-- Explicit not-found state: an id that resolves to no node (deleted, or a
              bad address). Guarded by store.nodes.length so it doesn't flash before
              the tree has loaded. Mirrors NodeItem's "no handler for type" card. -->
          <div v-else-if="route.params.id && store.nodes.length" class="node-missing">
            <p>
              No node <code>#{{ route.params.id }}</code>.
            </p>
            <p>
              This address doesn't resolve to a node in the store — it may have been deleted, or the id
              is wrong. Pick a node from the tree, or
              <a href="#" @click.prevent="router.push('/')">go home</a>.
            </p>
          </div>
        </n-layout-content>
      </n-layout>
      <Terminal />
    </div>
  </n-config-provider>
</template>

<style scoped>
/* The app is a vertical column: the sider+content row on top, the global terminal
   bar pinned full-width along the bottom. The row flexes to fill the height; the
   bar takes a drag-controlled height beneath it. */
.app-col {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.main-row {
  flex: 1;
  min-height: 0;
}

/* Shown for /node/:id when the id resolves to no node — the explicit not-found
   card (was a blank content pane). Mirrors NodeItem's .no-handler styling. */
.node-missing {
  max-width: 460px;
  margin: 18vh auto 0;
  padding: 20px 24px;
  border: 1px dashed #555;
  border-radius: 8px;
  color: #bbb;
  font-size: 0.9em;
  line-height: 1.5;
  text-align: center;
}
.node-missing code {
  color: #ffd56b;
}
.node-missing a {
  color: #3d7eff;
}
.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 6px 6px;
}
.tree-brand {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.tree-logo {
  flex: none;
  font-weight: 700;
  font-size: 0.95em;
  letter-spacing: -0.02em;
  cursor: pointer;
}
.tree-logo:hover {
  opacity: 0.7;
}
.tree-title {
  font-size: 0.8em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}
.tree-search {
  position: relative;
  margin: 0 4px 8px 6px;
}
.tree-search-input {
  width: 100%;
  box-sizing: border-box;
  height: 26px;
  padding: 0 22px 0 8px;
  font: inherit;
  font-size: 0.85em;
  color: inherit;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  outline: none;
}
.tree-search-input:focus {
  border-color: #3d7eff;
}
/* Hide the browser's native search clear (×) — we render our own .tree-search-clear. */
.tree-search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}
.tree-search-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
  padding: 0 4px;
}
.tree-search-clear:hover {
  opacity: 1;
}
.tree-empty {
  font-size: 0.8em;
  opacity: 0.5;
  padding: 4px 8px;
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
.tree-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.logout-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
}
.logout-btn:hover {
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
