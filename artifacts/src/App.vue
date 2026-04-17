<script setup>
import { onMounted } from 'vue'
import { NConfigProvider, NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { useVisualsStore } from './stores/visuals.js'
import VisualItem from './components/VisualItem.vue'

const store = useVisualsStore()
onMounted(() => store.load())
</script>

<template>
  <n-config-provider>
      <n-layout has-sider content-style="height: 100vh;">
      <n-layout-sider :width="240" bordered content-style="padding: 10px 0 0 10px;">
        <div class="visual-item"
          v-for="v in store.visuals"
          :key="v.id"
          @click="store.activeId = v.id"
        >{{ v.id }}</div>
      </n-layout-sider>

      <n-layout-content content-style="height: 100%; overflow: hidden;">
        <VisualItem v-if="store.active" :visual="store.active" />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.visual-item {
  cursor: pointer;
}
</style>
