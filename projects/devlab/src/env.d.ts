/// <reference types="vite/client" />

// Ambient shims so vue-tsc can resolve non-.ts imports (Vite handles them at build time).
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

declare module '*.css'
