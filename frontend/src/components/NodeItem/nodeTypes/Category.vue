<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNodesStore } from '../../../stores/nodes.js'

// A category node is a folder: it has no scene/script of its own, it just holds
// child nodes. This panel lists those children and lets you open them.
const props = defineProps({
  node: { type: Object, required: true },
})

const store = useNodesStore()
const router = useRouter()

const children = computed(() => store.childrenOf(props.node.id))
const open = (id) => router.push(`/node/${id}`)
</script>

<template>
  <div class="category">
    <div v-if="!children.length" class="empty">
      No child nodes yet. Set another node's <code>parentId</code> to <code>{{ node.id }}</code> to
      nest it here.
    </div>
    <div v-for="c in children" :key="c.id" class="child" @click="open(c.id)">
      <span class="ctype">{{ c.type ?? 'scene2d' }}</span>
      <span class="cname">{{ c.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.category {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
}
.empty {
  opacity: 0.5;
  font-size: 0.9em;
}
.child {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.child:hover {
  background: rgba(255, 255, 255, 0.06);
}
.ctype {
  opacity: 0.5;
  font-size: 0.75em;
  min-width: 52px;
}
code {
  opacity: 0.8;
}
</style>
