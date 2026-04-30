<!--
文件：frontend/src/mobile/hall/MobileHallTenderDetailView.vue
功能：H5 公开项目详情页，展示大厅项目摘要与标包信息。
交互：调用 hall 项目详情接口；通过移动端 NavBar 返回 H5 大厅。
作者：吴川
-->
<template>
  <main class="mobile-detail" v-loading="loading">
    <section v-if="tender">
      <h1>{{ tender.title }}</h1>
      <p class="summary">{{ tender.hallSummary || tender.description || t('hall.mobile_public_summary') }}</p>
      <div class="meta">
        <span>{{ tender.type }}</span>
        <span>{{ tender.status }}</span>
        <span>{{ t('hall.start') }} {{ tender.bidStartAt ? fmt(tender.bidStartAt) : t('hall.start_after_publish') }}</span>
        <span>{{ tender.bidDeadline ? fmt(tender.bidDeadline) : t('hall.deadline_not_set') }}</span>
      </div>
      <h2>{{ t('hall.lots') }}</h2>
      <div v-for="lot in tender.lots || []" :key="lot.id" class="lot">
        <strong>{{ lot.title }}</strong>
        <small>{{ lot.description || t('hall.contact_buyer_for_requirements') }}</small>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const route = useRoute();
const loading = ref(false);
const tender = ref<any>(null);

function fmt(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(`/api/hall/tenders/${route.params.id}`);
    tender.value = res.data.data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mobile-detail {
  min-height: 100%;
  padding: 0 16px 24px;
}
h1 {
  margin: 22px 0 12px;
  font-size: 28px;
  line-height: 1.2;
}
.summary {
  color: #374151;
  line-height: 1.75;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 26px;
}
.meta span {
  padding: 6px 10px;
  border-radius: 4px;
  background: #eef2ff;
  color: #374151;
  font-size: 12px;
}
h2 {
  margin: 0 0 10px;
  font-size: 18px;
}
.lot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 0;
  border-bottom: 1px solid #e5e7eb;
}
.lot small {
  color: #6b7280;
}
</style>
