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
import type { SupportedLocale } from './i18n';

const { locale } = useI18n();
const elementLocales = { 'zh-CN': zhCn, en, 'id-ID': id };
const elementLocale = computed(() => elementLocales[locale.value as SupportedLocale] ?? en);
</script>
