// VIEW node (state.json has "view": "vue"). Unlike a normal script —
// `export default (x) => { …side effects… }` — a view script's default export is
// `(x) => Component`: a factory that returns a Vue component. Clicking Run mounts
// it above the editor. `x.vue` gives the reactivity/render API (blob modules can't
// `import` from 'vue'), and the `template` string compiles on the fly because the
// app uses the full Vue build (vite.config alias).
//
// The factory still gets the full `x`, so a view can call other nodes (x.x),
// read tokens (x.auth), etc. — it's a node program that happens to render UI.
export default (x) => {
  const { ref, computed } = x.vue
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  return {
    setup() {
      return { count, doubled, inc: () => count.value++ }
    },
    template: `
      <div style="display:flex;gap:12px;align-items:center;font-family:sans-serif;color:#d4d4d4">
        <button @click="inc" style="padding:6px 12px;cursor:pointer">count {{ count }}</button>
        <span>doubled = {{ doubled }}</span>
      </div>
    `,
  }
}
