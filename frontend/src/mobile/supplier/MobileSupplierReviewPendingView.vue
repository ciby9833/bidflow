<!--
文件：frontend/src/mobile/supplier/MobileSupplierReviewPendingView.vue
功能：H5 供应商审核进度页。
交互：读取 auth store 展示当前供应商认证状态，并提供补交资料和返回大厅。
作者：吴川
-->
<template>
  <main class="mobile-pending">
    <section>
      <h1>{{ t('route.supplierReviewPending') }}</h1>
      <p>{{ auth.user?.displayName || auth.user?.email }} {{ t(`supplierProfile.statusHint.${auth.user?.supplierReviewStatus || 'pending_review'}`) }}</p>
      <div class="status">{{ t(`supplierReview.${auth.user?.supplierReviewStatus || 'pending_review'}`) }}</div>
      <el-button type="primary" class="main-action" @click="router.push('/m/supplier/profile')">{{ t('supplierProfile.supplementProfile') }}</el-button>
      <button class="secondary-action" type="button" @click="router.push('/m/hall')">{{ t('common.back') }}</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

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
