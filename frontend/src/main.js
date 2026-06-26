import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router.js'
import App from './App.vue'
import '/src/css/index.css'

// Mount only AFTER the first navigation resolves. The auth guard checks /api/session and
// may redirect to /login (or /); mounting earlier flashes the empty app shell (sidebar)
// for a moment before that redirect. Waiting for router.isReady() renders straight to the
// right place. .catch keeps us mounting even if the initial nav errored (e.g. backend down).
const app = createApp(App).use(createPinia()).use(router)
router.isReady().catch(() => {}).then(() => app.mount('#app'))
