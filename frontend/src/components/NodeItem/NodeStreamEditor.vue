<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useNodesStore } from '../../stores/nodes.js'

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
  <div class="transport">
    <span class="meta">stream · {{ stream.source || 'no source' }}</span>
    <button class="btn save" @click="store.save(node.id, node)">Save</button>
  </div>

  <div class="stage">
    <canvas ref="preview" class="canvas"></canvas>
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.meta {
  font-size: 12px;
  opacity: 0.5;
}

.btn {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.6;
}

.btn:hover { background: #3a3a3a; }
.btn.save { margin-left: auto; }

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
}

.canvas {
  height: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  margin: auto;
  background: #000;
  overflow: hidden;
}
</style>
