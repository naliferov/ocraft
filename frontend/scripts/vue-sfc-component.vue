<script setup>
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
const inc = () => {
  count.value++
  console.log('clicked', count.value)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <button class="btn btn-sm" @click="inc">count {{ count }}</button>
    <span>doubled = {{ doubled }}</span>
  </div>
</template>
