<!--
文件：frontend/src/views/auth/LoginView.vue
功能：账号密码登录页，完成直接登录并进入系统。
交互：调用 stores/auth.ts 的 login；成功后进入受保护页面。
作者：吴川
-->
<template>
  <main class="auth-page" :aria-label="t('auth.login_title')">
    <section class="auth-content">
      <button class="brand" type="button" @click="router.replace('/hall')">BidFlow</button>
      <h1>{{ t('auth.login_title') }}</h1>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('auth.account')">
          <el-input v-model.trim="form.login" autocomplete="username" size="large" />
        </el-form-item>
        <el-form-item :label="t('auth.password')">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password size="large" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="primary-action">
            {{ t('auth.login') }}
          </el-button>
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      </el-form>
      <button class="switch-action" type="button" @click="router.replace('/register/supplier')">
        {{ t('auth.create_supplier_account') }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const form = reactive({ login: '', password: '' });
const loading = ref(false);
const error = ref('');

onMounted(() => {
  if (auth.isLoggedIn) router.replace('/hall');
});

async function submit() {
  if (!form.login || !form.password) {
    error.value = t('error.auth.account_password_required');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.login, form.password);
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key
      ?? e.response?.data?.message
      ?? 'error.auth.invalid_credentials';
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
  margin: 28px 0 24px;
  color: #111827;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
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
