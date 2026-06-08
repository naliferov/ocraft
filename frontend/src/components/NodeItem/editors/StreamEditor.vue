<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useNodesStore } from '../../../stores/nodes.js'
import Stage from './Stage.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const store = useNodesStore()

const stream = computed(() => props.node.stream ?? { source: '' })

// black canvas — keep it filled black on mount and on every resize
const preview = ref(null)
let ro

const paintBlack = () => {
  const canvas = preview.value
  if (!canvas) return
  canvas.width = canvas.offsetWidth
  canvas.height = canvas.offsetHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

onMounted(() => {
  paintBlack()
  ro = new ResizeObserver(paintBlack)
  ro.observe(preview.value)
})

onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <Stage background="#000">
    <template #toolbar>
      <span class="meta">stream · {{ stream.source || 'no source' }}</span>
      <button class="btn save" @click="store.save(node.id, node)">Save</button>
    </template>
    <canvas ref="preview" class="canvas"></canvas>
  </Stage>
</template>
