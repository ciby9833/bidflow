<!--
文件：frontend/src/mobile/console/suppliers/MobileSupplierSearchView.vue
功能：移动端供应商实时搜索页，支持关键词、供应商状态、审核状态任意组合筛选。
交互：调用 /api/suppliers 原地展示结果；同步路由 query 用于恢复搜索状态，不强制返回列表。
作者：吴川
-->
<template>
  <main class="search-page" v-loading="loading">
    <section class="search-box">
      <input
        ref="searchInput"
        v-model.trim="filters.search"
        enterkeyhint="search"
        placeholder="搜索供应商名称 / 编号"
        type="search"
      />
    </section>

    <section class="filter-area" aria-label="供应商筛选">
      <div class="filter-row" role="list" aria-label="供应商状态">
        <button
          v-for="item in statusOptions"
          :key="item.value || 'all-status'"
          :class="['chip', filters.status === item.value ? 'active' : '']"
          type="button"
          @click="filters.status = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="filter-row" role="list" aria-label="审核状态">
        <button
          v-for="item in reviewOptions"
          :key="item.value || 'all-review'"
          :class="['chip', filters.reviewStatus === item.value ? 'active' : '']"
          type="button"
          @click="filters.reviewStatus = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <section class="result-head">
      <strong>结果</strong>
      <span>{{ total }} 个供应商</span>
    </section>

    <section v-if="suppliers.length" class="group">
      <button
        v-for="row in suppliers"
        :key="row.id"
        class="supplier-row"
        type="button"
        @click="router.push(`/m/console/suppliers/${row.id}/review`)"
      >
        <span class="avatar">{{ supplierInitial(row) }}</span>
        <span class="content">
          <strong>{{ row.legalName || row.shortName || row.businessId }}</strong>
          <small>{{ row.businessId }} · {{ row.countryCode || '—' }}</small>
          <em>{{ row.contactName || '未设置联系人' }}</em>
          <span class="badges">
            <i :class="['badge', statusTone(row.status)]">{{ statusText(row.status) }}</i>
            <i :class="['badge', reviewTone(row.reviewStatus)]">{{ reviewText(row.reviewStatus) }}</i>
          </span>
        </span>
      </button>
    </section>

    <div v-else-if="!loading" class="empty">没有匹配的供应商</div>
    <button v-if="hasMore" class="more" type="button" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? '加载中' : '加载更多' }}
    </button>
  </main>
</template>

<script setup lang="ts">
import {
  computed, nextTick, onMounted, reactive, ref, watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../../composables/useApi';
import {
  reviewText, reviewTone, statusText, statusTone, supplierInitial,
} from './supplier-options';

const route = useRoute();
const router = useRouter();
const searchInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const suppliers = ref<any[]>([]);
const total = ref(0);
const initialized = ref(false);
let searchTimer: number | undefined;

const filters = reactive({
  search: '',
  status: '',
  reviewStatus: '',
  page: 1,
  limit: 20,
});

const statusOptions = [
  { label: '全部', value: '' },
  { label: '启用', value: 'active' },
  { label: '冻结', value: 'suspended' },
];
const reviewOptions = [
  { label: '全部审核', value: '' },
  { label: '未提交', value: 'not_submitted' },
  { label: '待审核', value: 'pending_review' },
  { label: '补件中', value: 'supplement_required' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
];

const hasMore = computed(() => suppliers.value.length < total.value);
function query() {
  return {
    search: filters.search || undefined,
    status: filters.status || undefined,
    reviewStatus: filters.reviewStatus || undefined,
  };
}

function syncRouteQuery() {
  router.replace({ path: '/m/console/suppliers/search', query: query() });
}

async function load(append = false) {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  try {
    const res = await api.get('/api/suppliers', {
      params: {
        search: filters.search || undefined,
        status: filters.status || undefined,
        reviewStatus: filters.reviewStatus || undefined,
        page: filters.page,
        limit: filters.limit,
      },
    });
    const rows = res.data.data ?? [];
    suppliers.value = append ? [...suppliers.value, ...rows] : rows;
    total.value = Number(res.data.meta?.total ?? suppliers.value.length);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function reload() {
  filters.page = 1;
  syncRouteQuery();
  load();
}

function loadMore() {
  filters.page += 1;
  load(true);
}

onMounted(async () => {
  filters.search = String(route.query.search ?? '');
  filters.status = String(route.query.status ?? '');
  filters.reviewStatus = String(route.query.reviewStatus ?? '');
  await load();
  initialized.value = true;
  nextTick(() => searchInput.value?.focus());
});

watch(
  () => [filters.search, filters.status, filters.reviewStatus],
  () => {
    if (!initialized.value) return;
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(reload, 220);
  },
);
</script>

<style scoped>
.search-page {
  min-height: 100%;
  padding: 12px 12px 28px;
  background: #f2f2f7;
}
.search-box {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 10px;
  background: #f2f2f7;
}
.search-box input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 0 13px;
  border: 0;
  border-radius: 11px;
  outline: none;
  background: #fff;
  color: #111827;
  font-size: 16px;
}
.filter-area {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}
.filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.filter-row::-webkit-scrollbar {
  display: none;
}
.chip {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #4b5563;
  font-size: 14px;
  white-space: nowrap;
}
.chip.active {
  background: #007aff;
  color: #fff;
  font-weight: 650;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 2px 10px;
}
.result-head strong {
  color: #111827;
  font-size: 17px;
}
.result-head span {
  color: #6b7280;
  font-size: 13px;
}
.group {
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
}
.supplier-row {
  position: relative;
  width: 100%;
  min-height: 86px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px 34px 12px 12px;
  border: 0;
  border-bottom: 1px solid #e5e5ea;
  background: #fff;
  text-align: left;
}
.supplier-row:last-child {
  border-bottom: 0;
}
.supplier-row::after {
  position: absolute;
  right: 14px;
  width: 8px;
  height: 8px;
  border-top: 2px solid #c7c7cc;
  border-right: 2px solid #c7c7cc;
  content: '';
  transform: rotate(45deg);
}
.avatar {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eef7ed;
  color: #16833a;
  font-weight: 700;
}
.content {
  min-width: 0;
}
.content strong,
.content small,
.content em {
  display: block;
}
.content strong {
  color: #111827;
  font-size: 16px;
}
.content small,
.content em {
  margin-top: 4px;
  overflow: hidden;
  color: #6b7280;
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.badge {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
}
.badge.ok {
  background: #e9f8ee;
  color: #16833a;
}
.badge.warn {
  background: #fff7e6;
  color: #9a5b00;
}
.badge.danger {
  background: #fff0f0;
  color: #c92a2a;
}
.badge.neutral {
  background: #f2f2f7;
  color: #6b7280;
}
.empty {
  padding: 42px 0;
  color: #8e8e93;
  font-size: 15px;
  text-align: center;
}
.more {
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border: 0;
  border-radius: 13px;
  background: #fff;
  color: #007aff;
  font-size: 15px;
  font-weight: 650;
}
</style>
