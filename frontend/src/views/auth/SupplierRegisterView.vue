<!--
文件：frontend/src/views/auth/SupplierRegisterView.vue
功能：供应商公开注册页，仅创建可登录账号；供应商主体通过登录后的创建/加入公司流程绑定。
交互：调用 auth.controller.ts 的 supplier-register；成功后自动登录并进入选择公司页。
作者：吴川
-->
<template>
  <main class="auth-page" :aria-label="t('auth.create_supplier_account')">
    <section class="auth-content">
      <button class="brand" type="button" @click="router.replace('/hall')">BidFlow</button>
      <h1>{{ t('auth.create_supplier_account') }}</h1>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('common.contact_name')"><el-input v-model.trim="form.contactName" autocomplete="name" size="large" /></el-form-item>
        <el-form-item :label="t('common.mobile_phone')"><el-input v-model.trim="form.contactPhone" autocomplete="tel" size="large" /></el-form-item>
        <el-form-item :label="t('auth.email')" required><el-input v-model.trim="form.email" type="email" autocomplete="email" size="large" /></el-form-item>
        <el-form-item :label="t('auth.verification_code')" required>
          <div class="code-row">
            <el-input v-model.trim="form.emailCode" inputmode="numeric" autocomplete="one-time-code" size="large" />
            <el-button :disabled="!form.email || codeCooldown > 0" :loading="sendingCode" size="large" @click="sendCode">
              {{ codeCooldown > 0 ? t('auth.resend_code', { seconds: codeCooldown }) : t('auth.send_code') }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('auth.password')" required><el-input v-model="form.password" type="password" autocomplete="new-password" show-password size="large" /></el-form-item>
        <el-alert v-if="error" type="error" :closable="false" :title="error" />
        <el-button type="primary" native-type="submit" :loading="loading" class="primary-action">{{ t('auth.create_account') }}</el-button>
      </el-form>
      <div class="oauth-area">
        <div ref="googleButton" class="google-button" />
        <el-button v-if="!googleClientId" class="google-fallback" size="large" disabled>
          {{ t('auth.continue_with_google') }}
        </el-button>
      </div>
      <button class="switch-action" type="button" @click="router.replace('/login')">
        {{ t('auth.use_existing_account') }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const loading = ref(false);
const sendingCode = ref(false);
const codeCooldown = ref(0);
const error = ref('');
const googleButton = ref<HTMLElement | null>(null);
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const form = reactive({
  contactName: '',
  contactPhone: '',
  email: '',
  emailCode: '',
  password: '',
});

onMounted(() => {
  if (auth.isLoggedIn) router.replace('/hall');
  renderGoogleButton();
});

async function submit() {
  if (!form.email || !form.password || !form.emailCode) {
    error.value = t('error.auth.email_password_required');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await api.post('/api/auth/supplier-register', form);
    await auth.login(form.email, form.password, '/supplier/profile');
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'error.auth.register_failed';
    error.value = t(key as string);
  } finally {
    loading.value = false;
  }
}

async function sendCode() {
  if (!form.email) {
    error.value = t('error.auth.email_password_required');
    return;
  }
  sendingCode.value = true;
  error.value = '';
  try {
    const res = await api.post('/api/auth/supplier-register/email-code', { email: form.email });
    startCooldown(res.data.data?.resendIn ?? 60);
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'error.auth.register_failed';
    error.value = t(key as string);
  } finally {
    sendingCode.value = false;
  }
}

function startCooldown(seconds: number) {
  codeCooldown.value = seconds;
  const timer = window.setInterval(() => {
    codeCooldown.value -= 1;
    if (codeCooldown.value <= 0) window.clearInterval(timer);
  }, 1000);
}

function renderGoogleButton() {
  if (!googleClientId || !googleButton.value) return;
  const draw = () => {
    window.google?.accounts?.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    window.google?.accounts?.id.renderButton(googleButton.value, {
      theme: 'outline',
      size: 'large',
      width: 420,
      text: 'signup_with',
    });
  };
  if (window.google?.accounts?.id) {
    draw();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = draw;
  document.head.appendChild(script);
}

async function handleGoogleCredential(response: { credential?: string }) {
  if (!response.credential) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.post('/api/auth/supplier-register/google', { credential: response.credential });
    auth.applyAuthSession(res.data.data, '/supplier/profile');
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'error.auth.register_failed';
    error.value = t(key as string);
  } finally {
    loading.value = false;
  }
}

declare global {
  interface Window {
    google?: any;
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
.primary-action {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  font-weight: 600;
}
.code-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 8px;
}
.oauth-area {
  min-height: 44px;
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.google-button {
  min-height: 44px;
}
.google-fallback {
  width: 100%;
  height: 44px;
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
@media (max-width: 520px) {
  .auth-page {
    display: flex;
    align-items: center;
    padding: 24px;
  }
  .auth-content {
    width: 100%;
  }
  .code-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
