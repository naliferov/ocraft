<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import p5 from 'p5'
import { NInput, NButton } from 'naive-ui'
import { useNodesStore } from '../stores/nodes.js'
import { renderSceneP5 } from './renderSceneP5.js'

const props = defineProps({
  node: { type: Object, required: true }
})

const store = useNodesStore()
const preview = ref(null)
let p5Instance = null
let ro

const backgroundElement = computed(() =>
  props.node.elements?.find(e => e.type === 'background') ?? null
)

const backgroundFill = computed({
  get: () => backgroundElement.value?.props?.fill ?? '',
  set: (val) => {
    if (backgroundElement.value) backgroundElement.value.props.fill = val
  }
})

onMounted(() => {
  const container = preview.value
  if (!container) return
  p5Instance = new p5((s) => {
    s.setup = () => {
      s.createCanvas(container.offsetWidth, container.offsetHeight).parent(container)
      s.rectMode(s.CORNER)
      s.frameRate(30)
    }
    s.draw = () => renderSceneP5(s, { width: s.width, height: s.height }, props.node)
  })
  const resizeAndRender = () => {
    p5Instance.resizeCanvas(container.offsetWidth, container.offsetHeight)
    p5Instance.redraw()
  }
  ro = new ResizeObserver(resizeAndRender)
  ro.observe(container)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  p5Instance?.remove()
})
</script>

<template>
  <n-input v-model:value="backgroundFill" placeholder="#f2f2fe" size="small" />
  <n-button size="small" @click="store.save(node.id, node)">Save</n-button>
  <div ref="preview" class="node-container"></div>
</template>

<style scoped>
.node-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #f2f2f2;
  overflow: hidden;
  min-height: 0;
}
</style>
