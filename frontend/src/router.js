import { createRouter, createWebHistory } from 'vue-router'
import NodeItem from './components/NodeItem/NodeItem.vue'
import WsTester from './components/WsTester.vue'
import { useNodesStore } from './stores/nodes.js'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '' } },
    { path: '/node/:id', component: NodeItem },
    { path: '/ws', component: WsTester },
  ]
})

router.beforeEach(async () => {
  const store = useNodesStore()
  if (!store.nodes.length) await store.load()
})
