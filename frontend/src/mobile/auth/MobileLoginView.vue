<!--
文件：frontend/src/mobile/auth/MobileLoginView.vue
功能：H5 登录页，使用移动端原生表单节奏完成统一账号登录。
交互：调用 stores/auth.ts 登录；成功后进入 H5 大厅。
作者：吴川
-->
<template>
  <main class="mobile-auth">
    <button class="brand" type="button" @click="router.replace('/m/hall')">BidFlow</button>
    <section class="auth-content">
      <h1>{{ t('auth.login_title') }}</h1>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('auth.account')">
          <el-input v-model.trim="form.login" autocomplete="username" inputmode="email" size="large" />
        </el-form-item>
        <el-form-item :label="t('auth.password')">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password size="large" />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
        <el-button type="primary" native-type="submit" :loading="loading" class="primary-action">{{ t('auth.login') }}</el-button>
      </el-form>
      <button class="secondary-action" type="button" @click="router.replace('/m/register/supplier')">
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

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const loading = ref(false);
const error = ref('');
const form = reactive({ login: '', password: '' });

onMounted(() => {
  if (auth.isLoggedIn) router.replace('/m/hall');
});

async function submit() {
  if (!form.login || !form.password) {
    error.value = t('error.auth.account_password_required');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login(form.login, form.password, '/m/hall');
  } catch (e: any) {
    const key = e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'error.auth.login_failed';
    error.value = t(key as string);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.mobile-auth {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}
.brand {
  align-self: flex-start;
  border: 0;
  background: transparent;
  padding: 0;
  color: #111827;
  font-size: 20px;
  font-weight: 700;
}
.auth-content {
  margin-top: 36px;
}
h1 {
  margin: 0 0 28px;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 650;
}
.primary-action,
.secondary-action {
  width: 100%;
  height: 48px;
  margin-top: 14px;
  font-weight: 600;
}
.secondary-action {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #111827;
}
</style>
