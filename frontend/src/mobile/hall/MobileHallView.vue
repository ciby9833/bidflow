<!--
文件：frontend/src/mobile/hall/MobileHallView.vue
功能：H5 公开大厅，匿名展示公司公开招标信息。
交互：调用 hall 接口；点击公开项目进入 H5 公开详情页。
作者：吴川
-->
<template>
  <main class="mobile-hall">
    <section class="intro">
      <h1>{{ profileName }}</h1>
      <p>{{ profileIntro }}</p>
    </section>

    <section class="list">
      <div class="list-head">
        <h2>{{ t('hall.public_tenders') }}</h2>
        <span>{{ tenders.length }}</span>
      </div>
      <button v-for="item in tenders" :key="item.id" class="tender-item" type="button" @click="router.push(`/m/hall/tenders/${item.id}`)">
        <span>{{ item.title }}</span>
        <small>{{ t('hall.start') }} {{ item.bidStartAt ? fmt(item.bidStartAt) : t('hall.start_after_publish') }} · {{ t('hall.deadline_short') }} {{ item.bidDeadline ? fmt(item.bidDeadline) : t('hall.long_term_valid') }}</small>
      </button>
      <div v-if="!tenders.length" class="empty">{{ t('hall.no_public_tenders') }}</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const router = useRouter();
const profile = ref<any>({});
const tenders = ref<any[]>([]);
const profileName = computed(() => {
  return ['BidFlow 采购招标中心', 'BidFlow Procurement Center'].includes(profile.value.name) ? t('hall.default_company_name') : (profile.value.name || t('hall.procurement_hall'));
});
const profileIntro = computed(() => {
  return ['面向供应商开放的公开招标与协同报价门户。', 'Public tender and collaborative quotation portal for suppliers.'].includes(profile.value.intro) ? t('hall.default_company_intro') : (profile.value.intro || t('hall.intro'));
});

function fmt(value: string) {
  return dayjs(value).format('MM-DD HH:mm');
}

async function load() {
  const [profileRes, tenderRes] = await Promise.all([
    api.get('/api/hall/company-profile'),
    api.get('/api/hall/tenders'),
  ]);
  profile.value = profileRes.data.data ?? {};
  tenders.value = tenderRes.data.data ?? [];
}

onMounted(load);
</script>

<style scoped>
.mobile-hall {
  min-height: 100%;
  padding: 0 16px 24px;
}
.intro {
  padding: 26px 0 22px;
}
.intro h1 {
  margin: 0 0 10px;
  font-size: 30px;
  line-height: 1.15;
}
.intro p {
  margin: 0;
  color: #4b5563;
  line-height: 1.7;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.list-head h2 {
  margin: 0;
  font-size: 18px;
}
.list-head span {
  color: #6b7280;
}
.tender-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  background: transparent;
  text-align: left;
}
.tender-item span {
  color: #111827;
  font-size: 16px;
  font-weight: 600;
}
.tender-item small,
.empty {
  color: #6b7280;
}
.empty {
  padding: 28px 0;
  text-align: center;
}
</style>
