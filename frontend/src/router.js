import { createRouter, createWebHistory } from 'vue-router'
import NodeItem from './components/NodeItem/NodeItem.vue'
import { useNodesStore } from './stores/nodes.js'
import { checkAuth } from './lib/apiAuth.js'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '' } },
    // /login is rendered by App.vue (shell-level, no router-view) — the route just
    // needs to exist so it's navigable. App reads route.path to show <Login>.
    { path: '/login', component: { template: '' } },
    { path: '/node/:id', component: NodeItem },
  ],
})

// One explicit auth gate. Ask the server who we are (GET /api/session — ungated, never
// 401s), then route on the answer instead of probing data and treating a 401 as logged-out:
//  - on /login while already authed → home (nothing to log into)
//  - on any other page while not authed → /login
//  - authed and entering the app → make sure the node tree is loaded
router.beforeEach(async (to) => {
  const authed = await checkAuth()
  if (to.path === '/login') {
    return authed ? '/' : true
  }
  if (!authed) {
    return '/login'
  }
  const store = useNodesStore()
  if (!store.nodes.length) {
    await store.load()
  }
})
