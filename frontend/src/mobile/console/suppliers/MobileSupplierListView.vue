<!--
文件：frontend/src/mobile/console/suppliers/MobileSupplierListView.vue
功能：移动端供应商管理列表页，按 iOS 分组列表展示供应商主体。
交互：调用 /api/suppliers；点击供应商进入独立审核详情页。
作者：吴川
-->
<template>
  <main class="supplier-list" v-loading="loading">
    <div class="toolbar">
      <button class="search-entry" type="button" @click="router.push({ path: '/m/console/suppliers/search', query: route.query })">
        <span>{{ searchEntryText }}</span>
      </button>
      <button v-if="auth.hasScope('supplier:create')" class="add-button" type="button" aria-label="新增供应商" @click="router.push('/m/console/suppliers/new')">＋</button>
    </div>

    <section class="group">
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
          <span class="chips">
            <i :class="['chip', statusTone(row.status)]">{{ statusText(row.status) }}</i>
            <i :class="['chip', reviewTone(row.reviewStatus)]">{{ reviewText(row.reviewStatus) }}</i>
          </span>
        </span>
      </button>
    </section>
    <div v-if="!loading && suppliers.length === 0" class="empty">暂无供应商</div>
    <button v-if="hasMore" class="more" type="button" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? '加载中' : '加载更多' }}</button>

  </main>
</template>

<script setup lang="ts">
import {
  computed, onMounted, reactive, ref, watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../../composables/useApi';
import { useAuthStore } from '../../../stores/auth';
import {
  reviewText, reviewTone, statusText, statusTone, supplierInitial,
} from './supplier-options';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const loadingMore = ref(false);
const suppliers = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ search: '', status: '', reviewStatus: '', page: 1, limit: 20 });

const statusOptions = [
  { label: '全部状态', value: '' },
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
const statusFilterText = computed(() => statusOptions.find((item) => item.value === filters.status)?.label ?? '全部状态');
const reviewFilterText = computed(() => reviewOptions.find((item) => item.value === filters.reviewStatus)?.label ?? '全部审核');
const hasMore = computed(() => suppliers.value.length < total.value);
const searchEntryText = computed(() => {
  const parts = [
    filters.search,
    filters.status ? statusFilterText.value : '',
    filters.reviewStatus ? reviewFilterText.value : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '搜索供应商名称 / 编号';
});

function syncFiltersFromQuery() {
  filters.search = String(route.query.search ?? '');
  filters.status = String(route.query.status ?? '');
  filters.reviewStatus = String(route.query.reviewStatus ?? '');
  filters.page = 1;
}

async function load() {
  loading.value = true;
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
    suppliers.value = res.data.data ?? [];
    total.value = Number(res.data.meta?.total ?? suppliers.value.length);
  } finally {
    loading.value = false;
  }
}

function reload() {
  filters.page = 1;
  load();
}

async function loadMore() {
  loadingMore.value = true;
  try {
    filters.page += 1;
    const res = await api.get('/api/suppliers', {
      params: {
        search: filters.search || undefined,
        status: filters.status || undefined,
        reviewStatus: filters.reviewStatus || undefined,
        page: filters.page,
        limit: filters.limit,
      },
    });
    suppliers.value = [...suppliers.value, ...(res.data.data ?? [])];
    total.value = Number(res.data.meta?.total ?? suppliers.value.length);
  } finally {
    loadingMore.value = false;
  }
}

onMounted(() => {
  syncFiltersFromQuery();
  load();
});

watch(
  () => route.query,
  () => {
    syncFiltersFromQuery();
    load();
  },
);
</script>

<style scoped>
.supplier-list {
  min-height: 100%;
  padding: 14px 12px 28px;
  background: #f2f2f7;
}
.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 8px;
  margin-bottom: 12px;
}
.search-entry {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  color: #8e8e93;
  font-size: 15px;
  text-align: left;
}
.add-button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 12px;
  background: #007aff;
  color: #fff;
  font-size: 24px;
  line-height: 1;
  font-weight: 500;
}
.search-entry::before {
  margin-right: 8px;
  color: #8e8e93;
  content: '⌕';
  font-size: 17px;
}
.search-entry span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #6b7280;
  font-size: 13px;
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
}
.chip.ok {
  background: #e9f8ee;
  color: #16833a;
}
.chip.warn {
  background: #fff4df;
  color: #9a5a00;
}
.chip.danger {
  background: #ffecec;
  color: #c81e1e;
}
.chip.neutral {
  background: #f2f2f7;
  color: #6b7280;
}
.empty {
  padding: 44px 0;
  color: #6b7280;
  text-align: center;
}
.more {
  width: 100%;
  height: 44px;
  margin-top: 14px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  color: #007aff;
  font-size: 15px;
  font-weight: 600;
}
</style>
