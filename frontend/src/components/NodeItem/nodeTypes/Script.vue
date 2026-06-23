<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { NButton, NPopselect, NCheckbox, NSelect } from 'naive-ui'
import { useNodesStore } from '../../../stores/nodes.js'
import { clearCache } from '../../../composables/useNodeScripts.js'
import { runScriptType, scriptTypes } from '../../../composables/useScriptTypes.js'

const props = defineProps({
  node: { type: Object, required: true },
})

const store = useNodesStore()
const scriptCode = ref('')
const savedCode = ref('') // last persisted script.js — lets save() skip no-op writes
const txtAreaRef = ref(null)
const insertTarget = ref(null) // bound model for the picker; reset after each pick

// Host above the editor for whatever a run produces — EITHER the script's imperative
// controls (x.ui, js scripts) OR a mounted view component (vue-esm / vue-sfc).
// A run fills it; we tear down the previous run first (x.ui sockets/timers, or the
// view app's unmount → its onUnmounted hooks).
const scriptViewRef = ref(null)
// A run returns a cleanup fn (close x.ui sockets/timers, or unmount a view app); we
// call it before the next run and on unmount.
let cleanup = null
const teardown = () => {
  cleanup?.()
  cleanup = null
}

// Script-type picker, derived from the registry (single source of truth) so adding a
// type in useScriptTypes.js updates this dropdown automatically.
const scriptTypeOptions = scriptTypes.map((type) => ({ label: type, value: type }))

// Plain 'js' is the default (absent field), so picking it clears scriptType.
const setScriptType = (value) => {
  if (value === 'js') {
    delete props.node.scriptType
  } else {
    props.node.scriptType = value
  }
}

// Live name hints. On load we inject `/*→name*/` right after each x.x("id") so
// the editor shows what the id points at; they're stripped before save so the
// stored source stays clean ids. The `→` marker makes them safe to strip without
// disturbing the user's own comments.
const MARK = / ?\/\*→.*?\*\//g
const stripMarks = (source) => source.replace(MARK, '')
const annotate = (source) =>
  stripMarks(source).replace(/(x\.x\(\s*["'])(\w+)(["'])/g, (_, pre, id, post) => {
    const target = store.nodes.find((nd) => nd.id === id)
    return `${pre}${id}${post} /*→${target?.name ?? '⚠ unknown'}*/`
  })

// Other script nodes this one can call. Identity is the flat id; the label shows
// the human name (+ id) so picking is readable without the id living in source.
const callableOptions = computed(() =>
  store.nodes
    .filter((candidate) => candidate.type === 'script' && candidate.id !== props.node.id)
    .map((candidate) => ({
      label: `${candidate.name || '(unnamed)'}${candidate.scriptType === 'assembly-script' ? ' ⚙' : ''}  ·  ${candidate.id}`,
      value: candidate.id,
    })),
)

onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/body`)
  if (res.ok) {
    const raw = await res.text()
    savedCode.value = stripMarks(raw) // clean baseline for the dirty check
    scriptCode.value = annotate(raw) // shown with name hints
  }
  // Run-on-open: nodes that are really mini-apps (auth token field, the WS
  // tester) auto-run when opened, so their x.ui panel is there without a click.
  if (props.node.runOnOpen) {
    await runScript()
  }
})

const runScript = async () => {
  try {
    // Fresh surface each run: tear down the prior run (x.ui sockets/timers, or unmount
    // the prior view app) before building anew. The scriptType registry does the rest.
    teardown()
    cleanup = await runScriptType(props.node.scriptType || 'js', {
      code: scriptCode.value,
      selfId: props.node.id,
      hostEl: scriptViewRef.value,
      save,
    })
  } catch (err) {
    console.error(`[node ${props.node.id}] run failed:`, err)
  }
}

onBeforeUnmount(teardown)

// Persist script.js — called by NodeItem's single Save. Strips the injected name
// hints so stored source stays clean ids; no-ops if unchanged.
const save = async () => {
  const cleanStr = stripMarks(scriptCode.value)
  if (cleanStr === savedCode.value) {
    return
  }
  await fetch(`/api/nodes/${props.node.id}/body`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: cleanStr,
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
  const target = store.nodes.find((nd) => nd.id === id)
  const snippet = `x.x("${id}" /*→${target?.name ?? '⚠ unknown'}*/)`
  scriptCode.value = scriptCode.value.slice(0, start) + snippet + scriptCode.value.slice(end)
  insertTarget.value = null
  nextTick(() => {
    el?.focus()
    const pos = start + snippet.length
    el?.setSelectionRange(pos, pos)
  })
}

const onKeydown = (event) => {
  if (event.key === 'Tab') {
    event.preventDefault()
    const el = event.target
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
    <n-checkbox v-model:checked="node.runOnOpen" title="Run automatically when this node is opened"
      >Run on open</n-checkbox
    >
    <n-popselect
      v-if="(node.scriptType || 'js') !== 'assembly-script'"
      v-model:value="insertTarget"
      :options="callableOptions"
      trigger="click"
      scrollable
      @update:value="insertCall"
    >
      <n-button size="small" :disabled="callableOptions.length === 0">Insert call</n-button>
    </n-popselect>
    <n-select
      :value="node.scriptType ?? 'js'"
      :options="scriptTypeOptions"
      size="small"
      style="width: 150px; flex-shrink: 0"
      title="How this script node runs: js · vue-esm · vue-sfc · assembly-script"
      @update:value="setScriptType"
    />
  </div>
  <!-- Panel + editor split the body's height equally (see CSS). The panel stays
       collapsed (host empty) until the script adds an x.ui control, so the editor
       gets the full height otherwise; on short windows the body scrolls so neither
       half collapses below its floor. -->
  <div class="script-body">
    <!-- A run mounts here, above the editor: imperative x.ui controls (normal
         scripts) or a mounted view component (vue-esm / vue-sfc). Stays empty
         until a run fills it (x.ui mounts lazily; a view replaces the content). -->
    <div ref="scriptViewRef" class="script-view" />
    <textarea
      ref="txtAreaRef"
      v-model="scriptCode"
      class="editor"
      spellcheck="false"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Scroll container for the (optional) x.ui panel + the editor. It fills the space
   the actions row leaves and scrolls when the panel + editor's min-height exceed
   it, so the editor stays reachable on short windows instead of being squeezed out. */
.script-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Empty until a run fills it (an x.ui control, or a mounted view component). While
   empty it collapses out of the flex flow (`:empty` → display:none) so it consumes
   no height and no `.script-body` gap above the editor; the moment a run mounts
   content it's no longer empty and reappears. */
.script-view {
  flex-shrink: 0;
}

.script-view:empty {
  display: none;
}

.editor {
  flex: 1;
  /* Floor the editor's height: with a tall panel above it this is what forces the
     body to scroll (rather than the editor collapsing to 0). */
  min-height: 220px;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-feature-settings:
    'liga' 0,
    'calt' 0; /* no programming ligatures (=> != ===) */
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
