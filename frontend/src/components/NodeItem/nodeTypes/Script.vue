<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { NButton, NPopselect, NCheckbox, NSelect } from 'naive-ui'
import { useNodesStore } from '../../../stores/nodes'
import { clearCache } from '../../../composables/useNodeScripts'
import { runScriptType, scriptTypes } from '../../../composables/useScriptTypes'

const props = defineProps({
  node: { type: Object, required: true },
})

const store = useNodesStore()
const scriptCode = ref('')
const savedCode = ref('') // last persisted script.js — lets save() skip no-op writes
const editorHost = ref(null)
let editor = null // CodeMirror handle ({ setLanguage, insertAtCursor, destroy })
const insertTarget = ref(null) // bound model for the picker; reset after each pick

// Host above the editor for whatever a run produces — EITHER the script's imperative
const scriptViewRef = ref(null)
// A run returns a cleanup fn (close x.ui sockets/timers, or unmount a view app); we call it
// before the next run and on unmount. Defaults to a no-op so calling it is always safe.
let cleanup = () => {}

// Script-type picker, derived from the registry (single source of truth) so adding a
// type in useScriptTypes.js updates this dropdown automatically.
const scriptTypeOptions = scriptTypes.map((type) => ({ label: type, value: type }))

// Store the picked type explicitly on the node — 'js' included, no "absent = js" sentinel.
const setScriptType = (value) => {
  props.node.scriptType = value
}

// Live name hints. On load we inject `/*→name*/` right after each x.x("id") so
// the editor shows what the id points at; stripped before save
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
      label: `${candidate.name || '(unnamed)'}  ·  ${candidate.id}`,
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
  // Dynamic import keeps CodeMirror in its own chunk, fetched only when a script node opens.
  const { createCodeEditor } = await import('../../../composables/useCodeEditor')
  editor = createCodeEditor({
    parent: editorHost.value,
    doc: scriptCode.value,
    scriptType: props.node.scriptType ?? 'js',
    onChange: (text) => {
      scriptCode.value = text
    },
    onRun: runScript,
  })
  if (props.node.runOnOpen) {
    await runScript()
  }
})

watch(
  () => props.node.scriptType,
  (type) => editor?.setLanguage(type ?? 'js'),
)

const runScript = async () => {
  try {
    cleanup() // tear down the previous run
    cleanup = () => {} // blank it BEFORE the await — mid-run unmount/re-run must hit a no-op
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

onBeforeUnmount(() => {
  cleanup()
  editor?.destroy()
})

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

// Insert `x.x("<id>" /*→name*/)` at the cursor
const insertCall = (id) => {
  const target = store.nodes.find((nd) => nd.id === id)
  editor?.insertAtCursor(`x.x("${id}" /*→${target?.name ?? '⚠ unknown'}*/)`)
  insertTarget.value = null
}
</script>

<template>
  <div class="actions">
    <n-button size="small" title="⌘⏎" @click="runScript">Run</n-button>
    <n-checkbox v-model:checked="node.runOnOpen" title="Run automatically when this node is opened"
      >Run on open</n-checkbox
    >
    <n-popselect
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
      title="How this script node runs: js · vue-esm · vue-sfc"
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
    <div ref="editorHost" class="editor" />
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
  overflow: hidden;
  border: 1px solid #333;
  border-radius: 4px;
}

/* CodeMirror creates its DOM imperatively, so scoped styles need :deep(). Font,
   colors, and sizing live in the EditorView.theme in useCodeEditor.js. */
.editor :deep(.cm-editor) {
  height: 100%;
}
</style>
