<!--
文件：frontend/src/mobile/supplier/MobileSupplierReviewPendingView.vue
功能：H5 供应商审核进度页。
交互：读取 auth store 展示当前供应商认证状态，并提供补交资料和返回大厅。
作者：吴川
-->
<template>
  <main class="mobile-pending">
    <section>
      <h1>认证审核中</h1>
      <p>{{ auth.user?.displayName || auth.user?.email }} 的供应商资料已提交，审核通过后可以参与受邀投标。</p>
      <div class="status">{{ auth.user?.supplierReviewStatus || 'pending_review' }}</div>
      <el-button type="primary" class="main-action" @click="router.push('/m/supplier/profile')">补充资料</el-button>
      <button class="secondary-action" type="button" @click="router.push('/m/hall')">返回大厅</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();

onMounted(async () => {
  if (!auth.isLoggedIn) return;
  await auth.loadMe();
  if (auth.user?.supplierReviewStatus === 'approved') router.replace('/m/supplier/profile');
});
</script>

<style scoped>
.mobile-pending {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
}
section {
  margin-top: 0;
}
h1 {
  margin: 0 0 14px;
  font-size: 30px;
  line-height: 1.2;
}
p {
  margin: 0;
  color: #4b5563;
  line-height: 1.7;
}
.status {
  margin: 22px 0;
  padding: 12px;
  border-radius: 4px;
  background: #eef2ff;
  color: #1f2937;
  font-weight: 600;
}
.main-action,
.secondary-action {
  width: 100%;
  height: 48px;
  margin-top: 12px;
  font-weight: 600;
}
.secondary-action {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #111827;
}
</style>
