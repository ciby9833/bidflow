<!--
文件：frontend/src/mobile/bid/MobileSupplierBidSearchView.vue
功能：H5 我的投标独立搜索页，承载关键词录入和筛选结果。
交互：调用 api/supplier/bids；取消返回我的投标，详情和报价复用 H5 现有页面。
作者：吴川
-->
<template>
  <main class="mobile-bid-search" v-loading="loading">
    <div class="search-topbar">
      <div class="search-field active">
        <input
          ref="searchInputRef"
          v-model.trim="filters.search"
          :placeholder="t('bidRecords.searchPlaceholder')"
          type="search"
          @keyup.enter="loadSearch"
        />
      </div>
      <button class="cancel-btn" type="button" @click="router.replace('/m/supplier/bids')">{{ t('common.cancel') }}</button>
    </div>

    <div class="filter-strip" :aria-label="t('common.status')">
      <button
        v-for="item in statusOptions"
        :key="item.value"
        :class="{ active: filters.status === item.value }"
        type="button"
        @click="setFilter('status', item.value)"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="filter-strip" :aria-label="t('tender.type')">
      <button
        v-for="item in typeOptions"
        :key="item.value"
        :class="{ active: filters.type === item.value }"
        type="button"
        @click="setFilter('type', item.value)"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="filter-strip" :aria-label="t('bidRecords.bidMethod')">
      <button
        v-for="item in kindOptions"
        :key="item.value"
        :class="{ active: filters.kind === item.value }"
        type="button"
        @click="setFilter('kind', item.value)"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="filter-strip" :aria-label="t('supplierTenderHall.scopeFilter')">
      <button
        v-for="item in scopeOptions"
        :key="item.value"
        :class="{ active: filters.participationScope === item.value }"
        type="button"
        @click="setFilter('participationScope', item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <section class="result-bar">
      <span>{{ filters.search || activeFilterText ? t('bidRecords.searchResults') : t('bidRecords.searchPrompt') }}</span>
      <strong>{{ total }}</strong>
    </section>

    <section class="record-list">
      <article v-for="item in records" :key="item.id" class="record-card">
        <button class="card-main" type="button" @click="openTender(item)">
          <div class="card-top">
            <span class="tender-no">{{ item.tenderNo }}</span>
            <span class="card-tags">
              <em :class="['scope-pill', participationClass(resolveParticipationScope(item))]">{{ scopeLabel(item) }}</em>
              <em :class="['status-pill', item.tenderStatus]">{{ statusLabel(item.tenderStatus) }}</em>
            </span>
          </div>
          <h2>{{ item.tenderTitle }}</h2>
          <p>{{ item.lotNo }} · {{ item.lotTitle }}</p>
          <dl>
            <div><dt>{{ t('bidRecords.bidMethod') }}</dt><dd>{{ kindLabel(item) }}</dd></div>
            <div><dt>{{ t('bidRecords.latestAmount') }}</dt><dd>{{ formatMoney(item.latestTotalPrice) }} {{ item.currency }}</dd></div>
            <div><dt>{{ t('bidRecords.quoteCount') }}</dt><dd>{{ quoteCountText(item) }}</dd></div>
            <div><dt>{{ t('common.submit') }}</dt><dd>{{ fmtDate(item.submittedAt) }}</dd></div>
          </dl>
        </button>
        <div class="card-actions">
          <button type="button" @click="openTender(item)">{{ t('common.details') }}</button>
          <button
            class="primary"
            type="button"
            :disabled="item.tenderStatus !== 'open'"
            @click="openQuote(item)"
          >
            {{ item.tenderStatus === 'open' ? t('bidRecords.continueBid') : t('bidRecords.closed') }}
          </button>
        </div>
      </article>
      <div v-if="!loading && records.length === 0" class="empty">{{ t('bidRecords.noMatched') }}</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { api } from '../../composables/useApi';
import { participationClass, participationLabelKey, resolveParticipationScope } from '../../utils/participation';

const router = useRouter();
const { t, locale } = useI18n();
const loading = ref(false);
const records = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const searchInputRef = ref<HTMLInputElement | null>(null);
let queryTimer: ReturnType<typeof setTimeout> | undefined;

