<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import p5 from 'p5'
import { renderSceneP5, pickElement, screenToLogical } from '../../../lib/renderSceneP5.js'
import { useTimeline } from '../../../composables/useTimeline.js'
import Stage from './Stage.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const {
  isPlaying, playheadProgress,
  bpm, bars, stepsPerBeat, totalSteps, tracks,
  play, pause, stop, toggleStep,
} = useTimeline(() => props.node)

const isStepActive = (track, s) =>
  Array.isArray(track.events) && track.events.includes(s)

// Nodes can opt out of the visual stage (e.g. an audio-only track) with
// `stage: false`; then we show only the transport + timeline and never mount p5.
const showStage = computed(() => props.node.stage !== false)

// p5 scene preview
const preview = ref(null)
let p5Instance = null
let ro

onMounted(() => {
  const container = preview.value
  if (!container) return
  // Drag-to-move: grab the element under the cursor and track the offset between
  // the pointer and the element's stored x/y, so it doesn't jump on grab. The new
  // position is written onto props.node.elements in place; it persists when the
  // user hits Save (no autosave — same as every other field in the editor).
  let drag = null
  const overCanvas = (s) => s.mouseX >= 0 && s.mouseY >= 0 && s.mouseX <= s.width && s.mouseY <= s.height
  const round2 = (value) => Math.round(value * 100) / 100

  p5Instance = new p5((s) => {
    s.setup = () => {
      s.createCanvas(container.offsetWidth, container.offsetHeight).parent(container)
      s.rectMode(s.CORNER)
      s.frameRate(props.node.frameRate ?? 24)
    }
    s.draw = () => renderSceneP5(s, { width: s.width, height: s.height }, props.node)

    s.mousePressed = () => {
      if (!overCanvas(s)) return
      const element = pickElement(s.width, s.height, props.node, s.mouseX, s.mouseY)
      if (!element) return
      if (!element.props) element.props = {}
      const point = screenToLogical(s.width, s.height, props.node, s.mouseX, s.mouseY)

      drag = { element, grabX: point.x - (element.props.x ?? 0), grabY: point.y - (element.props.y ?? 0) }
    }
    s.mouseDragged = () => {
      if (!drag) return
      const point = screenToLogical(s.width, s.height, props.node, s.mouseX, s.mouseY)
      drag.element.props.x = round2(point.x - drag.grabX)
      drag.element.props.y = round2(point.y - drag.grabY)
    }
    s.mouseReleased = () => { drag = null }
    // Cursor affordance: show a move cursor when hovering a draggable element.
    s.mouseMoved = () => {
      if (!overCanvas(s)) return
      const over = pickElement(s.width, s.height, props.node, s.mouseX, s.mouseY)
      container.style.cursor = over ? 'move' : 'default'
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
  <Stage :canvas="showStage">
    <template #toolbar>
      <button class="btn" @click="isPlaying ? pause() : play()">{{ isPlaying ? '⏸' : '▶' }}</button>
      <button class="btn" @click="stop">⏹</button>
      <span class="meta">{{ bpm }} BPM · {{ bars }} bars</span>
    </template>
    <!-- the canvas letterboxes into the stage as the largest centered 16:9 box -->
    <div v-if="showStage" ref="preview" class="canvas"></div>
  </Stage>

  <div class="timeline">
    <div v-for="t in tracks" :key="t.name" class="track">
      <div class="track-label">{{ t.name }}</div>
      <div class="track-steps">
        <div class="playhead" :style="{ left: `${playheadProgress * 100}%` }"></div>
        <div
          v-for="s in totalSteps"
          :key="s"
          class="step"
          :class="{
            active: isStepActive(t, s - 1),
            'bar-start': (s - 1) % stepsPerBeat === 0
          }"
          @click="toggleStep(t, s - 1)"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  flex: 0 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.track {
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid #1e1e1e;
}

.track-label {
  width: 72px;
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
  padding-right: 8px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-steps {
  position: relative;
  display: flex;
  gap: 2px;
  align-items: center;
  height: 100%;
  flex: 1;
}

.playhead {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  z-index: 1;
}

.step {
  flex: 1;
  min-width: 0;
  height: 20px;
  background: #222;
  border-radius: 2px;
  cursor: pointer;
  border: 1px solid #2e2e2e;
}

.step.bar-start { margin-left: 4px; }
.step:hover { background: #333; }
.step.active { background: #3d7eff; border-color: #3d7eff; }
.step.active:hover { background: #5090ff; }
</style>
