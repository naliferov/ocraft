<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { NButton, NPopselect, NCheckbox } from 'naive-ui'
import { useNodesStore } from '../../../stores/nodes.js'
import { runNodeCode, runWasmNode, clearCache } from '../../../composables/useNodeScripts.js'

const props = defineProps({
  node: { type: Object, required: true }
})

const store = useNodesStore()
const scriptCode = ref('')
const savedCode = ref('')       // last persisted script.js — lets save() skip no-op writes
const txtAreaRef = ref(null)
const insertTarget = ref(null) // bound model for the picker; reset after each pick

// Live name hints. On load we inject `/*→name*/` right after each x.x("id") so
// the editor shows what the id points at; they're stripped before save so the
// stored source stays clean ids. The `→` marker makes them safe to strip without
// disturbing the user's own comments.
const MARK = / ?\/\*→.*?\*\//g
const stripMarks = (s) => s.replace(MARK, '')
const annotate = (s) =>
  stripMarks(s).replace(/(x\.x\(\s*["'])(\w+)(["'])/g, (_, pre, id, post) => {
    const n = store.nodes.find((nd) => nd.id === id)
    return `${pre}${id}${post} /*→${n?.name ?? '⚠ unknown'}*/`
  })

// Other script nodes this one can call. Identity is the flat id; the label shows
// the human name (+ id) so picking is readable without the id living in source.
const callableOptions = computed(() =>
  store.nodes
    .filter(n => n.type === 'script' && n.id !== props.node.id)
    .map(n => ({ label: `${n.name || '(unnamed)'}${n.isWasm ? ' ⚙' : ''}  ·  ${n.id}`, value: n.id }))
)

onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/script`)
  if (res.ok) {
    const raw = await res.text()
    savedCode.value = stripMarks(raw)   // clean baseline for the dirty check
    scriptCode.value = annotate(raw)    // shown with name hints
  }
})

const runScript = async () => {
  try {
    if (props.node.isWasm) {
      // wasm compiles from the SAVED source on the backend — persist first.
      await save()
      await runWasmNode(props.node.id)
    } else {
      await runNodeCode(scriptCode.value, props.node.id)
    }
  } catch (err) {
    console.error(`[node ${props.node.id}] run failed:`, err)
  }
}

// Persist script.js — called by NodeItem's single Save. Strips the injected name
// hints so stored source stays clean ids; no-ops if unchanged.
const save = async () => {
  const cleanStr = stripMarks(scriptCode.value)
  if (cleanStr === savedCode.value) return
  await fetch(`/api/nodes/${props.node.id}/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: cleanStr
  })
  savedCode.value = cleanStr
  clearCache() // so a subsequent x.x picks up the saved version
}
defineExpose({ save })

// Insert `x.x("<id>" /*→name*/)` at the cursor. Only the id persists (the hint
// is stripped on save); the inline name is shown for readability.
const insertCall = (id) => {
  const el = txtAreaRef.value
  const start = el?.selectionStart ?? scriptCode.value.length
  const end = el?.selectionEnd ?? start
  const n = store.nodes.find((nd) => nd.id === id)
  const snippet = `x.x("${id}" /*→${n?.name ?? '⚠ unknown'}*/)`
  scriptCode.value = scriptCode.value.slice(0, start) + snippet + scriptCode.value.slice(end)
  insertTarget.value = null
  nextTick(() => {
    el?.focus()
    const pos = start + snippet.length
    el?.setSelectionRange(pos, pos)
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
    <n-button size="small" @click="runScript">Run</n-button>
    <n-popselect
      v-if="!node.isWasm"
      v-model:value="insertTarget"
      :options="callableOptions"
      trigger="click"
      scrollable
      @update:value="insertCall"
    >
      <n-button size="small" :disabled="callableOptions.length === 0">Insert call</n-button>
    </n-popselect>
    <n-checkbox v-model:checked="node.isWasm">WASM (AssemblyScript)</n-checkbox>
  </div>
  <textarea
    ref="txtAreaRef"
    class="editor"
    v-model="scriptCode"
    spellcheck="false"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.actions {
  display: flex;
  align-items: center;
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
