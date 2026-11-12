<template><el-option v-for="code in currencyCodes" :key="code" :value="code" :label="t(`currency.${code.toLowerCase()}`)" /></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { currencyCodes } from '../shared/markets';
const { t } = useI18n();
</script>
