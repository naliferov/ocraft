import {
  ref,
  reactive,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  defineComponent,
  markRaw,
  h,
  isVNode,
  nextTick,
} from 'vue'
import { useNodesStore } from '../stores/nodes.js'
import { compileSfc } from './useVueSfc.js'

// Vue surface handed to scripts as `x.vue`. Blob-imported script modules can't
// resolve bare imports (`import { ref } from 'vue'` — no import map), so the
// reactivity + render API is injected through the context instead. A VIEW script
// (node.scriptType = 'vue-esm'/'vue-sfc') use these to build a component; a plain script
// can use them too (e.g. a reactive computation). It's the app's own (runtime-only) Vue —
// a `template` string compiles via the lazily-registered compiler (useScriptTypes.js).
const vueApi = {
  ref,
  reactive,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  defineComponent,
  markRaw,
  h,
  isVNode,
  nextTick,
  // ocraft sugar for view nodes: build a component from a template + its bindings,
  // skipping the `{ setup: () => bindings, template }` boilerplate. `bindings` is the
  // setup return (refs/handlers from the factory closure):
  //   return x.vue.view(`<button @click="inc">{{ count }}</button>`, { count, inc })
  // One root instance per mounted view, so sharing the bindings object is fine.
  view: (template, bindings = {}) => ({ setup: () => bindings, template }),
}

// Runtime for "scripts calling other scripts by id".
//
// A node script is `export default (x) => { ... }`. The `x` (context) handed in
// lets a script invoke ANOTHER node's script by its bare id via `x.x(id, ...)`:
//
//   export default async (x) => {
//     const out = await x.x("5", [42])   // run node 5's script with args [42]
//     return out
//   }
//
// Identity is the flat numeric id — no path, no alias, no manifest. The editor
// makes the id readable (the picker shows the name at authoring time); only the
// stable id is ever stored in the source.
//
// Frontend-only on purpose: node scripts execute solely in the browser (blob
// import), unlike backend *entries* which run via executor.js. The `x` shape is
// kept simple so it can be reimplemented backend-side later if headless node
// execution is ever needed.

// id -> Promise<module>. Cached so repeated calls don't re-fetch/re-import.
// Cleared whenever a script is saved (see clearCache), so edits take effect.
const moduleCache = new Map()

export function clearCache() {
  moduleCache.clear()
}

async function loadModule(id) {
  if (!moduleCache.has(id)) {
    moduleCache.set(
      id,
      (async () => {
        const res = await fetch(`/api/nodes/${id}/body`)
        if (!res.ok) {
          throw new Error(`node "${id}": no script found`)
        }
        const code = await res.text()
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
        try {
          return await import(/* @vite-ignore */ url)
        } finally {
          URL.revokeObjectURL(url)
        }
      })(),
    )
  }
  return moduleCache.get(id)
}

// Resolve a node id to a "name (id)" label for log prefixes, via the store.
const nodeLabel = (id) => {
  const node = useNodesStore().nodes.find((candidate) => candidate.id === id)
  return node?.name ? `${node.name} (${id})` : `node ${id}`
}

// Build the `x` context passed to a running script. `stack` carries the chain
// of node ids currently executing, so a re-entry is caught as a cycle instead of
// recursing forever. `ui` is the browser UI surface (see useScriptUi.js); it's
// present only for the top-level editor run and omitted for nested x.x calls.
function makeCtx(selfId, args, stack, ui) {
  return {
    args,
    log: (...messages) => console.log(`[${nodeLabel(selfId)}]`, ...messages),
    vue: vueApi,
    ...(ui ? { ui } : {}),
    // x.x(id, ...args) — run another node's script by its bare id.
    // x.x(id, args?) — args is an ARRAY of arguments (becomes the callee's x.args).
    x: async (targetId, args = []) => {
      const id = String(targetId)
      if (stack.includes(id)) {
        throw new Error(`call cycle: ${[...stack, id].join(' → ')}`)
      }
      const mod = await loadModule(id)
      if (typeof mod.default !== 'function') {
        throw new Error(`node "${id}": script has no default export to call`)
      }
      return await mod.default(makeCtx(id, args, [...stack, id]))
    },
  }
}

// Run a raw source string as node `selfId` (e.g. the current editor buffer,
// which may be unsaved). Its ctx.call resolves OTHER nodes from their saved
// scripts via the loader. `ui` (optional) is the browser UI surface exposed to
// the script as `x.ui` — passed by the editor, absent for headless runs.
export async function runNodeCode(code, selfId, ui) {
  const id = String(selfId)
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    if (typeof mod.default !== 'function') {
      throw new Error('script has no default export')
    }
    return await mod.default(makeCtx(id, [], [id], ui))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Compile + return an SFC view component (node.scriptType = 'vue-sfc'). The body is .vue
// source, not JS — so there's no blob import; useVueSfc compiles it and we hand it
// the same `x` context the esm path gets, so <script setup> can call x.x / x.auth.
export async function runSfcCode(source, selfId) {
  const id = String(selfId)
  return compileSfc(source, makeCtx(id, [], [id]))
}
