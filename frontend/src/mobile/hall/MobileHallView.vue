<!--
文件：frontend/src/mobile/hall/MobileHallView.vue
功能：H5 公开大厅，匿名展示公司公开招标信息。
交互：调用 hall 接口；点击公开项目进入 H5 公开详情页。
作者：吴川
-->
<template>
  <main class="mobile-hall" v-loading="loading">
    <section class="intro">
      <div class="eyebrow">{{ t('hall.procurement_hall') }}</div>
      <h1>{{ profileName }}</h1>
      <p>{{ profileIntro }}</p>
      <div class="quick-actions">
        <button v-if="!auth.isLoggedIn" class="primary-action" type="button" @click="router.push('/m/register/supplier')">
          {{ t('hall.supplier_entry') }}
        </button>
        <button v-if="!auth.isLoggedIn" class="secondary-action" type="button" @click="router.push('/m/mine')">
          {{ t('auth.login') }}
        </button>
        <button v-if="isSupplierUser" class="primary-action" type="button" @click="router.push('/m/tenders')">
          {{ t('hall.enter_supplier_hall') }}
        </button>
        <button v-if="isCompanyUser" class="primary-action" type="button" @click="router.push('/m/console')">
          {{ t('hall.manage_tenders') }}
        </button>
      </div>
    </section>

    <section class="summary-section" :aria-label="t('hall.portal_summary')">
      <div class="section-title">
        <h2>{{ t('hall.portal_summary') }}</h2>
        <button type="button" @click="load">{{ t('common.refresh') }}</button>
      </div>
      <div class="summary-scroll">
        <article v-for="item in summaryCards" :key="item.key" class="summary-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.caption }}</small>
        </article>
      </div>
    </section>

    <section class="list">
      <div class="list-head">
        <h2>{{ t('hall.public_tenders') }}</h2>
        <span>{{ t('hall.project_count', { count: portalSummary.publicTenderCount }) }}</span>
      </div>
      <button v-for="item in tenders" :key="item.id" class="tender-item" type="button" @click="router.push(`/m/hall/tenders/${item.id}`)">
        <div class="tender-row">
          <span>{{ item.title }}</span>
          <i>{{ t(`tender.status.${item.status}`, item.status) }}</i>
        </div>
        <small>{{ item.hallSummary || item.description || t('hall.public_project_summary') }}</small>
        <div class="tender-meta">
          <em>{{ t(`tender.${item.type}`, item.type) }}</em>
          <em>{{ t('hall.lot_count', { count: item.lots?.length || 0 }) }}</em>
          <em>{{ t('hall.deadline_short') }} {{ item.bidDeadline ? fmt(item.bidDeadline) : t('hall.long_term_valid') }}</em>
        </div>
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
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const profile = ref<any>({});
const tenders = ref<any[]>([]);
const loading = ref(false);
const portalSummary = ref({
  publicTenderCount: 0,
  publicLotCount: 0,
  publicQuoteOpenCount: 0,
  closingSoonCount: 0,
  nextDeadlineAt: null as string | null,
});
const isSupplierUser = computed(() => Boolean(auth.user?.supplierId));
const isCompanyUser = computed(() => Boolean(auth.user && !auth.user.supplierId));
const profileName = computed(() => {
  return ['BidFlow 采购招标中心', 'BidFlow Procurement Center'].includes(profile.value.name) ? t('hall.default_company_name') : (profile.value.name || t('hall.procurement_hall'));
});
const profileIntro = computed(() => {
  return ['面向供应商开放的公开招标与协同报价门户。', 'Public tender and collaborative quotation portal for suppliers.'].includes(profile.value.intro) ? t('hall.default_company_intro') : (profile.value.intro || t('hall.intro'));
});
const summaryCards = computed(() => [
  {
    key: 'publicTenderCount',
    label: t('hall.metric_public_projects'),
    value: portalSummary.value.publicTenderCount,
    caption: t('hall.metric_public_projects_desc'),
  },
  {
    key: 'publicLotCount',
    label: t('hall.metric_lots'),
    value: portalSummary.value.publicLotCount,
    caption: t('hall.metric_lots_desc'),
  },
  {
    key: 'publicQuoteOpenCount',
    label: t('hall.metric_quote_open'),
    value: portalSummary.value.publicQuoteOpenCount,
    caption: t('hall.metric_quote_open_desc'),
  },
  {
    key: 'closingSoonCount',
    label: t('hall.metric_closing_soon'),
    value: portalSummary.value.closingSoonCount,
    caption: portalSummary.value.nextDeadlineAt
      ? t('hall.metric_next_deadline', { time: fmt(portalSummary.value.nextDeadlineAt) })
      : t('hall.metric_closing_soon_desc'),
  },
]);

function fmt(value: string) {
  return dayjs(value).format('MM-DD HH:mm');
}

async function load() {
  loading.value = true;
  try {
    const [profileRes, summaryRes, tenderRes] = await Promise.all([
      api.get('/api/hall/company-profile'),
      api.get('/api/hall/portal-summary'),
      api.get('/api/hall/tenders'),
    ]);
    profile.value = profileRes.data.data ?? {};
    portalSummary.value = { ...portalSummary.value, ...(summaryRes.data.data ?? {}) };
    tenders.value = tenderRes.data.data ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mobile-hall {
  min-height: 100%;
  padding: 0 16px 28px;
  color: #111827;
}
.intro {
  padding: 22px 0 18px;
}
.eyebrow {
  margin-bottom: 8px;
  color: #007aff;
  font-size: 13px;
  font-weight: 700;
}
.intro h1 {
  margin: 0 0 10px;
  font-size: 34px;
  line-height: 1.08;
  letter-spacing: 0;
}
.intro p {
  margin: 0;
  color: #4b5563;
  line-height: 1.62;
}
.quick-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.primary-action,
.secondary-action {
  min-height: 44px;
  border-radius: 12px;
  border: 0;
  padding: 0 16px;
  font-size: 15px;
  font-weight: 700;
}
.primary-action {
  flex: 1;
  background: #007aff;
  color: #fff;
}
.secondary-action {
  background: rgba(120, 120, 128, .12);
  color: #007aff;
}
.summary-section,
.list {
  margin-top: 14px;
}
.section-title,
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-title h2,
.list-head h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}
.section-title button {
  border: 0;
  background: transparent;
  color: #007aff;
  font-size: 14px;
  font-weight: 600;
}
.summary-scroll {
  display: grid;
  grid-auto-columns: minmax(152px, 44%);
  grid-auto-flow: column;
  gap: 10px;
  margin: 0 -16px;
  padding: 0 16px 4px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.summary-scroll::-webkit-scrollbar {
  display: none;
}
.summary-card {
  min-height: 128px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  scroll-snap-align: start;
  padding: 14px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, .06);
}
.summary-card span {
  color: #374151;
  font-size: 13px;
  font-weight: 700;
}
.summary-card strong {
  color: #111827;
  font-size: 34px;
  line-height: 1;
}
.summary-card small {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
}
.list-head span {
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
}
.tender-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  padding: 15px;
  border: 0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, .05);
  text-align: left;
}
.tender-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}
.tender-row span {
  min-width: 0;
  color: #111827;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}
.tender-row i {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 122, 255, .10);
  color: #007aff;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.tender-item small {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
}
.tender-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tender-meta em {
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(120, 120, 128, .10);
  color: #4b5563;
  font-size: 12px;
  font-style: normal;
}
.empty {
  color: #6b7280;
}
.empty {
  padding: 34px 0;
  text-align: center;
}
</style>
