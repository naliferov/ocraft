// Mount a Vue view component into a host element, returning an unmount fn.
//
// Shared by the view-node run path (useScriptTypes.js) AND plain scripts that mount a view
// by hand (x.vue.mount, useNodeScripts.js), so both get the same lazy template compilation.
// A raw `template:'…'` string needs @vue/compiler-dom; render fns and compiled SFCs don't.
// This module imports only 'vue', so neither of its consumers forms an import cycle.
import * as VueRuntime from 'vue'
import { createApp, registerRuntimeCompiler } from 'vue'

// On-demand Vue template compilation. The app keeps the DEFAULT runtime-only Vue (no build
// change). The first time a template string mounts we lazily import @vue/compiler-dom and
// register it as the runtime compiler on the app's ONE Vue instance. Two wins over aliasing
// the whole app to the full build: (1) ONE Vue runtime — a view shares reactivity with the
// app/pinia; (2) the import() is code-split, fetched only when such a view runs. (vue-sfc
// bodies arrive already compiled to a render fn, so they never need this.)
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
        const render = new Function('Vue', code)(VueRuntime)
        // Mark it runtime-compiled (Vue's own compileToFunction does this). Without `_rc`,
        // Vue's render proxy treats the render fn's `with(_ctx)` identifier probes as stray
        // property access and logs "Property undefined was accessed during render" for every
        // template view. This flag tells the proxy the access is legitimate.
        render._rc = true
        return (cache[key] = render)
      }
      registerRuntimeCompiler(compileToFunction)
    })
  }
  return compilerReady
}

// Mount a component into a host element; the returned fn unmounts it. A dedicated app rooted
// at the host isolates the view and unmounts cleanly (its onUnmounted hooks fire).
export async function mountVue(hostEl, component) {
  // Only a raw `template` string needs the compiler; render-fn / compiled-SFC don't.
  if (component && typeof component.template === 'string') {
    await ensureVueCompiler()
  }
  const app = createApp(component)
  app.mount(hostEl)
  return () => app.unmount()
}
