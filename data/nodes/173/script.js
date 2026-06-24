<script setup>
// vue-sfc view node: the whole body is a real .vue SFC, compiled at runtime.
// ref/computed are auto-available (no import needed); `x` is the node runtime in scope.
const count = ref(0)
const doubled = computed(() => count.value * 2)
const inc = () => {
  count.value++
  x.log('clicked', count.value)
}
</script>

<template>
  <div class="vue-sfc-component">
    <button @click="inc">count {{ count }}</button>
    <span>doubled = {{ doubled }}</span>
  </div>
</template>

<style>
/* auto-scoped to this component (data-v-<id>) — won't bleed into other views */
.vue-sfc-component {
  display: flex;
  gap: 12px;
  align-items: center;
  color: #d4d4d4;
}
.vue-sfc-component button {
  padding: 6px 12px;
  cursor: pointer;
}
</style>
