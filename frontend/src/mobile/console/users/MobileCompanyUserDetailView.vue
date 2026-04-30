<!--
文件：frontend/src/mobile/console/users/MobileCompanyUserDetailView.vue
功能：移动端公司用户详情页，只读展示账号、角色、员工信息和状态。
交互：调用 /api/company-users 查找当前用户；编辑入口由 MobileNavBar 右侧按钮进入。
作者：吴川
-->
<template>
  <main class="user-detail" v-loading="loading">
    <section v-if="user" class="profile">
      <span class="avatar">{{ avatarText(user) }}</span>
      <h1>{{ user.fullName || user.displayName }}</h1>
      <p>{{ user.email }}</p>
      <span class="status" :class="user.status === 'active' ? 'ok' : 'warn'">{{ statusText(user.status) }}</span>
    </section>

    <section v-if="user" class="group">
      <div class="row"><span>角色</span><strong>{{ roleText(user.role) }}</strong></div>
      <div class="row"><span>员工ID</span><strong>{{ user.employeeId || '未设置' }}</strong></div>
      <div class="row"><span>公司名称</span><strong>{{ user.companyName || '未设置' }}</strong></div>
      <div class="row"><span>登录名</span><strong>{{ user.loginName || user.email }}</strong></div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../../composables/useApi';
import { avatarText, roleText, statusText } from './user-options';

const route = useRoute();
const loading = ref(false);
const user = ref<any>(null);

async function load() {
  loading.value = true;
  try {
    const users = (await api.get('/api/company-users')).data.data ?? [];
    user.value = users.find((item: any) => item.id === route.params.id);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.user-detail {
  min-height: 100%;
  padding: 18px 12px 28px;
  background: #f2f2f7;
}
.profile {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 18px 0 22px;
}
.avatar {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0ff;
  color: #2563eb;
  font-size: 28px;
  font-weight: 700;
}
h1 {
  margin: 4px 0 0;
  color: #111827;
  font-size: 22px;
}
p {
  margin: 0;
  color: #6b7280;
}
.status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
}
.status.ok {
  background: #e9f8ee;
  color: #16833a;
}
.status.warn {
  background: #fff4df;
  color: #9a5a00;
}
.group {
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
}
.row:last-child {
  border-bottom: 0;
}
.row span {
  color: #6b7280;
}
.row strong {
  min-width: 0;
  color: #111827;
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}
</style>
