<script setup>
// Renderer for `binary` nodes — a node whose body is raw bytes (image / audio / video / …) rather
// than text. Fetches /api/nodes/:id/body as a blob (the API serves it under the stored MIME), wraps
// it in an object URL, and branches on the MIME: image/* → <img>, audio/* → <audio>, video/* →
// <video>, anything else → a download link. The MIME comes from the node's data ({mime, filename})
// or the response Content-Type. Display-only for now — no upload/edit (that's a follow-up).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const url = ref('') // blob object URL for the body
const mime = ref(props.node.mime || '')
const error = ref('')

onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/body`)
  if (!res.ok) {
    error.value = `Couldn't load body (${res.status})`
    return
  }
  mime.value = props.node.mime || res.headers.get('Content-Type') || 'application/octet-stream'
  url.value = URL.createObjectURL(await res.blob())
})

// Free the blob URL when leaving the node (createObjectURL leaks otherwise).
onBeforeUnmount(() => {
  if (url.value) {
    URL.revokeObjectURL(url.value)
  }
})

const kind = computed(() => {
  if (mime.value.startsWith('image/')) {
    return 'image'
  }
  if (mime.value.startsWith('audio/')) {
    return 'audio'
  }
  if (mime.value.startsWith('video/')) {
    return 'video'
  }
  return 'other'
})

const filename = computed(() => props.node.filename || props.node.name)
</script>

<template>
  <div class="binary">
    <div v-if="error" class="binary-error">{{ error }}</div>
    <template v-else-if="url">
      <img v-if="kind === 'image'" :src="url" :alt="filename" class="media" />
      <audio v-else-if="kind === 'audio'" :src="url" controls class="audio" />
      <video v-else-if="kind === 'video'" :src="url" controls class="media" />
      <div v-else class="binary-other">
        <p>No inline preview for <code>{{ mime }}</code>.</p>
        <a :href="url" :download="filename">Download {{ filename }}</a>
      </div>
    </template>
    <div v-else class="binary-loading">loading…</div>
    <div class="binary-meta">{{ filename }} · {{ mime }}</div>
  </div>
</template>

<style scoped>
.binary {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.media {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}
.audio {
  width: 100%;
  max-width: 480px;
}
.binary-other {
  padding: 16px 20px;
  border: 1px dashed #555;
  border-radius: 8px;
  font-size: 0.9em;
  line-height: 1.6;
}
.binary-other code {
  color: #ffd56b;
}
.binary-other a {
  color: #3d7eff;
}
.binary-error {
  color: #ff8080;
}
.binary-loading {
  opacity: 0.5;
  font-size: 0.9em;
}
.binary-meta {
  font-size: 0.78em;
  opacity: 0.45;
  font-family: 'JetBrains Mono', monospace;
}
</style>
