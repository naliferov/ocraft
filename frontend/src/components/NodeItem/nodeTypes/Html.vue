<script setup>
// Editor for `html` nodes. The body lives in a content.html sidecar (fetched/saved
// via /api/nodes/:id/body), NOT on the node — keeping it out of state.json is
// what keeps the node-list endpoint tiny. Loaded on open, like a script node's
// script.js. Two modes: open → VIEW (renders the HTML read-only); hit Edit → EDIT
// (a contenteditable surface + a toolbar of "parts"). The header's Save persists
// the content via save() below. No height calculation — the body just fills the area.
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { NButton } from 'naive-ui'

const props = defineProps({
  node: { type: Object, required: true },
})

// The node's HTML body, lazy-loaded from its content.html sidecar. `savedContent`
// is the last-persisted copy so save() can skip no-op writes.
const content = ref('')
const savedContent = ref('')
onMounted(async () => {
  const res = await fetch(`/api/nodes/${props.node.id}/body`)
  if (res.ok) {
    content.value = await res.text()
    savedContent.value = content.value
  }
})

// Persist the body to the content.html sidecar — called by NodeItem's single Save.
// No-ops when unchanged so saving metadata-only edits doesn't rewrite the file.
const save = async () => {
  if (content.value === savedContent.value) return
  await fetch(`/api/nodes/${props.node.id}/body`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: content.value,
  })
  savedContent.value = content.value
}
defineExpose({ save })

const editing = ref(false)
// Read mode (view only): constrain the rendered HTML to a comfortable measure
// instead of full window width, so long paragraphs don't run edge-to-edge on
// wide screens. Preference is per-browser and sticks across nodes/sessions.
const READ_MODE_KEY = 'ocraft.html.readMode'
const readMode = ref(localStorage.getItem(READ_MODE_KEY) !== 'false') // default on
watch(readMode, (on) => localStorage.setItem(READ_MODE_KEY, String(on)))
const source = ref(false) // within edit: false = rich (contenteditable), true = raw HTML
const bodyRef = ref(null) // the contenteditable element (rich edit mode only)

// Wikilinks render as plain <a href="/node/:id"> inside v-html, which the router
// can't see — a native click would full-reload the SPA. Intercept clicks on
// internal node links and hand them to vue-router for client-side navigation (it
// re-renders, no reload). External and asset (/api/…) links fall through to the
// browser, and modifier/middle clicks are left alone so "open in new tab" works.
const router = useRouter()
const onViewClick = (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const href = event.target.closest('a')?.getAttribute('href')
  if (!href || !href.startsWith('/node/')) return
  event.preventDefault()
  router.push(href)
}

// Two ways into edit mode, picked from the view bar. editRich seeds the
// contenteditable from `content` imperatively (not v-html) so Vue never re-renders
// it out from under the cursor while typing; the source textarea is v-model-bound
// to `content`, so editSource needs no seeding.
const editRich = async () => {
  source.value = false
  editing.value = true
  await nextTick()
  if (bodyRef.value) bodyRef.value.innerHTML = content.value || ''
}
const editSource = () => {
  source.value = true
  editing.value = true
}

const syncFromDom = () => {
  if (bodyRef.value) content.value = bodyRef.value.innerHTML
}

// The one "insert a part" primitive: execCommand inserts HTML/format at the
// caret and keeps undo working. Deprecated-but-universal; the toolbar doesn't
// care how it's implemented, so the engine can be swapped later.
const exec = (cmd, value = null) => {
  bodyRef.value?.focus()
  document.execCommand(cmd, false, value)
  syncFromDom()
}

