<script setup>
import { computed, ref, nextTick } from 'vue'
import { NSelect, NButton } from 'naive-ui'
import { useNodesStore } from '../../stores/nodes.js'
import Script from './nodeTypes/Script.vue'
import Html from './nodeTypes/Html.vue'
import Category from './nodeTypes/Category.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const store = useNodesStore()
// The single Save: persists state.json (name, type, and whatever the active
// node-type component mutated on `node`), then asks that component to persist
// anything it owns separately — e.g. Script's script.js. Components that keep
// everything on `node` (Html, …) expose no save() and are covered above.
const componentRef = ref(null)
const save = async () => {
  await store.save(props.node.id, props.node)
  await componentRef.value?.save?.()
}

// Registry of node type -> component: the single source of truth for both the
// type picker and which component renders. Adding a node type = one entry here.
// `hidden: true` keeps the mapping (so existing nodes of that type still render)
// but drops it from the type picker — used to park a not-yet-ready type.
const NODE_TYPES = {
  html: { label: 'html', component: Html },
  script: { label: 'script', component: Script },
  category: { label: 'category', component: Category },
}

const typeOptions = Object.entries(NODE_TYPES)
  .filter(([, nodeTypeDef]) => !nodeTypeDef.hidden)
  .map(([value, { label }]) => ({ label, value }))

const nodeType = computed({
  get: () => props.node.type ?? 'html',
  set: (val) => {
    props.node.type = val
  },
})

// No silent fallback: an unknown type resolves to null so the template can show an
// explicit "no handler for this type" card. (Untyped/legacy nodes resolve to 'html'
// via nodeType's getter above — only a genuinely unregistered type lands here as null.)
const activeComponent = computed(() => NODE_TYPES[nodeType.value]?.component ?? null)

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
    const rect = el.getBoundingClientRect()
    // min-width (not width) floors the input at the label's size — no jump on
    // open — while letting it grow with content (see .name-input CSS).
    inputStyle.value = {
      minWidth: `${Math.max(Math.ceil(rect.width), 30)}px`,
      height: `${Math.ceil(rect.height)}px`,
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
      <span class="node-id" title="Node id">#{{ node.id }}</span>
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="node.name"
        class="name name-input"
        :style="inputStyle"
        :size="Math.max((node.name || '').length + 1, 2)"
        @keyup.enter="commitName"
        @blur="commitName"
      />
      <span v-else ref="nameLabel" class="name" title="Click to rename" @click="startRename">{{
        node.name
      }}</span>
      <n-select
        v-model:value="nodeType"
        :options="typeOptions"
        size="small"
        style="width: 110px; flex-shrink: 0"
      />
      <n-button size="small" @click="save">Save</n-button>
      <span class="desc">{{ node.description }}</span>
    </div>

    <component :is="activeComponent" v-if="activeComponent" ref="componentRef" :node="node" />
    <div v-else class="no-handler">
      <p>
        No handler for type <code>{{ node.type }}</code
        >.
      </p>
      <p>
        This node exists and is addressable, but no view is registered for its type. Pick a known
        type from the selector above, or register a handler for
        <code>{{ node.type }}</code> in <code>NODE_TYPES</code> (NodeItem.vue).
      </p>
    </div>
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

.node-id {
  font-family: 'JetBrains Mono', monospace;
  font-feature-settings:
    'liga' 0,
    'calt' 0; /* no programming ligatures */
  font-size: 0.7em;
  color: #999;
  flex-shrink: 0;
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

/* Shown when a node's type has no registered handler (was a silent fallback to
   Scene). Naming the type + pointing at the picker/registry turns the dead end
   into an authoring cue instead of a blank canvas. */
.no-handler {
  margin: auto;
  max-width: 460px;
  padding: 20px 24px;
  border: 1px dashed #555;
  border-radius: 8px;
  color: #bbb;
  font-size: 0.9em;
  line-height: 1.5;
  text-align: center;
}
.no-handler code {
  color: #ffd56b;
}
</style>
