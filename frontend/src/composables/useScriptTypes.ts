// Script-type registry: how a `script` node RUNS, by its state.json `scriptType`.
//
// A script node's body runs one of a few ways, picked by `scriptType` (absent = 'js'):
//   js               normal `export default (x) => {…}`; gets an imperative x.ui panel
//   vue-esm          `export default (x) => Component`; mounts (template compiled lazily)
//   vue-sfc          a real .vue source; compiled at runtime, then mounts
//
// Each type's run() executes the body and returns a `cleanup()` (so teardown is uniform
// — close x.ui sockets, unmount a view app, …). Adding a flavor (react-esm, vue-sfc-ts,
// …) is ONE entry in SCRIPT_TYPES; Script.vue just calls runScriptType() and never
// branches on the type. Mounting-into-an-element is the seam for other frameworks:
// react → createRoot(el).render(), svelte → new C({target:el}), solid → render().

import { mountVue } from './useVueMount'
import { runNodeCode, runSfcCode } from './useNodeScripts'
import { createScriptUi } from './useScriptUi'

async function runJs(code, selfId, hostEl) {
  const ui = createScriptUi(hostEl) // imperative x.ui drawing surface, mounted into the host
  
  // The RUN owns the lifecycle: `x.onStop(fn)` registers
  const teardowns = []
  const onStop = (fn) => {
    if (typeof fn === 'function') {
      teardowns.push(fn)
    }
  }
  await runNodeCode(code, selfId, { ui, onStop })

  return () => {
    while (teardowns.length) {
      try {
        teardowns.pop()()
      } catch (err) {
        console.error('[script onStop] failed:', err)
      }
    }
    hostEl.replaceChildren()
  }
}
async function runVue(produce, code, selfId, hostEl) {
  const component = await produce(code, selfId)
  return component ? mountVue(hostEl, component) : null
}

const SCRIPT_TYPES = {
  js: (opts) => runJs(opts.code, opts.selfId, opts.hostEl),
  'vue-esm': (opts) => runVue(runNodeCode, opts.code, opts.selfId, opts.hostEl),
  'vue-sfc': (opts) => runVue(runSfcCode, opts.code, opts.selfId, opts.hostEl),
}

// The registered script types — drives the editor's type picker (single source of truth).
export const scriptTypes = Object.keys(SCRIPT_TYPES)

// Returns a cleanup fn.
export const runScriptType = async (type, opts) => {
  return SCRIPT_TYPES[type](opts)
}
