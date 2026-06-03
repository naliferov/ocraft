<script setup>
import { ref, onMounted } from 'vue'
import { NButton } from 'naive-ui'

const props = defineProps({
  node: { type: Object, required: true }
})

const scriptCode = ref('')

onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/script`)
  if (res.ok) scriptCode.value = await res.text()
})

const runScript = async () => {
  const blob = new Blob([scriptCode.value], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const mod = await import(/* @vite-ignore */ url)
  URL.revokeObjectURL(url)
  mod.default?.()
}

const saveScript = async () => {
  await fetch(`/api/nodes/${props.node.id}/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: scriptCode.value
  })
}

const onKeydown = (e) => {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target
    const start = el.selectionStart
    const end = el.selectionEnd
    scriptCode.value = scriptCode.value.slice(0, start) + '  ' + scriptCode.value.slice(end)
    el.setSelectionRange(start + 2, start + 2)
  }
}
</script>

<template>
  <div class="actions">
    <n-button size="small" @click="saveScript">Save</n-button>
    <n-button size="small" @click="runScript">Run</n-button>
  </div>
  <textarea
    class="editor"
    v-model="scriptCode"
    spellcheck="false"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px;
  background: #1a1a1a;
  color: #d4d4d4;
  border: 1px solid #333;
  border-radius: 4px;
  outline: none;
  tab-size: 2;
}
</style>
