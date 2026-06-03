<script setup>
import { computed } from 'vue'
import { NSelect } from 'naive-ui'
import NodeSceneEditor from './NodeSceneEditor.vue'
import NodeScriptEditor from './NodeScriptEditor.vue'
import NodeStreamEditor from './NodeStreamEditor.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const typeOptions = [
  { label: 'scene', value: 'scene' },
  { label: 'script', value: 'script' },
  { label: 'stream', value: 'stream' },
]

const nodeType = computed({
  get: () => props.node.type ?? 'scene',
  set: (val) => { props.node.type = val === 'scene' ? undefined : val }
})
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
        style="width: 88px; margin-left: auto; flex-shrink: 0;"
      />
    </div>

    <NodeScriptEditor v-if="nodeType === 'script'" :node="node" />
    <NodeStreamEditor v-else-if="nodeType === 'stream'" :node="node" />
    <NodeSceneEditor v-else :node="node" />
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
