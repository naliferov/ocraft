// Script-type registry: how a `script` node RUNS, by its state.json `scriptType`.
//
// A script node's body runs one of a few ways, picked by `scriptType` (absent = 'js'):
//   js               normal `export default (x) => {…}`; gets an imperative x.ui panel
//   vue-esm          `export default (x) => Component`; mounts (template compiled lazily)
//   vue-sfc          a real .vue source; compiled at runtime, then mounts
//   assembly-script  AssemblyScript → wasm (compiled on the backend from SAVED source)
//
// Each type's run() executes the body and returns a `cleanup()` (so teardown is uniform
// — close x.ui sockets, unmount a view app, …). Adding a flavor (react-esm, vue-sfc-ts,
// …) is ONE entry in SCRIPT_TYPES; Script.vue just calls runScriptType() and never
// branches on the type. Mounting-into-an-element is the seam for other frameworks:
// react → createRoot(el).render(), svelte → new C({target:el}), solid → render().

import * as VueRuntime from 'vue'
import { createApp, registerRuntimeCompiler } from 'vue'
import { runNodeCode, runSfcCode, runWasmNode } from './useNodeScripts.js'
import { createScriptUi } from './useScriptUi.js'

// On-demand Vue template compilation (vue-esm components carrying a `template:'…'`).
//
// The app keeps the DEFAULT runtime-only Vue (no build change). The first time a
// template string mounts we lazily import @vue/compiler-dom and register it as the
// runtime compiler on the app's ONE Vue instance. Two wins over aliasing the whole app
// to the full build: (1) ONE Vue runtime — a view shares reactivity with the app/pinia;
// (2) the import() is code-split, fetched only when such a view runs. (vue-sfc bodies
// arrive already compiled to a render fn, so they never need this.)
let compilerReady = null
function ensureVueCompiler() {
  if (!compilerReady) {
    compilerReady = import('@vue/compiler-dom').then(({ compile }) => {
      const cache = Object.create(null)
      // Mirrors Vue's own compileToFunction: compile to code, then `new Function` it
      // with the app's runtime helpers (single runtime — the render fn calls `Vue.*`).
      const compileToFunction = (template, options) => {
        if (typeof template !== 'string') {
          template = template?.nodeType ? template.innerHTML : ''
        }
        const key = template + (options ? JSON.stringify(options) : '')
        if (cache[key]) {
          return cache[key]
        }
        const { code } = compile(template, { hoistStatic: true, ...options })
        return (cache[key] = new Function('Vue', code)(VueRuntime))
      }
      registerRuntimeCompiler(compileToFunction)
    })
  }
  return compilerReady
}

// Mount a Vue component into a host element; cleanup unmounts the app. A dedicated app
// rooted at the host isolates the view and unmounts cleanly (its onUnmounted hooks fire).
async function mountVue(hostEl, component) {
  // Only a raw `template` string needs the compiler; render-fn / compiled-SFC don't.
  if (component && typeof component.template === 'string') {
    await ensureVueCompiler()
  }
  const app = createApp(component)
  app.mount(hostEl)
  return () => app.unmount()
}

// --- per-type run helpers (each returns a cleanup fn, or null) ---
async function runJs(code, selfId, hostEl) {
  const ui = createScriptUi(hostEl) // imperative x.ui panel, mounted into the host
  await runNodeCode(code, selfId, ui.ui)
  return () => ui.cleanup()
}
async function runVue(produce, code, selfId, hostEl) {
  const component = await produce(code, selfId)
  return component ? mountVue(hostEl, component) : null
}
async function runAssemblyScript(selfId, save) {
  await save() // wasm compiles from the SAVED source on the backend — persist first
  await runWasmNode(selfId)
  return null
}

// --- registry: scriptType → run({ code, selfId, hostEl, save }) => cleanup|null ---
const SCRIPT_TYPES = {
  js: (opts) => runJs(opts.code, opts.selfId, opts.hostEl),
  'vue-esm': (opts) => runVue(runNodeCode, opts.code, opts.selfId, opts.hostEl),
  'vue-sfc': (opts) => runVue(runSfcCode, opts.code, opts.selfId, opts.hostEl),
  'assembly-script': (opts) => runAssemblyScript(opts.selfId, opts.save),
}

// The registered script types — drives the editor's type picker (single source of truth).
export const scriptTypes = Object.keys(SCRIPT_TYPES)

// Run a node body by its scriptType (absent/unknown → 'js'). Returns a cleanup fn.
export async function runScriptType(type, opts) {
  return (SCRIPT_TYPES[type] ?? SCRIPT_TYPES.js)(opts)
}
