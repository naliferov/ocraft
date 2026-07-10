<script setup lang="ts">
import { ref } from 'vue'
// System prompt lives in the harness doc, loaded offline at build time (no ocraft api needed).
import systemPrompt from '../docs/harness.html?raw'

const blocks = ref<{ kind: 'model' | 'tool' | 'error'; text: string }[]>([])
const BLOCK_COLOR = { model: 'text-success', tool: 'text-info', error: 'text-error' }
const ctxText = ref(systemPrompt)
const model = ref('')
const effort = ref('')
const prompt = ref('')
const statusText = ref('')
const totals = { tokens: 0, cost: 0 }

// Conversation history — the whole context, held in the browser. Every turn we serialize this
// array into the prompt and resend it. Tool results live here too.
const messages: { role: 'user' | 'assistant' | 'tool'; text: string }[] = []
const PREFIX = { user: 'User: ', assistant: 'Assistant: ', tool: 'Tool results:\n' }

const addBlock = (kind: 'model' | 'tool' | 'error') => {
  const block = { kind, text: '' }
  blocks.value.push(block)
  return block
}

// Parse a reply for <tool NAME>…</tool> blocks → [{ name, body }].
const parseToolCalls = (text: string) =>
  [...text.matchAll(/<tool\s+(\w+)>([\s\S]*?)<\/tool>/g)].map((match) => ({
    name: match[1],
    body: match[2].trim(),
  }))

// Run one call in page context. Only `eval` for now.
const runToolCall = ({ name, body }: { name: string; body: string }) => {
  if (name !== 'eval') {
    return `error: unknown tool "${name}"`
  }
  try {
    // eslint-disable-next-line no-eval
    return JSON.stringify((window as any).eval(body))
  } catch (err: any) {
    return `error: ${err.message}`
  }
}

// One request: send the whole history, wait for the full reply, show it, return its text.
const callModel = async () => {
  const promptText = messages.map((message) => PREFIX[message.role] + message.text).join('\n\n')
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: promptText,
      system: ctxText.value || undefined,
      model: model.value || undefined,
      effort: effort.value || undefined,
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }
  const { text, usage, cost } = await res.json()
  const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens } = usage
  totals.tokens += input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens
  totals.cost += cost ?? 0
  statusText.value = `${totals.tokens} tokens · $${totals.cost.toFixed(4)}`
  addBlock('model').text = text
  return text
}

// Agent loop: call the model, run any tool calls, feed results back, repeat until the
// model's reply has no tool call — that absence is our "done" signal.
const send = async () => {
  const text = prompt.value.trim()
  if (!text) return
  prompt.value = ''
  blocks.value = []
  messages.push({ role: 'user', text })
  try {
    let calls: { name: string; body: string }[] = []
    do {
      const reply = await callModel()
      messages.push({ role: 'assistant', text: reply })
      calls = parseToolCalls(reply)
      if (calls.length) {
        const results = calls.map(runToolCall)
        addBlock('tool').text = calls.map((call, i) => `${call.name} ⇒ ${results[i]}`).join('\n')
        messages.push({
          role: 'tool',
          text: results.map((result) => `<result>${result}</result>`).join('\n'),
        })
      }
    } while (calls.length)
  } catch (err: any) {
    addBlock('error').text = err.message
  }
}

const clearHistory = () => {
  messages.length = 0
  blocks.value = []
  statusText.value = 'history cleared'
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-3">
    <div class="min-h-[120px] max-h-[420px] overflow-auto rounded border border-base-300 bg-base-200 p-3 font-mono text-[12.5px] leading-relaxed">
      <div
        v-for="(b, i) in blocks"
        :key="i"
        class="mt-2 first:mt-0 whitespace-pre-wrap break-words"
        :class="BLOCK_COLOR[b.kind]"
      >{{ b.text }}</div>
    </div>
    <textarea
      v-model="ctxText"
      spellcheck="false"
      class="textarea textarea-bordered min-h-[100px] w-full resize-y font-mono text-[12.5px] whitespace-pre-wrap"
      placeholder="system prompt sent with every request (loaded from the harness doc)"
    ></textarea>
    <div class="flex gap-2">
      <input v-model="model" class="input input-sm input-bordered w-56" placeholder="model (haiku / sonnet / opus / …)" />
      <input v-model="effort" class="input input-sm input-bordered w-36" placeholder="effort (low…max)" />
    </div>
    <textarea
      v-model="prompt"
      spellcheck="false"
      class="textarea textarea-bordered min-h-[70px] w-full resize-y"
      placeholder="prompt — Enter to send, Shift+Enter for newline"
      @keydown.enter.exact.prevent="send"
    ></textarea>
    <div class="flex items-center gap-2">
      <button class="btn btn-sm btn-primary" @click="send">send</button>
      <button class="btn btn-sm" @click="clearHistory">clear</button>
      <span class="text-sm opacity-60">{{ statusText }}</span>
    </div>
  </div>
</template>
