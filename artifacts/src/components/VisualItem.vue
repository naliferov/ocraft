<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import p5 from 'p5'
import { NInput, NButton } from 'naive-ui'
import { useVisualsStore } from '../stores/visuals.js'
import { renderSceneP5 } from './renderSceneP5.js'

const props = defineProps({
  visual: { type: Object, required: true }
})

const store = useVisualsStore()
const save = () => store.save(props.visual.id, props.visual)

const preview = ref(null)
let ro
let scriptDraw = null

const loadScript = async () => {
  const res = await fetch(`/api/artifacts/${encodeURIComponent(props.visual.id)}/script`)
  const code = await res.text()
  const blob = new Blob([code], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const mod = await import(/* @vite-ignore */ url)
  URL.revokeObjectURL(url)
  scriptDraw = mod.draw ?? null
}

const backgroundNode = computed(() =>
  props.visual.nodes?.find(n => n.type === 'background') ?? null
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
  const container = preview.value
  if (!container) return

  if (props.visual.type === 'script') {
    await loadScript()
  }

  const resizeAndRender = () => {
    p5Instance.resizeCanvas(
      container.offsetWidth,
      container.offsetHeight
    )
    p5Instance.redraw()
  }

  p5Instance = new p5((s) => {
    s.setup = () => {
      s.createCanvas(container.offsetWidth, container.offsetHeight).parent(container)
      s.rectMode(s.CORNER)
      s.frameRate(30)
    }
    s.draw = () => {
      if (props.visual.type === 'script') {
        const vw = props.visual.viewport?.width ?? s.width
        const vh = props.visual.viewport?.height ?? s.height
        scriptDraw?.(s, vw, vh)
      } else {
        renderSceneP5(s, { width: s.width, height: s.height }, props.visual)
      }
    }
  })

  resizeAndRender()
  ro = new ResizeObserver(resizeAndRender)
  ro.observe(container)
})

let p5Instance = null

onBeforeUnmount(() => {
  ro?.disconnect()
  p5Instance?.remove()
})
</script>

<template>
  <div class="wrap">
    <div class="info">
      <span class="name">{{ visual.name }}</span>
      <span class="desc">{{ visual.description }}</span>
    </div>

    <n-input
      v-model:value="backgroundFill"
      placeholder="#f2f2fe"
      size="small"
    />
    <n-button size="small" @click="save">Save</n-button>
    <div ref="preview" class="artifact-container"></div>
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