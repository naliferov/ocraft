import { createRouter, createWebHistory } from 'vue-router'
import ArtifactItem from './components/ArtifactItem.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/artifact/:id', component: ArtifactItem }
  ]
})
