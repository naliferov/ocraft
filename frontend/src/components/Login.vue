<script setup>
// The /login screen — a shell-level (not a node) gate, shown when there's no session. Email+password
// is the default: "Sign in" logs into an existing account, "Create account" makes a new one (sign-in
// IS sign-up). The server reports what's available: emailAuthEnabled (off in prod, which is
// Google-only) and googleConfigured (the Google button shows only when set). On success the session
// cookie is set and we navigate home (the router re-checks).
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NAlert } from 'naive-ui'
import { login, signup, loginWithGoogle, getSession } from '../lib/apiAuth.js'

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const loaded = ref(false)
const googleConfigured = ref(false)
const emailAuthEnabled = ref(false)

onMounted(async () => {
  const session = await getSession()
  googleConfigured.value = session.googleConfigured
  emailAuthEnabled.value = session.emailAuthEnabled
  loaded.value = true
})

const submit = async (action) => {
  error.value = ''
  busy.value = true
  try {
    await action(email.value.trim(), password.value)
    router.push('/')
  } catch (e) {
    error.value = e.message || 'Something went wrong'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="card">
      <h1 class="brand">ocraft</h1>
      <p class="hint">Sign in to reach your node tree.</p>

      <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>

      <template v-if="loaded">
        <template v-if="emailAuthEnabled">
          <n-input v-model:value="email" placeholder="Email" @keyup.enter="submit(login)" />
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="Password"
            @keyup.enter="submit(login)"
          />
          <n-button type="primary" size="large" block :loading="busy" @click="submit(login)">
            Sign in
          </n-button>
          <n-button size="large" block :disabled="busy" @click="submit(signup)">
            Create account
          </n-button>
        </template>

        <div v-if="emailAuthEnabled && googleConfigured" class="divider"><span>or</span></div>

        <n-button
          v-if="googleConfigured"
          size="large"
          block
          :type="emailAuthEnabled ? 'default' : 'primary'"
          :disabled="busy"
          @click="loginWithGoogle"
        >
          Sign in with Google
        </n-button>
      </template>
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
  gap: 12px;
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
  margin: 0 0 4px;
  font-size: 0.85em;
  opacity: 0.6;
  line-height: 1.5;
}
.divider {
  display: flex;
  align-items: center;
  text-align: center;
  opacity: 0.5;
  font-size: 0.8em;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.divider span {
  padding: 0 10px;
}
</style>
