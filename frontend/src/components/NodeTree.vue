<script setup>
// Recursive sidebar tree. Renders a list of nodes (each carrying a `children`
// array built by the store) and recurses into NodeTree for nested levels.
const props = defineProps({
  nodes: { type: Array, required: true },
  activeId: { type: String, default: null },
  depth: { type: Number, default: 0 },
})

const emit = defineEmits(['select', 'toggle'])

// Collapse state is the node's own `collapsed` flag (from state.json). Toggling
// is emitted up to the store, which flips the flag and persists it, so the choice
// survives reloads; the tree re-renders reactively once the flag changes.
const isCollapsed = (n) => !!n.collapsed
const toggle = (n) => emit('toggle', n.id)
const isCategory = (n) => n.type === 'category'
</script>

<template>
  <div class="tree">
    <template v-for="n in nodes" :key="n.id">
      <div
        class="row"
        :class="{ active: n.id === activeId }"
        :style="{ paddingLeft: `${depth * 14 + 6}px` }"
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

        <span class="label" @click="emit('select', n.id)">
          <span v-if="isCategory(n)" class="folder">▦</span>
          {{ n.name }}
        </span>
      </div>

      <NodeTree
        v-if="n.children.length && !isCollapsed(n)"
        :nodes="n.children"
        :active-id="activeId"
        :depth="depth + 1"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
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
</style>
