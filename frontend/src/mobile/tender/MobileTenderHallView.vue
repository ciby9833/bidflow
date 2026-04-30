<!--
文件：frontend/src/mobile/tender/MobileTenderHallView.vue
功能：H5 招标大厅，展示并搜索当前账号可访问的招标项目。
交互：调用 api/supplier/tenders；点击搜索进入独立搜索状态，筛选后返回结果。
作者：吴川
-->
<template>
  <main class="mobile-tender-hall" v-loading="loading">
    <section class="hall-head">
      <div>
        <span>BidFlow</span>
        <h1>{{ t('route.supplierTenders') }}</h1>
      </div>
      <strong>{{ t('supplierTenderHall.lotCount', { count: total }) }}</strong>
    </section>

    <button class="search-field" type="button" @click="openSearch">
      <em>{{ t('supplierTenderHall.searchPlaceholder') }}</em>
    </button>

    <section class="filter-strip quick" :aria-label="t('supplierTenderHall.quickStatusFilter')">
      <button
        v-for="item in statusOptions.slice(0, 4)"
        :key="item.value"
        :class="{ active: filters.status === item.value }"
        type="button"
        @click="setStatus(item.value)"
      >
        {{ item.label }}
      </button>
    </section>

    <section class="tender-list">
      <article v-for="item in tenders" :key="item.id" class="tender-card">
        <button class="card-main" type="button" @click="openTender(item)">
          <div class="card-top">
            <span class="tender-no">{{ item.tenderNo }}</span>
            <em :class="['status-pill', item.status]">{{ statusLabel(item.status) }}</em>
          </div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.hallSummary || item.description || t('supplierTenderHall.noSummary') }}</p>
          <dl>
            <div><dt>{{ t('common.type') }}</dt><dd>{{ typeLabel(item.type) }}</dd></div>
            <div><dt>{{ t('hall.deadline_short') }}</dt><dd>{{ fmtDate(item.bidDeadline) }}</dd></div>
            <div><dt>{{ t('hall.lots') }}</dt><dd>{{ t('supplierTenderHall.lotCount', { count: item.lots?.length ?? 0 }) }}</dd></div>
            <div><dt>{{ t('hall.start') }}</dt><dd>{{ startTimeText(item) }}</dd></div>
          </dl>
        </button>
        <div class="card-actions">
          <button type="button" @click="openTender(item)">{{ t('common.details') }}</button>
          <button v-if="item.status === 'open' && item.lots?.[0]?.id" class="primary" type="button" @click="openQuote(item)">{{ t('supplierTenderHall.quoteNow') }}</button>
        </div>
      </article>
    </section>
    <div v-if="!loading && tenders.length === 0" class="empty">{{ t('supplierTenderHall.noAccessible') }}</div>
  </main>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { api } from '../../composables/useApi';

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const tenders = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
let queryTimer: ReturnType<typeof setTimeout> | undefined;

const filters = reactive({
  search: '',
  status: '',
  type: '',
});

const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('tender.status.open'), value: 'open' },
  { label: t('tender.status.published'), value: 'published' },
  { label: t('tender.status.closed'), value: 'closed' },
  { label: t('tender.status.awarded'), value: 'awarded' },
]);
function fmtDate(value?: string) {
  return value ? dayjs(value).format('MM-DD HH:mm') : t('common.not_set');
}
function startTimeText(item: any) {
  return item.bidStartAt ? fmtDate(item.bidStartAt) : t('hall.start_after_publish');
}
function typeLabel(type: string) {
  return type ? t(`tender.${type}`) : '';
}
function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}
async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/supplier/tenders', {
      params: {
        page: page.value,
        limit: pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
      },
    });
    tenders.value = res.data.data ?? [];
    total.value = res.data.meta?.total ?? tenders.value.length;
  } finally {
    loading.value = false;
  }
}
function scheduleLoad() {
  if (queryTimer) clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 0);
}
function openSearch() {
  router.push('/m/tenders/search');
}
function setStatus(value: string) {
  filters.status = filters.status === value ? '' : value;
}
function openTender(item: any) {
  router.push(`/m/tenders/${item.id}`);
}
function openQuote(item: any) {
  const lotId = item.lots?.[0]?.id;
  if (lotId) router.push(`/m/quotes/lots/${lotId}`);
}

watch(filters, scheduleLoad, { deep: true });
onMounted(load);
onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer);
});
</script>

<style scoped>
.mobile-tender-hall {
  min-height: 100%;
  padding: 12px 14px 24px;
  background: #f7f8fa;
}
.hall-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.hall-head div { display: grid; gap: 3px; }
.hall-head span, .result-bar span { color: #64748b; font-size: 12px; }
.hall-head h1 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.15;
}
.hall-head strong {
  flex: 0 0 auto;
  color: #0369a1;
  font-size: 13px;
  font-weight: 700;
}
.search-field {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
  text-align: left;
}
.search-field.active {
  border-color: #bfdbfe;
  background: #fff;
}
.search-field em { font-style: normal; font-size: 13px; }
.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
}
.search-topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 2px 0 10px;
  background: #f7f8fa;
}
.cancel-btn {
  border: 0;
  background: transparent;
  color: #0369a1;
  font-size: 14px;
}
.filter-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 0 2px;
  scrollbar-width: none;
}
.filter-strip.quick { padding-top: 12px; }
.filter-strip::-webkit-scrollbar { display: none; }
.filter-strip button {
  flex: 0 0 auto;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  min-height: 30px;
  padding: 0 11px;
  background: #fff;
  color: #475569;
  font-size: 12px;
}
.filter-strip button.active {
  border-color: #0369a1;
  background: #e0f2fe;
  color: #075985;
  font-weight: 600;
}
.result-bar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 14px 0 4px;
}
.result-bar strong {
  color: #0f172a;
  font-size: 16px;
}
.tender-list { display: grid; gap: 10px; margin-top: 10px; }
.tender-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.card-main {
  display: grid;
  gap: 9px;
  width: 100%;
  border: 0;
  padding: 12px;
  background: transparent;
  text-align: left;
}
.card-top, .card-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.tender-no { color: #64748b; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
.status-pill { border-radius: 999px; padding: 3px 7px; background: #f1f5f9; color: #475569; font-size: 11px; font-style: normal; }
.status-pill.published { background: #e0f2fe; color: #075985; }
.status-pill.open { background: #dcfce7; color: #166534; }
.status-pill.closed { background: #f1f5f9; color: #64748b; }
.status-pill.awarded { background: #fef3c7; color: #92400e; }
.tender-card h2 { margin: 0; color: #0f172a; font-size: 15px; line-height: 1.35; }
.tender-card p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
.tender-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.tender-card dl div { min-width: 0; padding: 8px; border-radius: 8px; background: #f8fafc; }
.tender-card dt { color: #94a3b8; font-size: 11px; }
.tender-card dd { margin: 3px 0 0; color: #0f172a; font-size: 12px; font-weight: 600; }
.card-actions { padding: 9px 12px; border-top: 1px solid #eef2f7; }
.card-actions button {
  flex: 1;
  border: 0;
  border-radius: 8px;
  min-height: 34px;
  padding: 0 10px;
  background: #f1f5f9;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}
.card-actions .primary { background: #0369a1; color: #fff; }
.empty { padding: 44px 0; text-align: center; color: #64748b; }
</style>
