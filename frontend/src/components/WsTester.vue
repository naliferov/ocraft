<script setup>
// Minimal WebSocket tester. Visit /ws. Connect to a ws/wss endpoint, send text,
// and watch the message/event log. Throwaway debugging UI for the cloud WS exchange.
import { ref, onBeforeUnmount, nextTick } from 'vue'

const url = ref('wss://stream.x8.deno.net/ws')
const message = ref('')
const status = ref('idle') // idle | connecting | open | closed | error
const log = ref([])        // { dir: 'up'|'down'|'sys', text, ts }
const logEl = ref(null)

let ws = null

const stamp = () => new Date().toLocaleTimeString()

const push = async (dir, text) => {
  log.value.push({ dir, text, ts: stamp() })
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
}

const connect = () => {
  disconnect() // drop any existing socket first
  status.value = 'connecting'
  push('sys', `connecting → ${url.value}`)
  try {
    ws = new WebSocket(url.value)
  } catch (err) {
    status.value = 'error'
    push('sys', `bad URL: ${err.message}`)
    return
  }
  ws.onopen = () => { status.value = 'open'; push('sys', 'open ✅') }
  ws.onmessage = (e) => {
    const data = typeof e.data === 'string' ? e.data : `[binary ${e.data.size ?? e.data.byteLength ?? '?'} bytes]`
    push('down', data)
  }
  ws.onerror = () => { status.value = 'error'; push('sys', 'error ❌ (see devtools Network/Console)') }
  ws.onclose = (e) => { status.value = 'closed'; push('sys', `closed 🔌 code=${e.code}${e.reason ? ' reason=' + e.reason : ''}`) }
}

const disconnect = () => {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
}

const send = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    push('sys', 'not connected — hit Connect first')
    return
  }
  ws.send(message.value)
  push('up', message.value)
  message.value = ''
}

const clear = () => { log.value = [] }

onBeforeUnmount(disconnect)
</script>

<template>
  <div class="ws">
    <h2>WebSocket tester</h2>

    <div class="row">
      <input v-model="url" class="url" placeholder="wss://host/path" @keydown.enter="connect" />
      <button class="btn" @click="connect">Connect</button>
      <button class="btn" @click="disconnect">Disconnect</button>
      <span class="status" :class="status">{{ status }}</span>
    </div>

    <div class="row">
      <input v-model="message" class="msg" placeholder="message to send" @keydown.enter="send" />
      <button class="btn" @click="send">Send</button>
      <button class="btn ghost" @click="clear">Clear</button>
    </div>

    <div ref="logEl" class="log">
      <div v-for="(e, i) in log" :key="i" class="line" :class="e.dir">
        <span class="ts">{{ e.ts }}</span>
        <span class="arrow">{{ e.dir === 'up' ? '↑' : e.dir === 'down' ? '↓' : '·' }}</span>
        <span class="text">{{ e.text }}</span>
      </div>
      <div v-if="!log.length" class="empty">No messages yet — Connect, then Send.</div>
    </div>
  </div>
</template>

<style scoped>
.ws {
  max-width: 720px;
  margin: 24px auto;
  padding: 0 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #d4d4d4;
}
h2 { font-size: 18px; margin: 0 0 16px; }
.row { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
.url, .msg {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #d4d4d4;
  outline: none;
  font-size: 13px;
}
.btn {
  height: 30px;
  padding: 0 12px;
  background: #222;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover { background: #2c2c2c; }
.btn.ghost { opacity: 0.7; }
.status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #333;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.status.open { background: #2d4a3a; color: #9f9; }
.status.connecting { background: #4a432d; color: #fe9; }
.status.error { background: #4a2d2d; color: #f99; }
.status.closed { background: #3a3a3a; color: #aaa; }

.log {
  height: 360px;
  overflow: auto;
  background: #141414;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 10px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
.line { display: flex; gap: 8px; white-space: pre-wrap; word-break: break-word; }
.ts { color: #666; flex-shrink: 0; }
.arrow { width: 12px; flex-shrink: 0; text-align: center; }
.line.up .arrow, .line.up .text { color: #6cf; }
.line.down .arrow, .line.down .text { color: #9f9; }
.line.sys .text { color: #999; font-style: italic; }
.empty { color: #555; font-style: italic; }
</style>
