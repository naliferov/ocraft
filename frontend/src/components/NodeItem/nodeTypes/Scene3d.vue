<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createScene3d } from '../../../lib/renderSceneThree.js'
import Stage from './Stage.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

// Three.js preview. The renderer / scene / loop live in createScene3d (the 3D
// analog of renderSceneP5); this component just mounts it into the shared Stage
// chrome, keeps it sized, and tears it down on unmount/re-run.
const preview = ref(null)
const isPlaying = ref(true)
let controller = null
let resizeObserver = null

onMounted(() => {
  const container = preview.value
  if (!container) {
    return
  }
  controller = createScene3d(container, props.node)
  controller.setPlaying(isPlaying.value)
  resizeObserver = new ResizeObserver(() => controller?.resize())
  resizeObserver.observe(container)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  controller?.dispose()
  controller = null
})

const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  controller?.setPlaying(isPlaying.value)
}
</script>

<template>
  <Stage>
    <template #toolbar>
      <button class="btn" @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
      <span class="meta">3D · Three.js</span>
    </template>
    <!-- Stage letterboxes this into a centered 16:9 box; Three renders into it. -->
    <div ref="preview" class="canvas"></div>
  </Stage>
</template>

<style scoped>
.canvas {
  background: #0b0b14;
}
</style>
