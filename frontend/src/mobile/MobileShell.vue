<!--
文件：frontend/src/mobile/MobileShell.vue
功能：H5 端应用壳，提供移动端安全区、背景和路由承载。
交互：被 router/index.ts 的 /m 路由使用，承载移动端独立页面。
作者：吴川
-->
<template>
  <div class="mobile-shell">
    <template v-if="showChrome">
      <MobileNavBar />
      <main ref="contentRef" class="mobile-content">
        <router-view :key="`${route.fullPath}:${refreshKey}`" />
      </main>
      <MobileTabBar />
    </template>
    <router-view v-else />
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, ref, watch,
} from 'vue';
import { useRoute } from 'vue-router';
import MobileNavBar from './components/MobileNavBar.vue';
import MobileTabBar from './components/MobileTabBar.vue';
import { rememberMobileTabPath } from './mobileTabState';

const route = useRoute();
const showChrome = computed(() => !route.meta.hideMobileChrome);
const refreshKey = ref(0);
const contentRef = ref<HTMLElement | null>(null);

function refreshCurrentTab() {
  refreshKey.value += 1;
  requestAnimationFrame(() => {
    contentRef.value?.scrollTo({ top: 0, behavior: 'auto' });
  });
}

onMounted(() => {
  window.addEventListener('bidflow:mobile-tab-refresh', refreshCurrentTab);
});

watch(
  () => route.fullPath,
  () => {
    if (showChrome.value) rememberMobileTabPath(route.path, route.fullPath);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('bidflow:mobile-tab-refresh', refreshCurrentTab);
});
</script>

<style scoped>
.mobile-shell {
  height: 100vh;
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #f7f8fa;
  color: #111827;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  overflow-x: hidden;
}
.mobile-content {
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
