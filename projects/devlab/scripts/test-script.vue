<script setup lang="ts">
import xlang from './lib/xlang.js'

const test = xlang()
console.log(test)
</script>

<template>
  <div class="font-mono">xlang() → <b>{{ test }}</b> <span class="opacity-50">(also in console)</span></div>
</template>
