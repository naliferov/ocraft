<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
const inc = () => count.value++
</script>

<template>
  <div class="flex items-center gap-3">
    <button class="btn btn-sm" @click="inc">count {{ count }}</button>
    <span>count = {{ count }}</span>
  </div>
</template>
