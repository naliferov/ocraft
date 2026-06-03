<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import p5 from 'p5'
import { renderSceneP5 } from '../../lib/renderSceneP5.js'
import { useNodesStore } from '../../stores/nodes.js'
import { useTimeline } from '../../composables/useTimeline.js'

const props = defineProps({
  node: { type: Object, required: true }
})

const store = useNodesStore()

const {
  isPlaying, playheadProgress,
  bpm, bars, stepsPerBeat, totalSteps, tracks,
  play, pause, stop, toggleStep,
} = useTimeline(() => props.node)

const isStepActive = (track, s) =>
  Array.isArray(track.events) && track.events.includes(s)

// p5 scene preview
const preview = ref(null)
let p5Instance = null
let ro

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
  <div class="transport">
    <button class="btn" @click="isPlaying ? pause() : play()">{{ isPlaying ? '⏸' : '▶' }}</button>
    <button class="btn" @click="stop">⏹</button>
    <span class="meta">{{ bpm }} BPM · {{ bars }} bars</span>
    <button class="btn save" @click="store.save(node.id, node)">Save</button>
  </div>

  <!-- stage fills all space left over by the transport + timeline; the canvas
       letterboxes into it as the largest centered 16:9 box -->
  <div class="stage">
    <div ref="preview" class="canvas"></div>
  </div>

  <div class="timeline">
    <div v-if="!tracks.length" class="no-tracks">no tracks yet</div>
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
.transport {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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

.meta {
  font-size: 12px;
  opacity: 0.5;
}

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
  background: #1a1a1a;
  overflow: hidden;
}

.timeline {
  flex: 0 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.no-tracks {
  font-size: 11px;
  color: #444;
  padding: 8px 0 0 80px;
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
