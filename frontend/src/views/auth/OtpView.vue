<!--
文件：frontend/src/views/auth/OtpView.vue
功能：历史 OTP 页面占位，当前登录流程已取消 OTP 校验。
交互：保留文件以兼容旧链接；用户可从此页返回 LoginView.vue 重新登录。
作者：吴川
-->
<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <h2>{{ t('auth.login') }}</h2>
      <p class="hint">OTP verification has been disabled. Please return to the login page.</p>
      <el-button type="primary" class="full-w" @click="router.replace('/login')">
        {{ t('auth.login') }}
      </el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<style scoped>
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f5f7fa; }
.login-card { width: 380px; }
.hint { color: #909399; margin-bottom: 16px; }
.full-w { width: 100%; }
</style>
