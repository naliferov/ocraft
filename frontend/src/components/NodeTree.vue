<script setup>
// Recursive sidebar tree. Renders a list of nodes (each carrying a `children`
// array built by the store) and recurses into NodeTree for nested levels.
import { ref, nextTick } from 'vue'

const props = defineProps({
  nodes: { type: Array, required: true },
  activeId: { type: String, default: null },
  depth: { type: Number, default: 0 },
  // Active search needle (already trimmed). Highlights matching rows and, with
  // `expandAll`, forces every branch open so matches aren't hidden by collapse.
  query: { type: String, default: '' },
  expandAll: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'toggle', 'create', 'rename', 'remove', 'reparent'])

// Collapse state is the node's own `collapsed` flag (from state.json). Toggling
// is emitted up to the store, which flips the flag and persists it, so the choice
// survives reloads; the tree re-renders reactively once the flag changes.
// While searching, ignore the stored collapse flag so matched branches show.
const isCollapsed = (node) => (props.expandAll ? false : !!node.collapsed)
const toggle = (node) => emit('toggle', node.id)
const isCategory = (node) => node.type === 'category'
const isMatch = (node) =>
  !!props.query && (node.name || '').toLowerCase().includes(props.query.toLowerCase())

// Drag a node onto a category to reparent it. Native HTML5 DnD carries the dragged
// id in dataTransfer, so it crosses recursive NodeTree instances without shared
// state. Only categories are drop targets; the store applies the cycle guard.
const dragOverId = ref(null)
const onDragStart = (node, event) => {
  event.dataTransfer.setData('text/plain', node.id)
  event.dataTransfer.effectAllowed = 'move'
  // The default drag image is a tight, edge-to-edge snapshot of the bare label,
  // so the dragged name looks cramped. Build a padded chip with the same font as
  // the source label and use it as the drag image; remove it once the browser has
  // taken its snapshot (next tick).
  const sourceLabel = event.currentTarget
  const computed = getComputedStyle(sourceLabel)
  const ghost = document.createElement('div')
  ghost.textContent = node.name ?? ''
  ghost.style.cssText = [
    'position:fixed',
    'top:-1000px',
    'left:-1000px',
    'pointer-events:none',
    // Horizontal padding only — no vertical padding/space; the chip hugs the text.
    'padding:0 12px',
    'line-height:1.2',
    'border-radius:6px',
    'white-space:nowrap',
    'background:#fff',
    'border:1px solid rgba(0,0,0,0.12)',
    'box-shadow:0 4px 14px rgba(0,0,0,0.18)',
  ].join(';')
  // Inherit the label's actual text styling so the ghost matches the active theme.
  ghost.style.color = computed.color
  ghost.style.fontFamily = computed.fontFamily
  ghost.style.fontSize = computed.fontSize
  ghost.style.fontWeight = computed.fontWeight
  document.body.appendChild(ghost)
  // Anchor the ghost under the cursor at the same point where it grabbed the
  // original label, so the ghost stays on the source row's X level instead of
  // jumping sideways. (+12 compensates for the ghost's left padding, which the
  // label itself doesn't have.)
  const labelRect = sourceLabel.getBoundingClientRect()
  const anchorX = event.clientX - labelRect.left + 12
  const anchorY = event.clientY - labelRect.top
  event.dataTransfer.setDragImage(ghost, anchorX, anchorY)
  setTimeout(() => ghost.remove(), 0)
}
const onDragOver = (node, event) => {
  if (!isCategory(node)) return
  event.preventDefault() // preventDefault here is what marks the row a valid drop target
  event.dataTransfer.dropEffect = 'move'
  dragOverId.value = node.id
}
const onDragLeave = (node) => {
  if (dragOverId.value === node.id) dragOverId.value = null
}
const onDrop = (node, event) => {
  if (!isCategory(node)) return
  event.preventDefault()
  const draggedId = event.dataTransfer.getData('text/plain')
  dragOverId.value = null
  if (draggedId && draggedId !== node.id) emit('reparent', { id: draggedId, parentId: node.id })
}

