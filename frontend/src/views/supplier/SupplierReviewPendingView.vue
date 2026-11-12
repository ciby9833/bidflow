<!--
文件：frontend/src/views/supplier/SupplierReviewPendingView.vue
功能：供应商注册后待审核提示页，阻止未审核供应商继续参与投标操作。
交互：由后端登录 redirect 引导进入；依赖 stores/auth.ts 展示当前账号信息并支持退出登录。
作者：吴川
-->
<template>
  <div class="pending-wrap">
    <el-card class="pending-card">
      <h2>{{ t('route.supplierReviewPending') }}</h2>
      <p class="desc">
        {{ auth.user?.displayName || auth.user?.fullName || auth.user?.email }}
        {{ t(`supplierProfile.statusHint.${auth.user?.supplierReviewStatus || 'pending_review'}`) }}
      </p>
      <div class="status-row">
        <span class="label">{{ t('supplierProfile.currentReviewStatus') }}</span>
        <el-tag type="warning">{{ t(`supplierReview.${auth.user?.supplierReviewStatus || 'pending_review'}`) }}</el-tag>
      </div>
      <div class="actions">
        <el-button @click="router.push('/supplier/profile')">{{ t('supplierProfile.supplementProfile') }}</el-button>
        <el-button @click="syncStatus">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" @click="auth.logout()">{{ t('auth.logout') }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();

async function syncStatus() {
  if (!auth.isLoggedIn) return;
  await auth.loadMe();
  if (auth.user?.supplierReviewStatus === 'approved') router.replace('/supplier/tenders');
}

onMounted(syncStatus);
onActivated(syncStatus);
</script>

<style scoped>
.pending-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f6f8fb; padding: 24px; }
.pending-card { width: 100%; max-width: 560px; }
.desc { color: #606266; line-height: 1.8; margin: 12px 0 20px; }
.status-row { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.label { color: #909399; }
.actions { display: flex; gap: 12px; }
</style>
