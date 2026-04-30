<!--
文件：frontend/src/mobile/tender/MobileTenderSearchView.vue
功能：H5 招标大厅独立搜索页，承载关键词录入和筛选结果。
交互：调用 api/supplier/tenders；取消返回招标大厅，详情和报价复用 H5 现有页面。
作者：吴川
-->
<template>
  <main class="mobile-tender-search" v-loading="loading">
    <div class="search-topbar">
      <div class="search-field active">
        <input
          ref="searchInputRef"
          v-model.trim="filters.search"
          placeholder="项目名称、编号或摘要"
          type="search"
          @keyup.enter="loadSearch"
        />
      </div>
      <button class="cancel-btn" type="button" @click="router.replace('/m/tenders')">取消</button>
    </div>

    <div class="filter-strip" aria-label="状态筛选">
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
    <div class="filter-strip" aria-label="类型筛选">
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

    <section class="result-bar">
      <span>{{ filters.search || activeFilterText ? '搜索结果' : '输入关键词或选择筛选条件' }}</span>
      <strong>{{ total }}</strong>
    </section>

    <section class="tender-list">
      <article v-for="item in tenders" :key="item.id" class="tender-card">
        <button class="card-main" type="button" @click="openTender(item)">
          <div class="card-top">
            <span class="tender-no">{{ item.tenderNo }}</span>
            <em :class="['status-pill', item.status]">{{ statusLabel(item.status) }}</em>
          </div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.hallSummary || item.description || '暂无项目摘要' }}</p>
          <dl>
            <div><dt>类型</dt><dd>{{ typeLabel(item.type) }}</dd></div>
            <div><dt>截止</dt><dd>{{ fmtDate(item.bidDeadline) }}</dd></div>
            <div><dt>标包</dt><dd>{{ item.lots?.length ?? 0 }} 个</dd></div>
            <div><dt>开始</dt><dd>{{ startTimeText(item) }}</dd></div>
          </dl>
        </button>
        <div class="card-actions">
          <button type="button" @click="openTender(item)">详情</button>
          <button v-if="item.status === 'open' && item.lots?.[0]?.id" class="primary" type="button" @click="openQuote(item)">去报价</button>
        </div>
      </article>
    </section>
    <div v-if="!loading && tenders.length === 0" class="empty">暂无匹配项目</div>
  </main>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { api } from '../../composables/useApi';

const router = useRouter();
const loading = ref(false);
const tenders = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const searchInputRef = ref<HTMLInputElement | null>(null);
let queryTimer: ReturnType<typeof setTimeout> | undefined;

const filters = reactive({ search: '', status: '', type: '' });
const statusOptions = [
  { label: '全部', value: '' },
  { label: '报价中', value: 'open' },
  { label: '已发布', value: 'published' },
  { label: '已关标', value: 'closed' },
];
const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '运力', value: 'transport' },
  { label: '工程', value: 'engineering' },
  { label: '常规', value: 'routine' },
];
const activeFilterText = computed(() => {
  const status = statusOptions.find((item) => item.value === filters.status)?.label;
  const type = typeOptions.find((item) => item.value === filters.type)?.label;
  return [status && filters.status ? status : '', type && filters.type ? type : ''].filter(Boolean).join(' · ');
});

function fmtDate(value?: string) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '未设置';
}
function startTimeText(item: any) {
  return item.bidStartAt ? fmtDate(item.bidStartAt) : '发布后立即';
}
function typeLabel(type: string) {
  return { engineering: '工程招标', transport: '运力招标', routine: '常规采购' }[type] ?? type;
}
function statusLabel(status: string) {
  return { published: '已发布', open: '报价中', closed: '已关标', awarded: '已定标' }[status] ?? status;
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
    void load();
  }, 220);
}
function loadSearch() {
  page.value = 1;
  void load();
}
function setFilter(key: 'status' | 'type', value: string) {
  filters[key] = filters[key] === value ? '' : value;
}
function openTender(item: any) {
  router.push(`/m/tenders/${item.id}`);
}
function openQuote(item: any) {
  const lotId = item.lots?.[0]?.id;
  if (lotId) router.push(`/m/quotes/lots/${lotId}`);
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
.mobile-tender-search {
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
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
}
.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
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
.result-bar span { color: #64748b; font-size: 12px; }
.result-bar strong { color: #0f172a; font-size: 16px; }
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
