<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useNodesStore } from '../../../stores/nodes.js'

// Chat with Claude via the backend's POST /api/ai-chat (Claude Agent SDK).
// History lives on node.messages and is persisted through the nodes store after
// each turn, so the conversation survives reloads like any other node field.
const props = defineProps({ node: { type: Object, required: true } })
const store = useNodesStore()

const input = ref('')
const busy = ref(false)
const scroller = ref(null)

onMounted(() => {
  if (!Array.isArray(props.node.messages)) {
    props.node.messages = []
  }
  scrollToBottom()
})

const scrollToBottom = async () => {
  await nextTick()
  const element = scroller.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

const send = async () => {
  const text = input.value.trim()
  if (!text || busy.value) {
    return
  }
  if (!Array.isArray(props.node.messages)) {
    props.node.messages = []
  }

  props.node.messages.push({ role: 'user', text })
  input.value = ''
  busy.value = true
  await store.save(props.node.id, props.node)
  await scrollToBottom()

  try {
    const response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // send everything except the just-pushed user message — it's the `message`
      body: JSON.stringify({ message: text, history: props.node.messages.slice(0, -1) }),
    })
    const data = await response.json()
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    props.node.messages.push({
      role: 'assistant',
      text: data.text || '(no text returned)',
      tools: data.toolUses ?? [],
      result: data.result ?? null,
    })
  } catch (error) {
    props.node.messages.push({ role: 'assistant', text: `⚠️ ${error.message}`, error: true })
  } finally {
    busy.value = false
    await store.save(props.node.id, props.node)
    await scrollToBottom()
  }
}

const clearChat = async () => {
  props.node.messages = []
  await store.save(props.node.id, props.node)
}
</script>

<template>
  <div class="chat">
    <div ref="scroller" class="messages">
      <div
        v-for="(turn, index) in node.messages ?? []"
        :key="index"
        :class="['msg', turn.role, { error: turn.error }]"
      >
        <div class="role">{{ turn.role }}</div>
        <div class="text">{{ turn.text }}</div>
        <div v-if="turn.tools && turn.tools.length" class="tools">
          🔧 {{ turn.tools.map((tool) => tool.name).join(', ') }}
        </div>
        <div v-if="turn.result" class="meta">
          {{ turn.result.turns }} turns<span v-if="turn.result.cost != null">
            · ${{ turn.result.cost.toFixed(4) }}</span
          >
        </div>
      </div>
      <div v-if="busy" class="msg assistant pending">…working (reading / editing / running)…</div>
      <div v-if="!(node.messages ?? []).length && !busy" class="empty">
        Ask Claude anything about this repo. Full agent — it can read, edit files, and run bash
        here.
      </div>
    </div>

    <div class="composer">
      <textarea
        v-model="input"
        :disabled="busy"
        placeholder="Message Claude (Enter to send, Shift+Enter for newline)…"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <div class="actions">
        <button class="send" :disabled="busy || !input.trim()" @click="send">Send</button>
        <button class="clear" :disabled="busy" @click="clearChat">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 8px;
}
.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
}
.msg {
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
}
.msg.user {
  align-self: flex-end;
  background: #2f6fed;
  color: #fff;
}
.msg.assistant {
  align-self: flex-start;
  background: rgba(127, 127, 127, 0.14);
}
.msg.assistant.error {
  background: rgba(220, 60, 60, 0.16);
}
.msg.pending {
  opacity: 0.6;
  font-style: italic;
}
.role {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.5;
  margin-bottom: 3px;
}
.tools {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.7;
}
.meta {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.45;
}
.empty {
  margin: auto;
  opacity: 0.5;
  text-align: center;
  max-width: 360px;
}
.composer {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.composer textarea {
  flex: 1;
  resize: vertical;
  min-height: 48px;
  max-height: 200px;
  padding: 8px;
  font: inherit;
  border-radius: 8px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.actions button {
  padding: 6px 14px;
}
.clear {
  opacity: 0.7;
  font-size: 12px;
}
</style>
