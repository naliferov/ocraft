import { createRouter, createWebHistory } from 'vue-router'
import NodeItem from './components/NodeItem.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/node/:id', component: NodeItem }
  ]
})
