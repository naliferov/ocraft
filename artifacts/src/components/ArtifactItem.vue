<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import p5 from 'p5'
import { NInput, NButton } from 'naive-ui'
import { useArtifactsStore } from '../stores/artifacts.js'
import { renderSceneP5 } from './renderSceneP5.js'

const props = defineProps({
  artifact: { type: Object, required: true }
})

const store = useArtifactsStore()
const save = () => store.save(props.artifact.id, props.artifact)
let p5Instance = null
let ro
const preview = ref(null)

const loadScript = async () => {
  const res = await fetch(`/api/artifacts/${props.artifact.id}/script`)

  const code = await res.text()
  const blob = new Blob([code], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const mod = await import(/* @vite-ignore */ url)
  URL.revokeObjectURL(url)
  mod.default?.()
}

const backgroundNode = computed(() =>
  props.artifact.nodes?.find(n => n.type === 'background') ?? null
)

const backgroundFill = computed({
  get: () => backgroundNode.value?.props?.fill ?? '',
  set: (val) => {
    if (backgroundNode.value) {
      backgroundNode.value.props.fill = val
    }
  }
})

onMounted(async () => {
  if (props.artifact.type === 'script') {
    await loadScript()
    return
  }

  const container = preview.value
  if (!container) return

  p5Instance = new p5((s) => {
    s.setup = () => {
      s.createCanvas(container.offsetWidth, container.offsetHeight).parent(container)
      s.rectMode(s.CORNER)
      s.frameRate(30)
    }
    s.draw = () => {
      renderSceneP5(s, { width: s.width, height: s.height }, props.artifact)
    }
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
  <div class="wrap">
    <div class="info">
      <span class="name">{{ artifact.name }}</span>
      <span class="desc">{{ artifact.description }}</span>
    </div>

    <n-input
      v-if="artifact.type !== 'script'"
      v-model:value="backgroundFill"
      placeholder="#f2f2fe"
      size="small"
    />
    <n-button size="small" @click="save">Save</n-button>
    <div v-if="artifact.type !== 'script'" ref="preview" class="artifact-container"></div>
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

.artifact-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #f2f2f2;
  overflow: hidden;
  min-height: 0;
}
</style>