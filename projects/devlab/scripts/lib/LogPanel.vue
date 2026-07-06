<script setup lang="ts">
// Timestamped message log with direction arrows: 'up' (sent), 'down' (received), 'sys' (status).
import { ref, nextTick } from 'vue'

defineProps<{ height?: string }>()

const ARROW: Record<string, string> = { up: '↑', down: '↓', sys: '·' }
const COLOR: Record<string, string> = { up: 'text-info', down: 'text-success', sys: 'opacity-60' }

const lines = ref<{ time: string; dir: string; text: string }[]>([])
const view = ref<HTMLElement>()

const push = (text: string, dir = 'sys') => {
  lines.value.push({ time: new Date().toLocaleTimeString(), dir, text })
  nextTick(() => view.value && (view.value.scrollTop = view.value.scrollHeight))
}
const clear = () => (lines.value = [])

defineExpose({ push, clear })
</script>

<template>
  <div
    ref="view"
    class="overflow-auto rounded border border-base-300 bg-base-200 p-2.5 font-mono text-[12.5px] leading-relaxed"
    :style="{ maxHeight: height ?? '300px' }"
  >
    <div
      v-for="(l, i) in lines"
      :key="i"
      class="flex gap-2 whitespace-pre-wrap break-words"
      :class="COLOR[l.dir] ?? COLOR.sys"
    >
      <span class="shrink-0 opacity-40">{{ l.time }}</span>
      <span class="w-3 shrink-0 text-center">{{ ARROW[l.dir] ?? ARROW.sys }}</span>
      <span>{{ l.text }}</span>
    </div>
  </div>
</template>
