<script setup>
// The /login screen — a shell-level (not a node) token gate, so it works before any
// /api call succeeds (you can't reach a node-based login: loading nodes needs auth).
// Submitting POSTs the token to /api/login; on success the backend sets an HttpOnly
// session cookie and the browser carries it from then on — JS never holds the token.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput } from 'naive-ui'
import { login } from '../lib/apiAuth.js'

const router = useRouter()
const token = ref('')
const error = ref('')
const busy = ref(false)

const connect = async () => {
  const value = token.value.trim()
  if (!value || busy.value) {
    return
  }
  error.value = ''
  busy.value = true
  try {
    if (await login(value)) {
      router.push('/') // cookie is set; the router guard re-loads the store with it
    } else {
      error.value = 'Invalid token.'
    }
  } catch {
    error.value = 'Could not reach the server.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="card">
      <h1 class="brand">ocraft</h1>
      <n-input
        v-model:value="token"
        type="password"
        show-password-on="click"
        placeholder="API token"
        size="large"
        :disabled="busy"
        @keyup.enter="connect"
      />
      <n-button
        type="primary"
        size="large"
        block
        :loading="busy"
        :disabled="!token.trim()"
        @click="connect"
      >
        Connect
      </n-button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.card {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}
.brand {
  margin: 0;
  font-size: 1.4em;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.hint {
  margin: 0;
  font-size: 0.85em;
  opacity: 0.6;
  line-height: 1.5;
}
.hint code {
  color: #ffd56b;
}
.error {
  margin: 0;
  font-size: 0.85em;
  color: #e57;
}
</style>