// Inline rename: a row swaps its label for an input. Per-instance state is fine —
// each row is rendered by exactly one NodeTree instance (its depth level).
const renamingId = ref(null)
const renameDraft = ref('')
const renameInput = ref(null)
const startRename = async (node) => {
  renamingId.value = node.id
  renameDraft.value = node.name ?? ''
  await nextTick()
  // A ref on an element inside v-for is collected as an array; only one input
  // renders at a time, so focus the first (and only) entry.
  const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
  input?.focus()
}
const commitRename = (node) => {
  if (renamingId.value !== node.id) return
  const name = renameDraft.value.trim()
  if (name && name !== node.name) emit('rename', { id: node.id, name })
  renamingId.value = null
}

// Delete asks for a native confirm first; removed nodes still go to the store's undo
// pool, so the "Recently deleted" restore remains the safety net after confirming.
const requestRemove = (node) => {
  if (confirm(`Delete "${node.name}"?`)) emit('remove', node.id)
}
</script>

<template>
  <div class="tree">
    <template v-for="n in nodes" :key="n.id">
      <div
        class="row"
        :class="{ active: n.id === activeId, 'drop-target': dragOverId === n.id }"
        :style="{ paddingLeft: `${depth * 14 + 6}px` }"
        @dragover="onDragOver(n, $event)"
        @dragleave="onDragLeave(n)"
        @drop="onDrop(n, $event)"
      >
        <svg
          v-if="n.children.length"
          class="caret"
          :class="{ 'caret--open': !isCollapsed(n) }"
          viewBox="0 0 24 24"
          @click.stop="toggle(n)"
        >
          <path
            d="M9 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span v-else class="caret caret--empty"></span>

        <input
          v-if="renamingId === n.id"
          ref="renameInput"
          v-model="renameDraft"
          class="rename-input"
          @keyup.enter="commitRename(n)"
          @keyup.esc="renamingId = null"
          @blur="commitRename(n)"
        />
        <span
          v-else
          class="label"
          :class="{ match: isMatch(n) }"
          draggable="true"
          @click="emit('select', n.id)"
          @dragstart="onDragStart(n, $event)"
        >
          <span v-if="isCategory(n)" class="folder">▦</span>
          {{ n.name }}
        </span>

        <span v-if="renamingId !== n.id" class="actions">
          <button
            v-if="isCategory(n)"
            class="act"
            title="New child node"
            @click.stop="emit('create', n.id)"
          >
            +
          </button>
          <button class="act" title="Rename" @click.stop="startRename(n)">✎</button>
          <button class="act act--danger" title="Delete" @click.stop="requestRemove(n)">🗑</button>
        </span>
      </div>

      <NodeTree
        v-if="n.children.length && !isCollapsed(n)"
        :nodes="n.children"
        :active-id="activeId"
        :depth="depth + 1"
        :query="query"
        :expand-all="expandAll"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @create="emit('create', $event)"
        @rename="emit('rename', $event)"
        @remove="emit('remove', $event)"
        @reparent="emit('reparent', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
  line-height: 1.8;
}
.row.active {
  background: rgba(255, 255, 255, 0.08);
}
/* Highlight a category row while a node is dragged over it (valid drop target). */
.row.drop-target {
  background: rgba(61, 126, 255, 0.22);
  outline: 1px solid #3d7eff;
}
.caret {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  cursor: pointer;
  opacity: 0.6;
  transition: transform 0.12s ease;
}
.caret--open {
  transform: rotate(90deg);
}
.caret--empty {
  cursor: default;
}
.label {
  cursor: pointer;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder {
  opacity: 0.6;
  margin-right: 2px;
}
/* Search hit: tint the matching row's name so it stands out in the pruned tree. */
.label.match {
  color: #ffd56b;
  font-weight: 600;
}
.rename-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 3px;
  outline: 1.5px solid #3d7eff;
  padding: 0 2px;
}
/* Actions are hidden until row hover (or while a confirm is pending), so the
   tree stays clean. flex-shrink:0 keeps them from being squeezed by long names. */
.actions {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s ease;
}
.row:hover .actions {
  opacity: 1;
}
.act {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 0.85em;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
}
.act:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}
.act--danger:hover {
  background: rgba(255, 80, 80, 0.25);
}
</style>
