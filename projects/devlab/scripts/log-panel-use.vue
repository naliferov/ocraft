<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LogPanel from './lib/LogPanel.vue'

const out = ref<InstanceType<typeof LogPanel>>()
onMounted(() => out.value!.push('ready — change me and save (HMR reruns this)'))
</script>

<template>
  <div class="flex flex-col gap-3">
    <LogPanel ref="out" height="140px" />
    <div class="flex gap-2">
      <button class="btn btn-sm" @click="out!.push(`pong ${new Date().toLocaleTimeString()}`)">ping</button>
      <button class="btn btn-sm" @click="out!.clear()">clear</button>
    </div>
  </div>
</template>
