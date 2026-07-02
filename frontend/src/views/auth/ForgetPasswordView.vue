<!--
文件：frontend/src/views/auth/ForgetPasswordView.vue
功能：密码重置请求页，用户输入邮箱，系统发送重置邮件。
交互：调用后端 POST /api/auth/password-reset/request。
作者：吴川
-->
<template>
  <main class="auth-page" :aria-label="t('auth.forget_password_title')">
    <section class="auth-content">
      <button class="brand" type="button" @click="router.replace('/login')">BidFlow</button>
      <h1>{{ t('auth.forget_password_title') }}</h1>
      <p class="subtitle">{{ t('auth.forget_password_subtitle') }}</p>

      <el-form v-if="!submitted" :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('auth.email')">
          <el-input v-model.trim="form.email" type="email" autocomplete="email" size="large" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="primary-action">
            {{ t('auth.send_reset_email') }}
          </el-button>
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      </el-form>

      <div v-else class="success-message">
        <el-icon size="48" color="#16a34a"><Check /></el-icon>
        <p class="success-title">{{ t('auth.reset_email_sent') }}</p>
        <p class="success-hint">{{ t('auth.reset_email_hint') }}</p>
      </div>

      <button class="switch-action" type="button" @click="router.replace('/login')">
        {{ t('auth.back_to_login') }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Check } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const router = useRouter();
const form = reactive({ email: '' });
const loading = ref(false);
const error = ref('');
const submitted = ref(false);

async function submit() {
  if (!form.email) {
    error.value = t('error.auth.email_required');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await api.post('/api/auth/password-reset/request', { email: form.email });
    submitted.value = true;
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key
      ?? e.response?.data?.message
      ?? 'error.internal';
    error.value = t(key as string);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  height: 100vh;
  height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #fff;
  overflow: hidden;
}
.auth-content {
  width: min(100%, 420px);
}
.brand {
  border: 0;
  background: transparent;
  padding: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
}
h1 {
  margin: 28px 0 8px;
  color: #111827;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
}
.subtitle {
  margin: 0 0 24px;
  font-size: 14px;
  color: #6b7280;
}
.primary-action {
  width: 100%;
  height: 44px;
  font-weight: 600;
}
.switch-action {
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #1f2937;
  font-weight: 600;
  cursor: pointer;
}
.success-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
}
.success-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.success-hint {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}
@media (max-width: 520px) {
  .auth-page {
    display: flex;
    align-items: center;
    padding: 24px;
  }
  .auth-content {
    width: 100%;
  }
}
</style>
