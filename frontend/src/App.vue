<!--
文件：frontend/src/App.vue
功能：前端最外层应用壳，当前仅负责承载路由视图。
交互：被 main.ts 挂载；通过 router/index.ts 切换到各业务页面。
作者：吴川
-->
<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import id from 'element-plus/es/locale/lang/id';
import vi from 'element-plus/es/locale/lang/vi';
import ptBr from 'element-plus/es/locale/lang/pt-br';
import type { SupportedLocale } from './i18n';

const { locale } = useI18n();
const elementLocales = { 'zh-CN': zhCn, en, 'id-ID': id, 'vi-VN': vi, 'pt-BR': ptBr };
const elementLocale = computed(() => elementLocales[locale.value as SupportedLocale] ?? en);
</script>

<style>
@media (max-width: 768px) {
  .el-dialog { width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px); margin-top: 5vh; }
  .el-drawer { max-width: 100vw; }
  .el-message-box { max-width: calc(100vw - 24px); }
  .el-dialog__body { overflow-wrap: anywhere; }
  .el-dialog .el-form-item { flex-wrap: wrap; }
  .el-dialog .el-form-item__label { height: auto; }
}
</style>
