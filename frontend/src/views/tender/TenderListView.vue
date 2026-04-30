<!--
文件：frontend/src/views/tender/TenderListView.vue
功能：招标列表页，现代搜索 + 筛选标签 + 折叠式高级筛选。
交互：调用 tender.controller.ts 列表接口；受 stores/auth.ts 的权限能力控制。
作者：吴川
-->
<template>
  <div class="tender-list">
    <!-- 顶部 -->
    <div class="page-header">
      <div>
        <h2>{{ t('nav.tenders') }}</h2>
        <p class="subtle">{{ t('tenderList.total', { total }) }}</p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" size="large" @click="load">
          <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
        </el-button>
        <el-button v-if="auth.hasScope('tender:create')" type="primary" size="large" @click="router.push('/tenders/new')">
          <el-icon><Plus /></el-icon>{{ t('route.tenderCreate') }}
        </el-button>
      </div>
    </div>

    <!-- 搜索 + 筛选切换 -->
    <div class="search-bar">
      <el-input
        v-model.trim="filters.search"
        size="large"
        clearable
        :placeholder="t('tenderList.searchPlaceholder')"
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="quick-filters">
        <el-segmented
          v-model="quickStatus"
          :options="statusOptions"
          size="large"
        />
        <el-button
          size="large"
          :type="advancedOpen ? 'primary' : ''"
          :plain="!advancedOpen"
          @click="advancedOpen = !advancedOpen"
        >
          <el-icon><Filter /></el-icon>
          {{ t('common.advancedFilter') }}
          <el-badge v-if="advancedActiveCount" :value="advancedActiveCount" class="filter-badge" />
        </el-button>
      </div>
    </div>

    <!-- 高级筛选（折叠） -->
    <el-collapse-transition>
      <div v-show="advancedOpen" class="advanced-panel">
        <div class="advanced-grid">
          <div class="advanced-item">
            <label>{{ t('common.type') }}</label>
            <el-select v-model="filters.type" clearable :placeholder="t('common.allTypes')">
              <el-option value="engineering" :label="t('tender.engineering')" />
              <el-option value="transport" :label="t('tender.transport')" />
              <el-option value="routine" :label="t('tender.routine')" />
            </el-select>
          </div>
          <div class="advanced-item">
            <label>{{ t('common.currency') }}</label>
            <el-select v-model="filters.baseCurrency" clearable :placeholder="t('common.allCurrencies')">
              <el-option value="IDR" :label="t('currency.idr')" />
              <el-option value="USD" :label="t('currency.usd')" />
              <el-option value="CNY" :label="t('currency.cny')" />
            </el-select>
          </div>
          <div class="advanced-item">
            <label>{{ t('tenderList.hallVisibility') }}</label>
            <el-select v-model="filters.isHallVisible" clearable :placeholder="t('common.all')">
              <el-option :value="true" :label="t('tenderList.publicOnly')" />
              <el-option :value="false" :label="t('tenderList.internalOnly')" />
            </el-select>
          </div>
        </div>
      </div>
    </el-collapse-transition>

    <!-- 已选筛选标签 -->
    <div v-if="activeChips.length" class="filter-chips">
      <el-tag
        v-for="chip in activeChips"
        :key="chip.key"
        closable
        size="large"
        @close="clearFilter(chip.key)"
      >
        {{ chip.label }}
      </el-tag>
      <el-button text type="primary" size="small" @click="clearAll">{{ t('common.clearFilters') }}</el-button>
    </div>

    <!-- 表格 -->
    <el-table :data="tenders" v-loading="loading" stripe class="tender-table">
      <el-table-column prop="tenderNo" :label="t('common.number')" width="155">
        <template #default="{ row }">
          <span class="mono">{{ row.tenderNo }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" :label="t('common.name')" min-width="200" />
      <el-table-column prop="type" :label="t('common.type')" width="110">
        <template #default="{ row }">{{ t(`tender.${row.type}`) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ t(`tender.status.${row.status}`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('tenderList.currentRound')" width="95">
        <template #default="{ row }">{{ t('tenderList.roundNo', { round: row.currentQuoteRound ?? 1 }) }}</template>
      </el-table-column>
      <el-table-column prop="baseCurrency" :label="t('common.currency')" width="80" />
      <el-table-column prop="bidStartAt" :label="t('hall.start_time')" width="165">
        <template #default="{ row }">{{ row.bidStartAt ? fmtDate(row.bidStartAt) : t('hall.start_after_publish') }}</template>
      </el-table-column>
      <el-table-column prop="bidDeadline" :label="t('hall.deadline')" width="165">
        <template #default="{ row }">{{ row.bidDeadline ? fmtDate(row.bidDeadline) : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.createdAt')" width="165">
        <template #default="{ row }">{{ row.createdAt ? fmtDate(row.createdAt) : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.creator')" width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ userName(row.creator, row.createdBy) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.updater')" width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ userName(row.updater, row.updatedBy) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.updatedAt')" width="165">
        <template #default="{ row }">{{ row.updatedAt ? fmtDate(row.updatedAt) : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="router.push(`/tenders/${row.id}`)">{{ t('common.view') }}</el-button>
          <el-button
            v-if="row.status === 'draft' && auth.hasScope('tender:edit')"
            size="small" type="primary" plain
            @click="router.push(`/tenders/${row.id}/edit`)"
          >{{ t('common.edit') }}</el-button>
          <el-button
            v-if="row.status === 'published' && auth.hasScope('tender:publish')"
            size="small" plain
            @click="withdraw(row)"
          >{{ t('common.withdraw') }}</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="empty-state">
          <el-empty :description="filters.search || advancedActiveCount || quickStatus !== '' ? t('tenderList.noMatched') : t('tenderList.noTenders')" />
        </div>
      </template>
    </el-table>

    <el-pagination
      v-if="total > pageSize"
      :total="total"
      :page-size="pageSize"
      v-model:current-page="page"
      @current-change="load"
      layout="prev, pager, next, jumper"
      class="pagination"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search, Filter, Plus, Refresh,
} from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const tenders = ref<any[]>([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const advancedOpen = ref(false);
let queryTimer: ReturnType<typeof setTimeout> | undefined;

const filters = reactive({
  search: '',
  status: '',
  type: '',
  baseCurrency: '',
  isHallVisible: undefined as boolean | undefined,
});

// quick status segmented control (separate from filters.status to provide "全部" option)
const quickStatus = ref('');
watch(quickStatus, (v) => { filters.status = v; });

const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('tender.status.draft'), value: 'draft' },
  { label: t('tender.status.published'), value: 'published' },
  { label: t('tender.status.open'), value: 'open' },
  { label: t('tender.status.closed'), value: 'closed' },
]);

