<!--
文件：frontend/src/views/auth/ResetPasswordView.vue
功能：密码重置页，用户输入新密码完成重置。
交互：调用后端 POST /api/auth/password-reset/confirm。
作者：吴川
-->
<template>
  <main class="auth-page" :aria-label="t('auth.reset_password_title')">
    <section class="auth-content">
      <button class="brand" type="button" @click="router.replace('/login')">BidFlow</button>
      <h1>{{ t('auth.reset_password_title') }}</h1>

      <el-form v-if="!submitted && !invalid" :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('auth.new_password')">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" size="large" />
          <div class="password-hint" :class="form.password.length >= 6 ? 'valid' : 'invalid'">
            {{ form.password.length >= 6 ? '✓' : '✗' }} {{ t('auth.password_min_length') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('auth.confirm_password')">
          <el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" size="large" />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="form.password.length < 6 || form.password !== form.confirm"
            class="primary-action"
          >
            {{ t('auth.reset_password') }}
          </el-button>
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      </el-form>

      <div v-else-if="submitted" class="success-message">
        <el-icon size="48" color="#16a34a"><Check /></el-icon>
        <p class="success-title">{{ t('auth.password_reset_success') }}</p>
        <p class="success-hint">{{ t('auth.password_reset_hint') }}</p>
        <el-button type="primary" @click="router.replace('/login')" class="primary-action">
          {{ t('auth.go_to_login') }}
        </el-button>
      </div>

      <div v-else class="error-message">
        <el-icon size="48" color="#dc2626"><Close /></el-icon>
        <p class="error-title">{{ t('auth.reset_link_expired') }}</p>
        <el-button @click="router.replace('/forget-password')" class="primary-action">
          {{ t('auth.request_new_link') }}
        </el-button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { Check, Close } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const form = reactive({ password: '', confirm: '' });
const loading = ref(false);
const error = ref('');
const submitted = ref(false);
const invalid = ref(false);

onMounted(() => {
  const token = route.query.token as string;
  if (!token) invalid.value = true;
});

async function submit() {
  if (form.password !== form.confirm) {
    error.value = t('error.auth.password_mismatch');
    return;
  }
  if (form.password.length < 6) {
    error.value = t('error.auth.password_too_short');
    return;
  }

  const token = route.query.token as string;
  loading.value = true;
  error.value = '';
  try {
    await api.post('/api/auth/password-reset/confirm', { token, password: form.password });
    submitted.value = true;
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key
      ?? e.response?.data?.message
      ?? 'error.internal';
    error.value = t(key as string);
    if (key === 'error.auth.password_reset_token_invalid') {
      invalid.value = true;
    }
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
  margin: 28px 0 24px;
  color: #111827;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
}
.password-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
}
.password-hint.valid {
  color: #16a34a;
}
.primary-action {
  width: 100%;
  height: 44px;
  font-weight: 600;
}
.success-message,
.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
}
.success-title,
.error-title {
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
