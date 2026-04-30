<!--
文件：frontend/src/views/LayoutView.vue
功能：WEB 端统一侧边栏工作台布局，承载公开浏览、招标、供应商与报价页面。
交互：依赖 stores/auth.ts 控制登录态菜单；通过标签页缓存已打开页面并由 router/index.ts 承载。
作者：吴川
-->
<template>
  <el-container class="layout">
    <el-aside width="220px" class="sidebar">
      <div class="brand">BidFlow</div>
      <el-menu :router="true" :default-active="route.path" background-color="#1a2236" text-color="#c0c4cc" active-text-color="#409eff">
        <el-menu-item index="/hall">
          <el-icon><Document /></el-icon><span>{{ t('route.hall') }}</span>
        </el-menu-item>
        <el-menu-item v-if="isCompanyUser" index="/tenders">
          <el-icon><Tickets /></el-icon><span>{{ t('nav.tenders') }}</span>
        </el-menu-item>
        <el-menu-item v-if="isSupplierUser" index="/supplier/tenders">
          <el-icon><Tickets /></el-icon><span>{{ t('route.supplierTenders') }}</span>
        </el-menu-item>
        <el-menu-item v-if="isSupplierUser" index="/supplier/bids">
          <el-icon><DocumentChecked /></el-icon><span>{{ t('route.supplierBids') }}</span>
        </el-menu-item>
        <el-menu-item v-if="isSupplierUser" index="/supplier/profile">
          <el-icon><User /></el-icon><span>{{ t('route.supplierProfile') }}</span>
        </el-menu-item>
        <el-menu-item v-if="auth.hasScope('supplier:view')" index="/suppliers">
          <el-icon><OfficeBuilding /></el-icon><span>{{ t('nav.suppliers') }}</span>
        </el-menu-item>
        <el-menu-item v-if="auth.hasScope('user:view')" index="/users">
          <el-icon><UserFilled /></el-icon><span>{{ t('route.users') }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="page-title">{{ currentTitle }}</div>
        <div class="spacer" />
        <el-dropdown class="language-switcher" trigger="click" @command="onLocaleCommand">
          <el-button text>{{ currentLocaleLabel }} <el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="item in localeOptions"
                :key="item.value"
                :command="item.value"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div v-if="!auth.isLoggedIn" class="guest-actions">
          <el-button text @click="$router.push('/login')">{{ t('auth.login') }}</el-button>
          <el-button type="primary" @click="$router.push('/register/supplier')">{{ t('auth.register_supplier') }}</el-button>
        </div>
        <el-dropdown v-else-if="auth.user" @command="onCommand">
          <span class="user-name">{{ auth.user.displayName }} <el-icon><ArrowDown /></el-icon></span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">{{ t('auth.logout') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <div class="workspace-tabs">
        <el-tabs
          :model-value="activeTab"
          type="card"
          @tab-click="onTabClick"
          @tab-remove="onTabRemove"
        >
          <el-tab-pane
            v-for="tab in tabs"
            :key="tab.fullPath"
            :label="tab.title"
            :name="tab.fullPath"
            :closable="!tab.fixed"
          />
        </el-tabs>
      </div>

      <el-main class="workspace-main">
        <router-view v-slot="{ Component, route: viewRoute }">
          <keep-alive>
            <component :is="Component" :key="getViewKey(viewRoute.fullPath)" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type { TabsPaneContext } from 'element-plus';
import {
  ArrowDown, Document, DocumentChecked, OfficeBuilding, Tickets, User, UserFilled,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { setAppLocale, type SupportedLocale } from '../i18n';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const homeTab = { fullPath: '/hall', path: '/hall', title: t('route.hall'), fixed: true };
const tabs = ref<Array<{ fullPath: string; path: string; title: string; fixed?: boolean }>>([homeTab]);
const routeVersions = ref<Record<string, number>>({});
const localeOptions: Array<{ label: string; value: SupportedLocale }> = [
  { label: 'Bahasa Indonesia', value: 'id-ID' },
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh-CN' },
];

const activeTab = computed(() => route.fullPath);
const isSupplierUser = computed(() => Boolean(auth.user?.supplierId));
const isCompanyUser = computed(() => Boolean(auth.user && !auth.user.supplierId));
const currentLocaleLabel = computed(() => localeOptions.find((item) => item.value === locale.value)?.label ?? 'English');

const currentTitle = computed(() => {
  return getRouteTitle(route.path, route.meta.title);
});

function onCommand(cmd: string) {
  if (cmd === 'logout') { auth.logout(); return; }
}

function onLocaleCommand(cmd: string) {
  setAppLocale(cmd as SupportedLocale);
  tabs.value.forEach((tab) => {
    tab.title = getRouteTitle(tab.path, router.resolve(tab.fullPath).meta.title);
  });
}

function getRouteTitle(path: string, metaTitle: unknown) {
  if (typeof metaTitle === 'string') return t(`route.${metaTitle}`, metaTitle);
  if (path.startsWith('/hall/tenders')) return t('route.hallTenderDetail');
  if (path.startsWith('/hall')) return t('route.hall');
  if (path.startsWith('/supplier/bids')) return t('route.supplierBids');
  if (path.startsWith('/supplier/tenders')) return t('route.supplierTenders');
  if (path.startsWith('/suppliers')) return t('route.suppliers');
  if (path.startsWith('/users')) return t('route.users');
  if (path.startsWith('/supplier/quotes')) return t('route.quoteSubmit');
  if (path.startsWith('/supplier')) return t('route.supplierProfile');
  if (path.startsWith('/quotes')) return t('route.quoteReview');
  return auth.user?.supplierId ? t('route.supplierTenders') : t('route.tenders');
}

function addCurrentTab() {
  if (route.path === '/') return;
  const existing = tabs.value.find((tab) => tab.fullPath === route.fullPath);
  const title = getRouteTitle(route.path, route.meta.title);
  if (existing) {
    existing.title = title;
    return;
  }
  tabs.value.push({ fullPath: route.fullPath, path: route.path, title, fixed: route.path === '/hall' });
}

function onTabClick(tab: TabsPaneContext) {
  const target = String(tab.props.name || '');
  if (target && target !== route.fullPath) router.push(target);
}

function onTabRemove(name: string | number) {
  const target = String(name);
  const index = tabs.value.findIndex((tab) => tab.fullPath === target);
  if (index < 0) return;
  if (tabs.value[index].fixed) return;

  tabs.value.splice(index, 1);
  routeVersions.value[target] = (routeVersions.value[target] ?? 0) + 1;
  if (route.fullPath !== target) return;

  const nextTab = tabs.value[index] || tabs.value[index - 1] || tabs.value[0];
  router.push(nextTab?.fullPath || '/hall');
}

function getViewKey(fullPath: string) {
  return `${fullPath}::${routeVersions.value[fullPath] ?? 0}`;
}

function closeCurrentTab() {
  onTabRemove(route.fullPath);
}

watch(
  () => route.fullPath,
  () => addCurrentTab(),
  { immediate: true },
);

watch(locale, () => {
  homeTab.title = t('route.hall');
  tabs.value.forEach((tab) => {
    tab.title = getRouteTitle(tab.path, router.resolve(tab.fullPath).meta.title);
  });
});

onMounted(() => {
  if (auth.isLoggedIn && !auth.user) void auth.loadMe();
  window.addEventListener('bidflow:close-current-tab', closeCurrentTab);
});

onBeforeUnmount(() => {
  window.removeEventListener('bidflow:close-current-tab', closeCurrentTab);
});
</script>

<style scoped>
.layout { height: 100vh; }
.sidebar { background: #1a2236; overflow: hidden; }
.brand { color: #fff; font-size: 18px; font-weight: 700; padding: 20px 24px; }
.header { display: flex; align-items: center; border-bottom: 1px solid #e4e7ed; background: #fff; }
.page-title { color: #111827; font-size: 16px; font-weight: 700; }
.spacer { flex: 1; }
.guest-actions { display: flex; align-items: center; gap: 8px; }
.language-switcher { margin-right: 8px; }
.language-switcher :deep(.el-button) { display: inline-flex; align-items: center; gap: 4px; }
.user-name { cursor: pointer; display: flex; align-items: center; gap: 4px; }
.workspace-tabs { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 6px 12px 0; }
.workspace-tabs :deep(.el-tabs__header) { margin: 0; border-bottom: 0; }
.workspace-tabs :deep(.el-tabs__nav) { border: 0; gap: 6px; }
.workspace-tabs :deep(.el-tabs__item) { height: 34px; border: 1px solid #dcdfe6 !important; border-radius: 8px 8px 0 0; background: #f8fafc; color: #4b5563; }
.workspace-tabs :deep(.el-tabs__item.is-active) { background: #f6f8fb; color: #111827; font-weight: 700; }
.workspace-main { background: #f6f8fb; overflow: auto; }
</style>
