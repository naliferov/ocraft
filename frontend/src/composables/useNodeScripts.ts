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
  createApp,
} from 'vue'
import { useNodesStore } from '../stores/nodes'
import { compileSfc } from './useVueSfc'
import { mountVue } from './useVueMount'

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
  // Raw Vue createApp — mount your OWN component into any element (e.g. a div from
  // `x.ui.row()`): `x.vue.createApp(cmp).mount(el)`. Build it with render fns (`x.vue.h`):
  // raw createApp does NOT load the template compiler, so a `template:'…'` string would
  // throw. To mount a template-carrying view (e.g. another node's vue-esm component), use
  // `x.vue.mount` below, which compiles lazily.
  createApp,
  // Mount a view component into an element, returning an unmount fn — the SAME helper the
  // view-node path uses, so a `template:'…'` string is compiled for you. Ideal for pulling
  // in another node's component: `const off = await x.vue.mount(host, await x.x('171'))`.
  mount: mountVue,
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

// Build the `x` context passed to a running script. `stack` carries the chain of node ids
// currently executing, so a re-entry is caught as a cycle instead of recursing forever.
// `extras` carries two run-provided capabilities:
//   ui     — the browser UI surface (see useScriptUi.js); top-level editor run only.
//   onStop — register a teardown to run when the RUN stops (re-run / unmount). Unlike ui,
//            it flows into nested x.x calls, so a called node can register run-scoped teardown.
function makeCtx(selfId, args, stack, extras: { ui?: any; onStop?: any } = {}) {
  const { ui, onStop } = extras
  return {
    args,
    log: (...messages) => console.log(`[${nodeLabel(selfId)}]`, ...messages),
    vue: vueApi,
    ...(onStop ? { onStop } : {}),
    ...(ui ? { ui } : {}),
    // x.x(id, args?) — run another node's script by its bare id. `args` is ONE array
    // that becomes the callee's x.args, e.g. x.x('5', [42, 'foo']) → callee sees x.args = [42, 'foo'].
    x: async (targetId, args = []) => {
      const id = String(targetId)
      if (stack.includes(id)) {
        throw new Error(`call cycle: ${[...stack, id].join(' → ')}`)
      }
      const mod = await loadModule(id)
      if (typeof mod.default !== 'function') {
        throw new Error(`node "${id}": script has no default export to call`)
      }
      // Nested calls inherit onStop (run lifecycle) but not ui (UI is top-level only).
      return await mod.default(makeCtx(id, args, [...stack, id], { onStop }))
    },
  }
}

// Run a raw source string as node `selfId` (e.g. the current editor buffer, which may be
// unsaved). Its ctx.x resolves OTHER nodes from their saved scripts via the loader. `extras`
// ({ ui, onStop }) are the run-provided capabilities exposed on `x` — passed by the run,
// absent for headless runs.
export async function runNodeCode(code, selfId, extras = {}) {
  const id = String(selfId)
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    if (typeof mod.default !== 'function') {
      throw new Error('script has no default export')
    }
    return await mod.default(makeCtx(id, [], [id], extras))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Compile + return an SFC view component (node.scriptType = 'vue-sfc'). The body is .vue
// source, not JS — so there's no blob import; useVueSfc compiles it and we hand it
// the same `x` context the esm path gets, so <script setup> can call x.x.
export async function runSfcCode(source, selfId) {
  const id = String(selfId)
  return compileSfc(source, makeCtx(id, [], [id]))
}
