<!--
文件：frontend/src/mobile/components/MobileNavBar.vue
功能：移动端顶部导航栏，提供 iOS 风格的标题、返回和轻量操作区。
交互：被 MobileShell.vue 使用；根据当前路由 meta 决定标题和返回行为。
作者：吴川
-->
<template>
  <header class="mobile-nav">
    <button v-if="canGoBack" class="nav-action icon-action" type="button" :aria-label="t('common.back')" @click="goBack">
      <ArrowLeft />
    </button>
    <span v-else class="nav-spacer" />
    <strong>{{ title }}</strong>
    <button v-if="rightAction" class="nav-action icon-action right" type="button" :aria-label="rightAction.label" @click="rightAction.run">
      <Plus v-if="rightAction.icon === 'plus'" />
      <span v-else>{{ rightAction.label }}</span>
    </button>
    <span v-else class="nav-spacer" />
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Plus } from '@element-plus/icons-vue';
import { consumeMobileTabBackPath } from '../mobileTabState';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const title = computed(() => {
  const titleKey = String(route.meta.title ?? '');
  return titleKey ? t(`route.${titleKey}`, titleKey) : 'BidFlow';
});
const canGoBack = computed(() => Boolean(route.meta.back));

function goBack() {
  router.replace(consumeMobileTabBackPath(route.path, route.fullPath));
}

const rightAction = computed(() => {
  if (route.path === '/m/console/users') {
    return {
      label: t('common.add'),
      icon: 'plus',
      run: () => router.push('/m/console/users/new'),
    };
  }
  if (/^\/m\/console\/suppliers\/[^/]+\/review$/.test(route.path)) {
    return {
      label: t('common.edit'),
      icon: 'text',
      run: () => router.push(route.path.replace('/review', '/edit')),
    };
  }
  if (/^\/m\/console\/users\/[^/]+$/.test(route.path)) {
    return {
      label: t('common.edit'),
      icon: 'text',
      run: () => router.push(`${route.path}/edit`),
    };
  }
  return null;
});
</script>

<style scoped>
.mobile-nav {
  height: 52px;
  display: grid;
  grid-template-columns: 64px 1fr 64px;
  align-items: center;
  padding: 0 12px;
  background: rgba(247, 248, 250, .92);
  border-bottom: 1px solid rgba(209, 213, 219, .72);
  backdrop-filter: saturate(180%) blur(16px);
}
.mobile-nav strong {
  min-width: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
  font-weight: 650;
}
.nav-action {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 15px;
  font-weight: 500;
}
.nav-action:first-child {
  text-align: left;
}
.nav-action:last-child {
  text-align: right;
}
.icon-action {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
}
.icon-action.right {
  justify-content: flex-end;
}
.icon-action svg {
  width: 23px;
  height: 23px;
}
.nav-spacer {
  width: 64px;
}
</style>
