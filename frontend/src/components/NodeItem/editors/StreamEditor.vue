<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Stage from './Stage.vue'

defineProps({
  node: { type: Object, required: true }
})

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
    <canvas ref="preview" class="canvas"></canvas>
  </Stage>
</template>
