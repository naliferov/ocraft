import { createRouter, createWebHistory } from 'vue-router'
import NodeItem from './components/NodeItem/NodeItem.vue'
import { useNodesStore } from './stores/nodes.js'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '' } },
    { path: '/node/:id', component: NodeItem },
  ],
})

router.beforeEach(async () => {
  const store = useNodesStore()
  if (!store.nodes.length) {
    await store.load()
  }
})