const PARTS = [
  { label: 'B', title: 'Bold', run: () => exec('bold') },
  { label: 'I', title: 'Italic', run: () => exec('italic') },
  { label: 'H1', title: 'Heading 1', run: () => exec('formatBlock', 'h1') },
  { label: 'H2', title: 'Heading 2', run: () => exec('formatBlock', 'h2') },
  { label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList') },
  { label: '❝ Quote', title: 'Quote', run: () => exec('formatBlock', 'blockquote') },
  { label: '⎯ Rule', title: 'Divider', run: () => exec('insertHTML', '<hr>') },
]

// --- Link insertion -------------------------------------------------------
// An inline URL input (not a prompt). Focusing the input drops the editor's
// selection, so capture the range when Link is clicked and restore it on apply.
const linkOpen = ref(false)
const linkUrl = ref('')
const linkInputRef = ref(null)
let savedRange = null

const openLink = async () => {
  const sel = window.getSelection()
  savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  linkUrl.value = ''
  linkOpen.value = true
  await nextTick()
  linkInputRef.value?.focus()
}

const cancelLink = () => {
  linkOpen.value = false
  savedRange = null
}

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const normalizeUrl = (u) => (/^(https?:|mailto:|tel:|#|\/)/i.test(u) ? u : `https://${u}`)

const applyLink = () => {
  const raw = linkUrl.value.trim()
  if (!raw) return cancelLink()
  const url = normalizeUrl(raw)
  bodyRef.value?.focus()
  const sel = window.getSelection()
  if (savedRange) {
    sel.removeAllRanges()
    sel.addRange(savedRange)
  }
  if (!savedRange || savedRange.collapsed) {
    // No text selected — drop the URL in as its own linked label.
    const safe = escapeHtml(url)
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${safe}" target="_blank" rel="noopener">${safe}</a>`,
    )
  } else {
    // Wrap the selected text.
    document.execCommand('createLink', false, url)
  }
  syncFromDom()
  linkOpen.value = false
  savedRange = null
}
</script>

<template>
  <div class="html-node">
    <div class="bar">
      <template v-if="editing">
        <n-button size="small" @click="editing = false">Done</n-button>
        <template v-if="!source">
          <button
            v-for="p in PARTS"
            :key="p.label"
            class="tool"
            :title="p.title"
            @mousedown.prevent="p.run"
          >
            {{ p.label }}
          </button>
          <button class="tool" title="Link" @mousedown.prevent="openLink">🔗 Link</button>
        </template>
      </template>
      <template v-else>
        <n-button size="small" @click="editRich">Edit</n-button>
        <n-button size="small" @click="editSource">&lt;/&gt; HTML</n-button>
        <n-button
          size="small"
          :type="readMode ? 'primary' : 'default'"
          :title="
            readMode
              ? 'Reading width on — click for full width'
              : 'Reading width off — click to constrain'
          "
          @click="readMode = !readMode"
          >Read mode: {{ readMode ? 'on' : 'off' }}</n-button
        >
      </template>
    </div>

    <div v-if="editing && !source && linkOpen" class="link-bar">
      <input
        ref="linkInputRef"
        v-model="linkUrl"
        class="link-input"
        placeholder="https://…  (select text first to wrap it)"
        @keydown.enter.prevent="applyLink"
        @keydown.esc="cancelLink"
      />
      <n-button size="small" @click="applyLink">Add link</n-button>
      <n-button size="small" @click="cancelLink">Cancel</n-button>
    </div>

    <div
      v-if="editing && !source"
      ref="bodyRef"
      class="body edit"
      contenteditable="true"
      spellcheck="false"
      @input="syncFromDom"
    />
    <textarea
      v-else-if="editing && source"
      v-model="content"
      class="body source"
      spellcheck="false"
      placeholder="<p>Raw HTML…</p>"
    />
    <div
      v-else
      class="body view"
      :class="{ readable: readMode }"
      @click="onViewClick"
      v-html="content || '<p class=&quot;empty&quot;>Empty — hit Edit to write.</p>'"
    />
  </div>
</template>

<style scoped>
.html-node {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.link-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 8px;
}
.link-input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  font-size: 13px;
  color: #d4d4d4;
  background: #222;
  border: 1px solid #3a6;
  border-radius: 4px;
  outline: none;
}

.tool {
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  color: #d4d4d4;
  background: #222;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
}
.tool:hover {
  background: #2c2c2c;
  border-color: #444;
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  box-sizing: border-box;
  padding: 14px 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.7;
  /* HTML content is a document — render it (view + rich edit) on a white page so
     user markup that brings no background of its own, with default black text,
     looks the way it would in a browser instead of light-on-black. */
  color: #1a1a1a;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.body.edit {
  outline: none;
  border-color: #3a6;
}
/* Read mode: cap the page at a comfortable measure and center it, so long
   paragraphs don't span the full window on wide screens. The body is also the
   scroll container, so narrowing it gives a centered "document page" look. */
.body.view.readable {
  width: 100%;
  max-width: 760px;
  margin-inline: 0;
}
/* Raw HTML source: a light editor too (inherits .body's white page), just monospace. */
.body.source {
  width: 100%;
  outline: none;
  resize: none;
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

/* Rendered HTML lives outside the scoped template, so style it via :deep. */
.body :deep(h1) {
  font-size: 22px;
  margin: 12px 0 6px;
}
.body :deep(h2) {
  font-size: 18px;
  margin: 10px 0 6px;
}
.body :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid #3a6;
  color: #555;
}
.body :deep(hr) {
  border: none;
  border-top: 1px solid #ccc;
  margin: 12px 0;
}
.body :deep(ul) {
  padding-left: 22px;
  margin: 6px 0;
}
.body :deep(a) {
  color: #0066cc;
}
.body :deep(.empty) {
  color: #999;
  font-style: italic;
}
</style>
