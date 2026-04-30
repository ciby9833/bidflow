<!--
文件：frontend/src/mobile/console/users/MobileCompanyUserListView.vue
功能：移动端公司用户列表页，按 iOS 分组列表展示内部账号。
交互：调用 /api/company-users；点击用户进入详情；新增入口由 MobileNavBar 右侧图标提供。
作者：吴川
-->
<template>
  <main class="user-list" v-loading="loading">
    <section class="group">
      <button v-for="row in users" :key="row.id" class="user-row" type="button" @click="router.push(`/m/console/users/${row.id}`)">
        <span class="avatar">{{ avatarText(row) }}</span>
        <span class="content">
          <strong>{{ row.fullName || row.displayName }}</strong>
          <small>{{ row.email }}</small>
          <em>{{ roleText(row.role) }} · {{ row.employeeId || '未设置员工ID' }}</em>
        </span>
        <span class="status" :class="row.status === 'active' ? 'ok' : 'warn'">{{ statusText(row.status) }}</span>
      </button>
    </section>
    <div v-if="!loading && users.length === 0" class="empty">暂无用户</div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../../composables/useApi';
import { avatarText, roleText, statusText } from './user-options';

const router = useRouter();
const loading = ref(false);
const users = ref<any[]>([]);

async function load() {
  loading.value = true;
  try {
    users.value = (await api.get('/api/company-users')).data.data ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.user-list {
  min-height: 100%;
  padding: 14px 12px 28px;
  background: #f2f2f7;
}
.group {
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
}
.user-row {
  position: relative;
  width: 100%;
  min-height: 78px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 34px 10px 12px;
  border: 0;
  border-bottom: 1px solid #e5e5ea;
  background: #fff;
  text-align: left;
}
.user-row:last-child {
  border-bottom: 0;
}
.user-row::after {
  position: absolute;
  right: 14px;
  width: 8px;
  height: 8px;
  border-top: 2px solid #c7c7cc;
  border-right: 2px solid #c7c7cc;
  content: '';
  transform: rotate(45deg);
}
.avatar {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0ff;
  color: #2563eb;
  font-weight: 700;
}
.content {
  min-width: 0;
}
.content strong,
.content small,
.content em {
  display: block;
}
.content strong {
  color: #111827;
  font-size: 16px;
}
.content small,
.content em {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.status.ok {
  background: #e9f8ee;
  color: #16833a;
}
.status.warn {
  background: #fff4df;
  color: #9a5a00;
}
.empty {
  padding: 44px 0;
  color: #6b7280;
  text-align: center;
}
</style>
