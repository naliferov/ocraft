<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import p5 from 'p5'
import { NInput, NButton } from 'naive-ui'
import { useVisualsStore } from '../stores/visuals.js'
import { renderScene } from './renderScene.js'
import { renderSceneP5 } from './renderSceneP5.js'

const props = defineProps({
  visual: { type: Object, required: true }
})

const store = useVisualsStore()
const save = () => store.save(props.visual.id, props.visual)

const canvas = ref(null)
const preview = ref(null)

let ro

const backgroundNode = computed(() =>
  props.visual.nodes?.find(n => n.type === 'background') ?? null
)

const backgroundFill = computed({
  get: () => backgroundNode.value?.props?.fill ?? '',
  set: (val) => {
    console.log('test88')
    if (backgroundNode.value) {
      backgroundNode.value.props.fill = val
    }
  }
})

const calcRenderParams = () => {
  const container = preview.value
  if (!container) return null
  const dpr = window.devicePixelRatio || 1
  const width = container.offsetWidth
  const height = container.offsetHeight
  return { width, height, dpr }
}

const resizeCanvas = () => {
  const el = canvas.value
  const params = calcRenderParams()
  if (!el || !params) return null

  const { width, height, dpr } = params
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  el.style.width = width + 'px'
  el.style.height = height + 'px'

  return params
}

const renderSceneOnCanvas = (params) => {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return
  renderScene(ctx, params, props.visual)
}

onMounted(() => {
  const container = preview.value
  if (!container) return

  const resizeAndRender = () => {
    // const params = resizeCanvas()
    // if (!params) return
    // renderSceneOnCanvas(params)

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
      //const t = getTime()
      renderSceneP5(
        s,
        {
          width: s.width,
          height: s.height
        },
        props.visual
      )
    }
  })

  resizeAndRender()
  ro = new ResizeObserver(resizeAndRender)
  ro.observe(container)
})

//const p5Container = ref(null)
let p5Instance = null

onBeforeUnmount(() => {
  ro?.disconnect()
  p5Instance?.remove()
})

watch(
  () => props.visual,
  () => {
    //const params = calcRenderParams()
    //if (params) render(params)
  },
  { deep: true }
)
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

    <div ref="preview" class="visual-preview">
      <!-- <canvas ref="canvas" class="canvas" /> -->
    </div>

    <div ref="p5Container" class="p5-container" />
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
  overflow-y: auto;
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

.visual-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-width: 100%;
  background: #f2f2f2;
  overflow: hidden;
  flex-shrink: 0;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.p5-container {
  flex-shrink: 0;
}
</style>