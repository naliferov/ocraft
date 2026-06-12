<script setup>
import { computed, ref, nextTick } from 'vue'
import { NSelect, NButton } from 'naive-ui'
import { useNodesStore } from '../../stores/nodes.js'
import SceneEditor from './editors/SceneEditor.vue'
import ScriptEditor from './editors/ScriptEditor.vue'
import HtmlEditor from './editors/HtmlEditor.vue'
import StreamEditor from './editors/StreamEditor.vue'
import CategoryEditor from './editors/CategoryEditor.vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const store = useNodesStore()
// The single Save: persists state.json (name, type, and whatever the active
// editor mutated on `node`), then asks the active editor to persist anything it
// owns separately — e.g. ScriptEditor's script.js. Editors that keep everything
// on `node` (html, scene, …) expose no save() and are covered by the write above.
const editorRef = ref(null)
const save = async () => {
  await store.save(props.node.id, props.node)
  await editorRef.value?.save?.()
}

// Registry of node type -> editor: the single source of truth for both the type
// picker and which component renders. Adding a node type = one entry here.
// `hidden: true` keeps the component mapping (so existing nodes of that type still
// render) but drops it from the type picker — used to park a not-yet-ready type.
const EDITORS = {
  scene: { label: 'scene', component: SceneEditor },
  script: { label: 'script', component: ScriptEditor },
  html: { label: 'html', component: HtmlEditor },
  stream: { label: 'stream', component: StreamEditor, hidden: true }, // parked — see IDEAS.md
  category: { label: 'category', component: CategoryEditor },
}

const typeOptions = Object.entries(EDITORS)
  .filter(([, e]) => !e.hidden)
  .map(([value, { label }]) => ({ label, value }))

const nodeType = computed({
  get: () => props.node.type ?? 'scene',
  set: (val) => { props.node.type = val === 'scene' ? undefined : val }
})

const editor = computed(() => (EDITORS[nodeType.value] ?? EDITORS.scene).component)

// Click the name to rename. `name` is just a display label — a node's id is its
// folder name and never changes. Editing only mutates node.name in place (the
// sidebar tree reads the same store data, so it updates live); persistence is
// left to the editor's own Save button, like every other field — no autosave.
const editingName = ref(false)
const nameInput = ref(null)
const nameLabel = ref(null)
// Size the edit input to the label it replaces, so swapping span -> input doesn't
// shift the header's height or width. Measured from the live span before the swap.
const inputStyle = ref({})

const startRename = async () => {
  const el = nameLabel.value
  if (el) {
    const r = el.getBoundingClientRect()
    // min-width (not width) floors the input at the label's size — no jump on
    // open — while letting it grow with content (see .name-input CSS).
    inputStyle.value = {
      minWidth: `${Math.max(Math.ceil(r.width), 30)}px`,
      height: `${Math.ceil(r.height)}px`,
    }
  }
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

const commitName = () => {
  editingName.value = false // value already lives on node.name; Save persists it
}
</script>

<template>
  <div class="wrap">
    <div class="info">
      <input
        v-if="editingName"
        ref="nameInput"
        class="name name-input"
        :style="inputStyle"
        :size="Math.max((node.name || '').length + 1, 2)"
        v-model="node.name"
        @keyup.enter="commitName"
        @blur="commitName"
      />
      <span v-else ref="nameLabel" class="name" title="Click to rename" @click="startRename">{{ node.name }}</span>
      <n-select
        v-model:value="nodeType"
        :options="typeOptions"
        size="small"
        style="width: 110px; flex-shrink: 0;"
      />
      <n-button size="small" @click="save">Save</n-button>
      <span class="desc">{{ node.description }}</span>
    </div>

    <component :is="editor" :node="node" ref="editorRef" />
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  gap: 12px;
  overflow: hidden;
}

.info {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.name {
  font-weight: 600;
}

span.name {
  cursor: pointer;
}

/* No border/padding and box-sizing: border-box, so the measured width/height map
   1:1 onto the label's box — the text keeps its exact position; only a faint
   background signals edit mode. */
.name-input {
  box-sizing: border-box;
  /* Grow with content: field-sizing sizes the input to its text natively
     (Chromium); the bound `size` attribute is the fallback elsewhere. min-width
     (from :style) keeps it from shrinking below the label it replaced. */
  field-sizing: content;
  max-width: 100%;
  font: inherit;
  font-weight: 600;
  color: inherit;
  border: none;
  padding: 0;
  margin: 0;
  border-radius: 3px;
  /* Edit-mode cue: faint fill + an accent ring. Both `background` and `outline`
     are layout-neutral, so the box keeps the label's exact size/position. */
  background: rgba(255, 255, 255, 0.08);
  outline: 1.5px solid #3d7eff;
  outline-offset: 2px;
}

.desc {
  opacity: 0.5;
  font-size: 0.85em;
}
</style>
