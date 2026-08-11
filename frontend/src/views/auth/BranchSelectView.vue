<!--
文件：frontend/src/views/auth/BranchSelectView.vue
功能：多机构用户登录后的机构选择页。
交互：使用登录时下发的受限令牌调用 /api/auth/branches/select 换取正式会话。
作者：吴川

只在「可访问多个机构且没有可用的上次选择」时出现。
单机构用户、以及上次选择仍然有效的用户，登录后直接进入，不经过本页。
-->
<template>
  <main class="auth-page" :aria-label="t('branch.select_title')">
    <section class="auth-content">
      <button class="brand" type="button" @click="backToLogin">BidFlow</button>
      <h1>{{ t('branch.select_title') }}</h1>
      <p class="subtitle">{{ t('branch.select_subtitle') }}</p>

      <ul class="branch-list">
        <li v-for="b in branches" :key="b.branchId">
          <button
            type="button"
            class="branch-item"
            :disabled="loading"
            @click="choose(b.branchId)"
          >
            <span class="dot" :class="{ hq: b.branchType === 'HQ' }" />
            <span class="info">
              <span class="name">{{ b.branchName }}</span>
              <span class="meta">
                {{ b.branchCode }}
                <template v-if="b.branchType === 'HQ'"> · {{ t('branch.read_only') }}</template>
                <template v-else-if="b.role"> · {{ roleLabel(b.role) }}</template>
              </span>
            </span>
            <el-icon class="arrow"><ArrowRight /></el-icon>
          </button>
        </li>
      </ul>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <button class="switch-action" type="button" @click="backToLogin">
        {{ t('auth.back_to_login') }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore, type BranchAccess } from '../../stores/auth';

const { t, te } = useI18n();
const router = useRouter();
const auth = useAuthStore();

const branches = ref<BranchAccess[]>([]);
const loading = ref(false);
const error = ref('');

function roleLabel(role: string) {
  const key = `org.role_${role}`;
  return te(key) ? t(key) : role;
}

onMounted(() => {
  const pending = auth.pendingSelection;
  // 直接访问本页而没有待选状态时，回到登录页 —— 受限令牌只在登录响应里下发
  if (!pending) {
    router.replace('/login');
    return;
  }
  branches.value = pending.branches;
});

async function choose(branchId: string) {
  loading.value = true;
  error.value = '';
  try {
    await auth.completeBranchSelection(branchId);
  } catch (e: any) {
    error.value = t(e.response?.data?.error?.message_key ?? 'error.internal');
    loading.value = false;
  }
}

function backToLogin() {
  auth.clearPendingSelection();
  router.replace('/login');
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #fff;
}
.auth-content { width: min(100%, 420px); }
.brand {
  border: 0; background: transparent; padding: 0;
  color: #1f2937; font-size: 20px; font-weight: 700; cursor: pointer;
}
h1 { margin: 28px 0 8px; color: #111827; font-size: 28px; line-height: 1.2; font-weight: 600; }
.subtitle { margin: 0 0 20px; font-size: 14px; color: #6b7280; }
.branch-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.branch-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.branch-item:hover:not(:disabled) { border-color: #2563eb; background: #f8faff; }
.branch-item:disabled { opacity: 0.6; cursor: default; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; flex: none; }
/* 总部为只读视角，与国家机构用不同颜色区分 */
.dot.hq { background: #a855f7; }
.info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.name { font-size: 15px; font-weight: 600; color: #111827; }
.meta { font-size: 12px; color: #6b7280; }
.arrow { color: #9ca3af; }
.switch-action {
  width: 100%; height: 44px; margin-top: 16px;
  border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; color: #1f2937; font-weight: 600; cursor: pointer;
}
</style>
