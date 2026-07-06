<script setup lang="ts">
import { ref, shallowRef, defineAsyncComponent, type Component } from 'vue'

const modules = import.meta.glob<{ default: Component }>('../scripts/*.vue')

const toName = (path: string) => path.split('/').pop()!.replace(/\.vue$/, '')

const scripts = Object.keys(modules)
  .map((path) => ({ path, name: toName(path) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const activePath = ref<string | null>(null)
const activeComponent = shallowRef<Component | null>(null)

// URL <-> selection: /script/<name>. Reload keeps the open script (and shows its fresh
// version), direct links work, back/forward navigate. Names for now; fs paths maybe later.
const show = (path: string | null) => {
  activePath.value = path
  activeComponent.value = path ? defineAsyncComponent(modules[path]) : null
  document.title = path ? `devlab · ${toName(path)}` : 'devlab'
}

const pathFromUrl = () => {
  const match = location.pathname.match(/^\/script\/(.+)$/)
  const name = match && decodeURIComponent(match[1])
  return scripts.find((s) => s.name === name)?.path ?? null
}

const open = (path: string) => {
  history.pushState(null, '', `/script/${encodeURIComponent(toName(path))}`)
  show(path)
}

window.addEventListener('popstate', () => show(pathFromUrl()))
show(pathFromUrl())

const theme = ref<'dark' | 'light'>((localStorage.getItem('devlab.theme') as 'dark' | 'light') ?? 'light')
const applyTheme = () => (document.documentElement.dataset.theme = theme.value)
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('devlab.theme', theme.value)
  applyTheme()
}
applyTheme()
</script>

<template>
  <div class="flex h-screen bg-base-100 text-base-content">
    
    <aside class="flex w-60 shrink-0 flex-col border-r border-base-300">
      <div class="flex items-center justify-between border-b border-base-300 p-4">
        <span class="text-lg font-bold">devlab</span>
        <button class="btn btn-ghost btn-xs" @click="toggleTheme">{{ theme === 'dark' ? '☀' : '☾' }}</button>
      </div>
      <ul class="menu flex-1 flex-nowrap overflow-y-auto">
        <li v-for="s in scripts" :key="s.path">
          <a :class="{ active: s.path === activePath }" @click="open(s.path)">{{ s.name }}</a>
        </li>
        <li v-if="!scripts.length" class="p-3 text-xs opacity-50">no scripts in ../scripts</li>
      </ul>
      <div class="border-t border-base-300 p-3 text-xs opacity-50">{{ scripts.length }} scripts</div>
    </aside>

    <main class="flex-1 overflow-auto">
      <div v-if="activeComponent" :key="activePath!" class="p-6">
        <component :is="activeComponent" />
      </div>
      <div v-else class="grid h-full place-items-center opacity-40">
        <p>select a script</p>
      </div>
    </main>
  </div>
</template>
