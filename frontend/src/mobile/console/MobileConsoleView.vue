<!--
文件：frontend/src/mobile/console/MobileConsoleView.vue
功能：移动端控制台宫格入口，按公司账号或供应商账号展示对应功能。
交互：读取 auth store 的账号类型和 scopes；点击图标菜单跳转到复用业务页面。
作者：吴川
-->
<template>
  <main class="console-page">
    <section class="menu-grid">
      <button
        v-for="item in entries"
        :key="item.titleKey"
        class="menu-item"
        type="button"
        @click="router.push(item.path)"
      >
        <span class="icon-wrap">
          <component :is="item.icon" class="menu-icon" />
        </span>
        <span class="menu-label">{{ t(item.titleKey) }}</span>
      </button>
      <div v-if="entries.length === 0" class="empty">{{ t('mobileConsole.noFeatures') }}</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  DocumentChecked, OfficeBuilding, User, UserFilled,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const entries = computed(() => {
  if (auth.user?.supplierId) {
    return [
      { titleKey: 'route.supplierBids', path: '/m/supplier/bids', icon: DocumentChecked },
      { titleKey: 'route.supplierProfile', path: '/m/supplier/profile', icon: User },
    ];
  }

  return [
    auth.hasScope('user:view') ? { titleKey: 'route.users', path: '/m/console/users', icon: UserFilled } : null,
    auth.hasScope('supplier:view') ? { titleKey: 'route.suppliers', path: '/m/console/suppliers', icon: OfficeBuilding } : null,
  ].filter(Boolean) as Array<{ titleKey: string; path: string; icon: any }>;
});

onMounted(async () => {
  if (auth.isLoggedIn && !auth.user) await auth.loadMe();
});
</script>

<style scoped>
.console-page {
  min-height: 100%;
  padding: 18px 12px 28px;
}
.menu-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px 8px;
}
.menu-item {
  width: 100%;
  min-height: 76px;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #111827;
}
.icon-wrap {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #eef4ff;
  color: #2563eb;
}
.menu-icon {
  width: 23px;
  height: 23px;
}
.menu-label {
  max-width: 100%;
  color: #111827;
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  grid-column: 1 / -1;
  padding: 40px 0;
  color: #6b7280;
  text-align: center;
}
@media (pointer: coarse) {
  .menu-item {
    min-height: 84px;
  }
  .icon-wrap {
    width: 50px;
    height: 50px;
  }
}
</style>
