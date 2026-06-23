// Runtime compiler for `node.scriptType = 'vue-sfc'` — author a node's view as a real
// Single-File Component:
//
//   <script setup>
//   const count = ref(0)                 // ref/computed/… are auto-available
//   const inc = () => { count.value++; x.log('hi', count.value) }  // `x` is in scope
//   </script>
//   <template><button @click="inc">count {{ count }}</button></template>
//   <style>button { color: #6cf }</style>
//
// @vue/compiler-sfc ships a browser ESM build (the one the official SFC Playground
// uses), imported lazily here (code-split — only fetched when an SFC view first
// runs). We compile <script setup> with the template inlined, rewrite its
// `import … from 'vue'` to pull from the app's SINGLE Vue instance (so reactivity
// stays shared — no second Vue), and build the component with
// `new Function('Vue', 'x', …)`. A `with (Vue)` wrapper makes the auto-imported
// composition API (`ref`, `computed`, …) and explicit imports BOTH resolve, and `x`
// (the node runtime) is a parameter so <script setup> can call x.x / x.auth / etc.
//
// <style> blocks are auto-scoped to the component's unique id (data-v-<id>) and
// injected for its mounted lifetime, so a plain <style> can't bleed into other views.

import * as VueRuntime from 'vue'

let sfcCompiler = null
const loadCompiler = () => (sfcCompiler ||= import('@vue/compiler-sfc'))

let seq = 0

// Turn the compiler's ES-module output into a function body runnable with the app's
// Vue + the node `x` in scope. Only 'vue' imports are allowed (use `x` for the rest).
function toFactoryBody(content) {
  const rewritten = content
    .replace(
      /import\s+\{([^}]*)\}\s+from\s*['"]vue['"];?/g,
      (_, names) => `const {${names.replace(/\s+as\s+/g, ': ')}} = Vue;`,
    )
    .replace(/export\s+default\s+/g, 'return ')
  const leftover = rewritten.match(/^\s*import\s.+/m)
  if (leftover) {
    throw new Error(
      `vue-sfc: only imports from 'vue' are supported (found "${leftover[0].trim()}"). Use x for everything else.`,
    )
  }
  // `with (Vue)` so both auto-imported (bare `ref`) and explicit-import usage resolve.
  return `with (Vue) {\n${rewritten}\n}`
}

// Compile an SFC source string to a mountable Vue component, with `x` injected.
export async function compileSfc(source, ctx) {
  const { parse, compileScript, compileStyle } = await loadCompiler()
  const id = 'ocsfc' + seq++
  const { descriptor, errors } = parse(source, { filename: `${id}.vue` })
  if (errors.length) {
    throw new Error(`vue-sfc parse error: ${errors[0].message}`)
  }
  if (!descriptor.template && !descriptor.scriptSetup && !descriptor.script) {
    throw new Error('vue-sfc: empty component — need a <template> and/or <script setup>')
  }

  // Force every <style> to scoped so it's namespaced to this component's unique id
  // (data-v-<id>): the inline template gets the scopeId (descendants tagged too) and
  // the component carries __scopeId. So even a plain <style> can't bleed across views.
  const scopeId = 'data-v-' + id
  const hasStyles = descriptor.styles.length > 0
  if (hasStyles) {
    descriptor.styles.forEach((style) => (style.scoped = true))
  }

  const script = compileScript(descriptor, {
    id,
    inlineTemplate: !!descriptor.template,
    ...(hasStyles ? { templateOptions: { scoped: true, compilerOptions: { scopeId } } } : {}),
  })
  const component = new Function('Vue', 'x', toFactoryBody(script.content))(VueRuntime, ctx)

  if (hasStyles) {
    component.__scopeId = scopeId
    const css = descriptor.styles
      .map(
        (style) =>
          compileStyle({ source: style.content, id: scopeId, scoped: true, filename: `${id}.vue` })
            .code,
      )
      .join('\n')
      .trim()
    if (css) {
      const userSetup = component.setup
      component.setup = (props, setupCtx) => {
        const el = document.createElement('style')
        el.textContent = css
        VueRuntime.onMounted(() => document.head.append(el))
        VueRuntime.onUnmounted(() => el.remove())
        return userSetup ? userSetup(props, setupCtx) : undefined
      }
    }
  }
  return component
}
