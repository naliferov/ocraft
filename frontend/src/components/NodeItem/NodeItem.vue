<script setup>
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import SceneEditor from './editors/SceneEditor.vue'
import ScriptEditor from './editors/ScriptEditor.vue'
import StreamEditor from './editors/StreamEditor.vue'
import CategoryEditor from './editors/CategoryEditor.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

// Registry of node type -> editor: the single source of truth for both the type
// picker and which component renders. Adding a node type = one entry here.
const EDITORS = {
  scene: { label: 'scene', component: SceneEditor },
  script: { label: 'script', component: ScriptEditor },
  stream: { label: 'stream', component: StreamEditor },
  category: { label: 'category', component: CategoryEditor },
}

const typeOptions = Object.entries(EDITORS).map(([value, { label }]) => ({ label, value }))

const nodeType = computed({
  get: () => props.node.type ?? 'scene',
  set: (val) => { props.node.type = val === 'scene' ? undefined : val }
})

const editor = computed(() => (EDITORS[nodeType.value] ?? EDITORS.scene).component)
</script>

<template>
  <div class="wrap">
    <div class="info">
      <span class="name">{{ node.name }}</span>
      <span class="desc">{{ node.description }}</span>
      <n-select
        v-model:value="nodeType"
        :options="typeOptions"
        size="small"
        style="width: 110px; margin-left: auto; flex-shrink: 0;"
      />
    </div>

    <component :is="editor" :node="node" />
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  gap: 12px;
  overflow: hidden;
}

.info {
  display: flex;
  gap: 12px;
  align-items: baseline;
  flex-shrink: 0;
}

.name {
  font-weight: 600;
}

.desc {
  opacity: 0.5;
  font-size: 0.85em;
}
</style>
