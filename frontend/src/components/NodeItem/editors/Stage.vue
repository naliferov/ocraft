<script setup>
// Shared chrome for preview-style editors (scene, stream): a top toolbar row and
// a letterboxed 16:9 preview area. The parent supplies the toolbar controls via
// the "toolbar" slot and the canvas element (class="canvas") via the default slot.
defineProps({
  background: { type: String, default: '#1a1a1a' }
})
</script>

<template>
  <div class="transport"><slot name="toolbar" /></div>
  <div class="stage" :style="{ '--stage-bg': background }">
    <slot />
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* The toolbar controls are passed in by the parent, so reach them with :slotted. */
.transport :slotted(.btn) {
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.6;
}
.transport :slotted(.btn:hover) { background: #3a3a3a; }
.transport :slotted(.btn.save) { margin-left: auto; }
.transport :slotted(.meta) { font-size: 12px; opacity: 0.5; }

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* The canvas element is slotted in; --stage-bg inherits down the real DOM tree. */
.stage :slotted(.canvas) {
  height: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  margin: auto;
  background: var(--stage-bg);
  overflow: hidden;
}
</style>
