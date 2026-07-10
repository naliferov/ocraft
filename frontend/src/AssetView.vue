<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// Renders one bin item by its declared type. Binary/static files live in public/bins (served
// as-is, not bundled) and are fetched on demand. gz-text is inflated in-browser via
// DecompressionStream; images/audio/video get a native element; anything else is a download link.
const props = defineProps<{ asset: { name: string; file: string; type: string } }>()
const src = computed(() => `/bins/${props.asset.file}`)
const text = ref('')
const status = ref('')
const filter = ref('')

const gunzip = (stream: ReadableStream<Uint8Array>) =>
  // `as any`: lib.dom types DecompressionStream's pair too strictly for pipeThrough (runtime is fine)
  new Response(stream.pipeThrough(new DecompressionStream('gzip') as any)).text()

const loadText = async () => {
  status.value = 'loading…'
  text.value = ''
  try {
    const res = await fetch(src.value)
    if (!res.ok || !res.body) throw new Error(`fetch ${res.status}`)
    text.value = props.asset.type === 'gz-text' ? await gunzip(res.body) : await res.text()
    status.value = `${text.value.length.toLocaleString()} chars`
  } catch (error) {
    status.value = `error: ${error instanceof Error ? error.message : String(error)}`
  }
}

const isText = (type: string) => type === 'gz-text' || type === 'txt'

watch(
  () => props.asset,
  (asset) => {
    text.value = ''
    status.value = ''
    filter.value = ''
    if (isText(asset.type)) loadText()
  },
  { immediate: true },
)

const lines = computed(() => (text.value ? text.value.split('\n') : []))
const CAP = 1000 // filter first, then cap what we paint
const view = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const hits = q ? lines.value.filter((line) => line.toLowerCase().includes(q)) : lines.value
  return { total: hits.length, rows: hits.slice(0, CAP) }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <span class="font-semibold">{{ asset.name }}</span>
      <span class="text-xs opacity-60">{{ status }}</span>
    </div>

    <template v-if="isText(asset.type)">
      <input v-model="filter" class="input input-sm input-bordered" placeholder="filter lines…" />
      <div v-if="lines.length" class="text-xs opacity-60">
        {{ view.total.toLocaleString() }} lines{{
          view.total > CAP ? ` · showing first ${CAP}` : ''
        }}
      </div>
      <pre class="rounded bg-base-200 p-3 text-sm whitespace-pre-wrap">{{ view.rows.join('\n') }}</pre>
    </template>

    <img
      v-else-if="asset.type === 'image'"
      :src="src"
      :alt="asset.name"
      class="max-w-full rounded"
    />
    <audio v-else-if="asset.type === 'audio'" :src="src" controls class="w-full" />
    <video v-else-if="asset.type === 'video'" :src="src" controls class="max-w-full rounded" />
    <a v-else :href="src" :download="asset.file" class="link link-primary">⬇ {{ asset.file }}</a>
  </div>
</template>
