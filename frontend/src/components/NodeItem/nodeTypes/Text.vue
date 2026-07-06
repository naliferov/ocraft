<script setup lang="ts">
// Editor for `text` nodes: a plain monospace buffer for any textual source
// (vlang scripts, notes, csv, …). The body lives in the /api/nodes/:id/body
// sidecar like html/script; the header's Save persists via save() below.
// Storage without behavior — text nodes never run; engines (script nodes)
// open and interpret them.
import { ref, onMounted } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const content = ref('')
const savedContent = ref('')
onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/body`)
  if (res.ok) {
    content.value = await res.text()
    savedContent.value = content.value
  }
})

// No-ops when unchanged so saving metadata-only edits doesn't rewrite the body.
const save = async () => {
  if (content.value === savedContent.value) {
    return
  }
  await fetch(`/api/nodes/${props.node.id}/body`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: content.value,
  })
  savedContent.value = content.value
}
defineExpose({ save })
</script>

<template>
  <textarea v-model="content" class="body" spellcheck="false" placeholder="Plain text…" />
</template>

<style scoped>
.body {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 14px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-feature-settings:
    'liga' 0,
    'calt' 0; /* no programming ligatures */
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
  background: #141414;
  border: 1px solid #333;
  border-radius: 4px;
  outline: none;
  resize: none;
  white-space: pre;
}
</style>
