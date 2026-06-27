<script setup>
// The terminal: a single input that drives the node OS by typed commands —
// the MVP seed of the "command-first / terminal interface" direction. Mounted once,
// app-level, pinned along the bottom of the window. A command is `name arg arg…`;
// `COMMANDS[name].run` does the work and `print()`s feedback into a scrollback.
// Adding a feature to the bar = one entry in COMMANDS — that registry is what lets
// it grow into a feature switcher (open/new/run/search…) later.
import { ref, computed, watch, nextTick } from 'vue'
import { useNodesStore } from '../stores/nodes.js'

const store = useNodesStore()

const input = ref('')
const busy = ref(false)
const focused = ref(false) // prompt focused → show the command autocomplete list
const scrollRef = ref(null) // the terminal's scroll flow, for auto-scroll to the newest line
const inputRef = ref(null) // the command <input>, for click-anywhere-to-focus
// Terminal scrollback, newest last. Each line is { text, kind } where kind picks the
// colour ('cmd' echo, 'ok', 'error', 'info'). Capped — it's a mini-terminal, not a log.
const lines = ref([])
const print = (text, kind = 'info') => {
  lines.value.push({ text, kind })
  if (lines.value.length > 100) {
    lines.value.shift()
  }
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

// Resizable height (px): drag the top handle to grow/shrink the terminal. Persisted
// per browser like the html read-mode pref; clamped between the input row and ~60% of
// the viewport. The handle is at the top, so dragging up (smaller clientY) grows it.
const HEIGHT_KEY = 'ocraft.terminal.height'
const MIN_HEIGHT = 42
const terminalHeight = ref(Number(localStorage.getItem(HEIGHT_KEY)) || 80)
const startResize = (event) => {
  const startY = event.clientY
  const startHeight = terminalHeight.value
  document.body.style.userSelect = 'none' // don't select text while dragging
  const onMove = (move) => {
    const max = window.innerHeight * 0.6
    terminalHeight.value = Math.min(max, Math.max(MIN_HEIGHT, startHeight + startY - move.clientY))
  }
  const onUp = () => {
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    localStorage.setItem(HEIGHT_KEY, String(Math.round(terminalHeight.value)))
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const COMMANDS = {
  format: {
    desc: 'pretty-print the open html note (client-side)',
    needs: 'html',
    // Pretty-print the active html note's body in the browser (prettier's standalone build,
    // no backend) — same dispatch route as `edit-html`: flips no API, just asks the open
    // node's view to run its `format` command (see Html.vue VIEW_COMMANDS / formatContent.js).
    run: () => {
      const node = store.activeNode
      if (node?.type !== 'html') {
        print(`format: open an html note first (current: ${node ? node.type ?? 'html' : 'none'})`, 'error')
        return
      }
      store.dispatchViewCommand('format')
      print(`#${node.id} — formatted`, 'ok')
    },
  },
  'edit-html': {
    desc: 'edit the open note as raw html',
    needs: 'html',
    // Enter raw-HTML ("pure html") source editing on the active html note — the action
    // that used to be the </> HTML button. Not an API call: it flips local UI state in
    // the open node's view, so we route it through the store and the Html component
    // reacts (see dispatchViewCommand in stores/nodes.js).
    run: () => {
      const node = store.activeNode
      if (node?.type !== 'html') {
        print(`edit-html: open an html note first (current: ${node ? node.type ?? 'html' : 'none'})`, 'error')
        return
      }
      store.dispatchViewCommand('source')
      print(`#${node.id} — editing raw html`, 'ok')
    },
  },
  'mv-to-root': {
    desc: 'move the open node to the tree root',
    // Move a node out to the root level (parentId → null) — the un-nest action the
    // tree's drag-and-drop can't do (it only drops *into* categories). Target is an
    // explicit `#id` arg, else the open node.
    run: async ({ args }) => {
      const [idArg] = args
      const id = idArg ?? store.activeNodeId
      const node = store.nodes.find((candidate) => candidate.id === id)
      if (!node) {
        print(id ? `no node #${id}` : 'no node open', 'error')
        return
      }
      if (!node.parentId) {
        print(`#${node.id} is already at root`, 'info')
        return
      }
      await store.reparent(node.id, null)
      print(`#${node.id} (${node.name}) moved to root`, 'ok')
    },
  },
}

// Command history — Up/Down recall previously-run commands (shell-style). historyIndex
// is null while typing fresh; `draft` preserves the in-progress line so Down past the
// newest restores it. Persisted to localStorage (like the terminal height) so it
// survives reloads, capped to the most recent HISTORY_MAX entries.
const HISTORY_KEY = 'ocraft.terminal.history'
const HISTORY_MAX = 200
const loadHistory = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}
const history = ref(loadHistory())
let historyIndex = null
let draft = ''
const historyPrev = () => {
  if (!history.value.length) {
    return
  }
  if (historyIndex === null) {
    draft = input.value
    historyIndex = history.value.length
  }
  historyIndex = Math.max(0, historyIndex - 1)
  input.value = history.value[historyIndex]
}
const historyNext = () => {
  if (historyIndex === null) {
    return
  }
  historyIndex += 1
  if (historyIndex >= history.value.length) {
    historyIndex = null
    input.value = draft
  } else {
    input.value = history.value[historyIndex]
  }
}

const run = async () => {
  const text = input.value.trim()
  if (!text || busy.value) {
    return
  }
  print(`› ${text}`, 'cmd')
  if (history.value[history.value.length - 1] !== text) {
    history.value.push(text) // record it (skip a consecutive duplicate)
    if (history.value.length > HISTORY_MAX) {
      history.value.shift() // cap to the most recent N
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  }
  historyIndex = null
  input.value = ''
  const [name, ...args] = text.split(/\s+/)
  const command = COMMANDS[name]
  if (!command) {
    print(`unknown command: ${name} (available: ${Object.keys(COMMANDS).join(', ')})`, 'error')
    return
  }
  busy.value = true
  try {
    await command.run({ args })
  } catch (error) {
    print(error.message, 'error')
  } finally {
    busy.value = false
  }
}

// Longest common prefix of a set of strings — Tab completes to the unambiguous stem.
const longestCommonPrefix = (strings) => {
  let prefix = strings[0] ?? ''
  for (const str of strings) {
    while (!str.startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
    }
  }
  return prefix
}

// Tab-complete the command name (first token) from COMMANDS, shell-style: a single
// match completes it (+ a trailing space); several complete to the shared stem, or
// list the candidates when there's no more stem to add. Args aren't completed (yet).
const complete = () => {
  const text = input.value
  if (text.includes(' ')) {
    return
  }
  const matches = Object.keys(COMMANDS).filter((name) => name.startsWith(text))
  if (!matches.length) {
    return
  }
  if (matches.length === 1) {
    input.value = `${matches[0]} `
    return
  }
  const prefix = longestCommonPrefix(matches)
  if (prefix.length > text.length) {
    input.value = prefix
  } else {
    print(matches.join('   '), 'info')
  }
}

// Click anywhere in the terminal focuses the prompt (like a real terminal app) — but
// not mid-selection, so dragging to select/copy output still works.
const focusInput = () => {
  if (window.getSelection()?.toString()) {
    return
  }
  inputRef.value?.focus()
}

// Live command autocomplete: while typing the command name (first token, before any
// space), list ONLY the commands you can run on the open node — global ones (no `needs`)
// plus the ones whose `needs` matches the node type. Nothing else is ever shown; you
// discover a node type's commands by opening that node. Click one to fill it; Tab still
// shell-completes (see complete()).
const suggestions = computed(() => {
  if (input.value.includes(' ')) {
    return []
  }
  const typed = input.value.trim().toLowerCase()
  const node = store.activeNode
  return Object.entries(COMMANDS)
    .filter(
      ([name, command]) =>
        name.toLowerCase().startsWith(typed) && (!command.needs || node?.type === command.needs),
    )
    .map(([name, command]) => ({ name, desc: command.desc ?? '' }))
})
// Only while actually typing a command name — never on bare focus/click (no menu
// popping up just because the prompt is focused).
const showSuggestions = computed(
  () => focused.value && input.value.trim().length > 0 && suggestions.value.length > 0,
)

// The list renders in-flow just above the prompt, so it grows the terminal content —
// keep the prompt in view when it appears/changes (it's where you're typing).
watch(suggestions, () => {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
})

// Fill the prompt with a clicked suggestion, keeping focus (mousedown.prevent in the
// template stops the input blurring before this runs).
const pick = (name) => {
  input.value = `${name} `
  inputRef.value?.focus()
}
</script>

<template>
  <div class="cmd" :style="{ height: terminalHeight + 'px' }">
    <div class="cmd-handle" title="Drag to resize" @mousedown.prevent="startResize" />
    <div ref="scrollRef" class="cmd-scroll" @click="focusInput">
      <div v-for="(line, index) in lines" :key="index" class="cmd-line" :class="line.kind">
        {{ line.text }}
      </div>
      <!-- Command autocomplete: plain terminal lines right above the prompt (not a
           floating box), shown only while typing a command name. Click one to fill it;
           mousedown.prevent keeps the prompt focused so the click doesn't blur it away. -->
      <div v-if="showSuggestions" class="cmd-suggest">
        <div
          v-for="suggestion in suggestions"
          :key="suggestion.name"
          class="cmd-suggest-item"
          @mousedown.prevent="pick(suggestion.name)"
        >
          <span class="cmd-suggest-name">{{ suggestion.name }}</span>
          <span class="cmd-suggest-desc">{{ suggestion.desc }}</span>
        </div>
      </div>
      <div class="cmd-row">
        <span class="cmd-prompt">›</span>
        <input
          ref="inputRef"
          v-model="input"
          class="cmd-input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          :disabled="busy"
          @focus="focused = true"
          @blur="focused = false"
          @keydown.enter="run"
          @keydown.tab.prevent="complete"
          @keydown.up.prevent="historyPrev"
          @keydown.down.prevent="historyNext"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmd {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* A white "card" surface (matching the html document body) set off from the dark app
     by a hairline top frame — dark text on white for max readability. Height is
     drag-controlled via .cmd-handle. */
  background: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-feature-settings:
    'liga' 0,
    'calt' 0;
  font-size: 13px;
}
/* Thin top divider that doubles as the resize grip: drag it to set the terminal
   height. The 1px line is the visible bar; it lights up green on hover. */
.cmd-handle {
  flex-shrink: 0;
  height: 7px;
  border-top: 1px solid #ccc;
  cursor: ns-resize;
}
.cmd-handle:hover {
  border-top-color: #999;
}
/* Autocomplete: in-flow lines right above the prompt, styled like terminal output (no
   floating box, no border) so it reads as part of the terminal, not a popup over the
   node view. */
.cmd-suggest-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  cursor: pointer;
  line-height: 1.5;
}
.cmd-suggest-item:hover .cmd-suggest-name {
  text-decoration: underline;
}
.cmd-suggest-name {
  flex: 0 0 auto;
  color: #1f1f1f;
}
.cmd-suggest-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #999;
}
.cmd-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cmd-prompt {
  color: #888;
}
.cmd-input {
  flex: 1;
  height: 22px;
  padding: 0;
  font: inherit;
  color: #1f1f1f;
  background: none;
  border: none;
  outline: none;
}
.cmd-input:disabled {
  opacity: 0.5;
}
/* Output and the prompt share one top-aligned scroll flow — like a real terminal:
   content fills from the top, the input is the last line (so it's at the top when
   empty), and older output stays above newer. Auto-scrolls to the newest line. */
.cmd-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 12px;
  cursor: text; /* click anywhere here focuses the prompt (see focusInput) */
}
.cmd-line {
  white-space: pre-wrap;
  line-height: 1.5;
  color: #555;
}
.cmd-line.cmd {
  color: #1f1f1f;
}
.cmd-line.ok {
  color: #1a8a4a;
}
.cmd-line.error {
  color: #c0392b;
}
</style>
