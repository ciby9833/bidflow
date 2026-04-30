<!--
文件：frontend/src/mobile/components/MobileTabBar.vue
功能：移动端底部标签栏，承载首页、招标大厅、控制台、我的四个主入口。
交互：被 MobileShell.vue 使用；通过 vue-router 切换 H5 一级页面。
作者：吴川
-->
<template>
  <nav class="mobile-tabs" :aria-label="t('mobile.mainNav')">
    <button
      v-for="item in tabs"
      :key="item.key"
      class="tab-item"
      :class="{ active: activeTab === item.key }"
      type="button"
      @click="openTab(item.key)"
    >
      <component :is="item.icon" class="tab-icon" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { House, Menu, Tickets, User } from '@element-plus/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  getLastMobileTabPath,
  getMobileTabKey,
  resetMobileTabPath,
  mobileTabRoots,
} from '../mobileTabState';
import type { MobileTabKey } from '../mobileTabState';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const tabs = computed(() => [
  { key: 'home' as const, path: mobileTabRoots.home, label: t('route.hall'), icon: House },
  { key: 'tenders' as const, path: mobileTabRoots.tenders, label: t('route.supplierTenders'), icon: Tickets },
  { key: 'console' as const, path: mobileTabRoots.console, label: t('route.console'), icon: Menu },
  { key: 'mine' as const, path: mobileTabRoots.mine, label: t('route.mine'), icon: User },
]);
const activeTab = computed(() => getMobileTabKey(route.path));

async function openTab(tab: MobileTabKey) {
  if (auth.isLoggedIn) await auth.loadMe();
  const isCurrentTab = activeTab.value === tab;
  const target = isCurrentTab ? resetMobileTabPath(tab) : getLastMobileTabPath(tab);
  if (route.fullPath !== target) await router.push(target);
  if (isCurrentTab) {
    window.dispatchEvent(new CustomEvent('bidflow:mobile-tab-refresh', { detail: { path: target } }));
  }
}
</script>

<style scoped>
.mobile-tabs {
  height: 64px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  background: rgba(255, 255, 255, .94);
  border-top: 1px solid rgba(209, 213, 219, .8);
  backdrop-filter: saturate(180%) blur(16px);
}
.tab-item {
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
}
.tab-item.active {
  color: #2563eb;
}
.tab-icon {
  width: 21px;
  height: 21px;
}
</style>
