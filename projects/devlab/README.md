# devlab

Offline Vue-component playground for fast dev experiments. Each **script is a `.vue` component** (a
full little app) under `scripts/`. The sidebar lists them; click one and it mounts. No backend,
auth, DB, editor, or runtime engine — Vite compiles the components, and one script reuses another
with a normal `import`.

Styling is **Tailwind v4 + daisyUI v5**: build UI from plain template elements + daisyUI classes
(`btn`, `card`, `modal`, …). A script that needs a heavy interactive widget can `import` a Vue
component lib (Naive UI / PrimeVue) in that one `.vue`.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/ (static, fully offline)
npm run preview
npm run typecheck  # vue-tsc
```

(from repo root: `npm --prefix projects/devlab run dev`)

## Add a script

Drop a `.vue` file in `scripts/`. It appears in the sidebar automatically (filename = its name). In
dev, HMR reloads on save; in a built bundle, rebuild.

```vue
<!-- scripts/hello.vue -->
<script setup lang="ts">
import { ref } from 'vue'
const who = ref('world')
</script>
<template>
  <div class="card w-fit bg-base-200 shadow"><div class="card-body">hello {{ who }}</div></div>
</template>
```

Reuse another script by importing it: `import Clock from './clock.vue'` (see `dashboard.vue`).

## Import scripts from ocraft (one-off, best-effort)

Pulls your existing ocraft **script nodes** into files. Clean `vue-sfc` nodes become runnable
`.vue`; anything using the ocraft `x` API (`x.x`, `x.ui`, …) or a plain `js`/`vue-esm` node is dumped
to `scripts/_legacy/*.txt` to hand-port (it can't be mechanically converted).

```
OCRAFT_URL=https://ocraft.dev OCRAFT_COOKIE='ocraft_session=…' node import-from-ocraft.js
```

`OCRAFT_URL` defaults to `http://127.0.0.1:3001`. The cookie is required (the API is auth-gated);
copy it from browser devtools → Application → Cookies.