const filters = reactive({
  search: '', status: '', type: '', kind: '', participationScope: '',
});
const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('tender.status.open'), value: 'open' },
  { label: t('tender.status.published'), value: 'published' },
  { label: t('tender.status.closed'), value: 'closed' },
  { label: t('tender.status.awarded'), value: 'awarded' },
]);
const typeOptions = computed(() => [
  { label: t('common.allTypes'), value: '' },
  { label: t('tender.transport'), value: 'transport' },
  { label: t('tender.engineering'), value: 'engineering' },
  { label: t('tender.routine'), value: 'routine' },
]);
const kindOptions = computed(() => [
  { label: t('bidRecords.allBids'), value: '' },
  { label: t('bidRecords.lotQuote'), value: 'lot' },
  { label: t('bidRecords.lineQuote'), value: 'line' },
]);
const scopeOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('supplierTenderHall.invitedMe'), value: 'invited' },
  { label: t('supplierTenderHall.publicTender'), value: 'public' },
]);
const activeFilterText = computed(() => {
  const status = statusOptions.value.find((item) => item.value === filters.status)?.label;
  const type = typeOptions.value.find((item) => item.value === filters.type)?.label;
  const kind = kindOptions.value.find((item) => item.value === filters.kind)?.label;
  const scope = scopeOptions.value.find((item) => item.value === filters.participationScope)?.label;
  return [
    status && filters.status ? status : '',
    type && filters.type ? type : '',
    kind && filters.kind ? kind : '',
    scope && filters.participationScope ? scope : '',
  ].filter(Boolean).join(' · ');
});

function fmtDate(value?: string) {
  return value ? dayjs(value).format('MM-DD HH:mm') : t('common.not_set');
}
function formatMoney(value: number | string) {
  return Number(value ?? 0).toLocaleString(locale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}
function scopeLabel(item: any) {
  return t(participationLabelKey(resolveParticipationScope(item)));
}
function kindLabel(item: any) {
  if (item.kind !== 'line') return t('bidRecords.lotQuote');
  return item.roundNo ? t('bidRecords.lineQuoteRound', { round: item.roundNo }) : t('bidRecords.lineQuote');
}
function quoteCountText(item: any) {
  if (item.kind === 'line') return `${t('quote.times', { count: item.quoteCount })} · ${t('bidRecords.lineCount', { submitted: item.submittedLineCount, total: item.totalLineCount })}`;
  return t('quote.times', { count: item.quoteCount });
}
async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/supplier/bids', {
      params: {
        page: page.value,
        limit: pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        kind: filters.kind || undefined,
        participationScope: filters.participationScope || undefined,
      },
    });
    records.value = res.data.data ?? [];
    total.value = res.data.meta?.total ?? records.value.length;
  } finally {
    loading.value = false;
  }
}
function scheduleLoad() {
  if (queryTimer) clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 220);
}
function loadSearch() {
  page.value = 1;
  void load();
}
function setFilter(key: 'status' | 'type' | 'kind' | 'participationScope', value: string) {
  filters[key] = filters[key] === value ? '' : value;
}
function openTender(item: any) {
  router.push(`/m/tenders/${item.tenderId}`);
}
function openQuote(item: any) {
  if (item.tenderStatus === 'open') router.push(`/m/quotes/lots/${item.lotId}`);
}

watch(filters, scheduleLoad, { deep: true });
onMounted(() => {
  void load();
  nextTick(() => searchInputRef.value?.focus());
});
onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer);
});
</script>

<style scoped>
.mobile-bid-search {
  min-height: 100%;
  padding: 12px 14px 24px;
  background: #f7f8fa;
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
.search-field {
  height: 38px;
  display: flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 0 12px;
}
.search-field input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #111827;
  font-size: 13px;
}
.cancel-btn {
  height: 36px;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
  padding: 0 2px;
}
.filter-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 0 2px;
  scrollbar-width: none;
}
.filter-strip::-webkit-scrollbar { display: none; }
.filter-strip button {
  flex: 0 0 auto;
  min-height: 30px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  padding: 0 12px;
}
.filter-strip button.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}
.result-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0 4px;
  color: #64748b;
  font-size: 12px;
}
.result-bar strong { color: #2563eb; font-size: 13px; }
.record-list { display: grid; gap: 10px; margin-top: 10px; }
.record-card {
  display: grid;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}
.card-main {
  display: grid;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}
.card-top, .card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-tags {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}
.tender-no {
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
.status-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  padding: 3px 7px;
}
.scope-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  padding: 3px 7px;
}
.scope-pill.invited { background: #fff7ed; color: #c2410c; }
.scope-pill.public { background: #eff6ff; color: #1d4ed8; }
.status-pill.open { background: #dcfce7; color: #15803d; }
.status-pill.closed { background: #f1f5f9; color: #475569; }
.status-pill.awarded { background: #fef3c7; color: #92400e; }
.record-card h2 {
  margin: 0;
  color: #111827;
  font-size: 15px;
  line-height: 1.35;
}
.record-card p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.record-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
}
.record-card dt { color: #94a3b8; font-size: 11px; }
.record-card dd {
  margin: 2px 0 0;
  color: #111827;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
}
.card-actions { padding-top: 2px; }
.card-actions button {
  height: 34px;
  flex: 1;
  border: 1px solid #dbe3ef;
  border-radius: 9px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}
.card-actions button.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}
.card-actions button:disabled {
  border-color: #e5e7eb;
  background: #f3f4f6;
  color: #94a3b8;
}
.empty {
  padding: 42px 0;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}
</style>