const advancedActiveCount = computed(() => {
  let n = 0;
  if (filters.type) n++;
  if (filters.baseCurrency) n++;
  if (filters.isHallVisible !== undefined && filters.isHallVisible !== null) n++;
  return n;
});

const activeChips = computed(() => {
  const chips: { key: string; label: string }[] = [];
  if (filters.type) chips.push({ key: 'type', label: `${t('common.type')}: ${t(`tender.${filters.type}`)}` });
  if (filters.baseCurrency) chips.push({ key: 'baseCurrency', label: `${t('common.currency')}: ${filters.baseCurrency}` });
  if (filters.isHallVisible === true) chips.push({ key: 'isHallVisible', label: t('tenderList.publicOnly') });
  if (filters.isHallVisible === false) chips.push({ key: 'isHallVisible', label: t('tenderList.internalOnly') });
  return chips;
});

function clearFilter(key: string) {
  if (key === 'isHallVisible') filters.isHallVisible = undefined;
  else (filters as any)[key] = '';
}

function clearAll() {
  filters.search = '';
  filters.status = '';
  filters.type = '';
  filters.baseCurrency = '';
  filters.isHallVisible = undefined;
  quickStatus.value = '';
}

function fmtDate(iso: string) { return dayjs(iso).format('YYYY-MM-DD HH:mm'); }
function userName(user?: any, fallback?: string) {
  return user?.displayName || user?.loginName || user?.email || fallback || '—';
}
function statusTag(s: string) {
  return { draft: 'info', published: '', open: 'success', closed: 'danger', cancelled: 'danger', awarded: 'warning' }[s] ?? '';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/tenders', {
      params: {
        page: page.value,
        limit: pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        baseCurrency: filters.baseCurrency || undefined,
        isHallVisible: filters.isHallVisible,
      },
    });
    tenders.value = res.data.data;
    total.value = res.data.meta?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function scheduleLoad() {
  if (queryTimer) clearTimeout(queryTimer);
  queryTimer = setTimeout(() => { page.value = 1; load(); }, 260);
}

async function withdraw(row: any) {
  await ElMessageBox.confirm(t('tenderList.withdrawConfirm', { title: row.title }), t('tenderList.withdrawTitle'), {
    type: 'warning',
    confirmButtonText: t('tenderList.confirmWithdraw'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/tenders/${row.id}/withdraw`);
  ElMessage.success(t('tenderList.withdrawn'));
  load();
}

watch(filters, scheduleLoad, { deep: true });
onMounted(load);
onActivated(load);
onBeforeUnmount(() => { if (queryTimer) clearTimeout(queryTimer); });
</script>

<style scoped>
.tender-list { display: grid; gap: 16px; }

/* ── Header ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-header h2 { margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -.01em; }
.subtle { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

/* ── Search bar ── */
.search-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.search-input { flex: 1; min-width: 280px; max-width: 480px; }
.search-input :deep(.el-input__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #e5e7eb;
  transition: box-shadow .15s;
}
.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #2563eb, 0 0 0 4px rgba(37, 99, 235, .1);
}
.quick-filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.filter-badge :deep(.el-badge__content) { transform: translate(60%, -50%); }

/* ── Advanced panel ── */
.advanced-panel {
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.advanced-item { display: flex; flex-direction: column; gap: 6px; }
.advanced-item label { font-size: 12px; color: #64748b; font-weight: 500; }
.advanced-item :deep(.el-select) { width: 100%; }

/* ── Filter chips ── */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* ── Table ── */
.tender-table {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}
.tender-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}
.mono { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; color: #475569; }

.empty-state { padding: 40px 0; }

.pagination { margin-top: 4px; justify-content: flex-end; display: flex; }

@media (max-width: 768px) {
  .search-bar { flex-direction: column; align-items: stretch; }
  .search-input { max-width: none; }
  .quick-filters { width: 100%; justify-content: space-between; }
}
</style>
