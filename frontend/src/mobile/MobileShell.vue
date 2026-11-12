<!--
文件：frontend/src/mobile/MobileShell.vue
功能：H5 端应用壳，提供移动端安全区、背景和路由承载。
交互：被 router/index.ts 的 /m 路由使用，承载移动端独立页面。
作者：吴川
-->
<template>
  <div class="mobile-shell">
    <template v-if="showChrome">
      <div>
        <MobileNavBar :employee-editable="employeeEditable" />
        <div v-if="auth.isLoggedIn && auth.canSwitchBranch" class="mobile-branch"><BranchSwitcher /></div>
      </div>
      <main ref="contentRef" class="mobile-content">
        <router-view :key="`${route.fullPath}:${refreshKey}`" @employee-editable="employeeEditable = $event" />
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
import BranchSwitcher from '../components/BranchSwitcher.vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const auth = useAuthStore();
const showChrome = computed(() => !route.meta.hideMobileChrome);
const refreshKey = ref(0);
const employeeEditable = ref(false);
const contentRef = ref<HTMLElement | null>(null);

function refreshCurrentTab() {
  employeeEditable.value = false;
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
    employeeEditable.value = false;
    if (showChrome.value) rememberMobileTabPath(route.path, route.fullPath);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('bidflow:mobile-tab-refresh', refreshCurrentTab);
});
</script>

<style scoped>
.mobile-content > :deep(.tender-list), .mobile-content > :deep(.tender-detail),
.mobile-content > :deep(.wizard), .mobile-content > :deep(.company-quote-page) { padding: 12px; min-width: 0; }
.mobile-content :deep(.header-actions), .mobile-content :deep(.head-actions) { flex-wrap: wrap; justify-content: flex-start; gap: 8px; }
.mobile-content :deep(.el-button) { min-height: 44px; margin-left: 0; white-space: normal; }
.mobile-content :deep(.el-input__inner) { min-height: 42px; font-size: 16px; }
.mobile-content :deep(.el-card__body) { padding: 12px; }
.mobile-content :deep(.step-bar) { overflow-x: auto; }
.mobile-content :deep(.wizard-foot) { position: sticky; bottom: 0; z-index: 5; padding: 12px; }
.mobile-content :deep(.page-header), .mobile-content :deep(.review-head) { gap: 12px; }
.mobile-content :deep(.el-table) { max-width: 100%; }
.mobile-branch { padding: 6px 12px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.mobile-shell {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  height: 100vh;
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #f7f8fa;
  color: #111827;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  overflow-x: hidden;
}
.mobile-shell :deep(button), .mobile-shell :deep(input), .mobile-shell :deep(textarea), .mobile-shell :deep(select) { font-family: inherit; }
.mobile-content {
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
