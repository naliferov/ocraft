/// <reference types="vite/client" />

// Ambient module shims so `tsc`/`vue-tsc` can resolve non-.ts imports. Vite/esbuild
// handle these at build time; the type checker needs the declarations to not error.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

// A CSS import is a side effect (the styles are injected by Vite); it has no shape.
declare module '*.css'
