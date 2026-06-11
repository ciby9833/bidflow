<!--
文件：frontend/src/views/tender/SupplierTenderHallView.vue
功能：供应商 WEB 端招标大厅，展示当前供应商可参与或可查看的招标项目。
交互：调用 tender.controller.ts 的供应商列表接口；跳转 SupplierTenderDetailView.vue 查看详情，或进入 SupplierQuoteBidView.vue 提交报价。
作者：吴川
-->
<template>
  <div class="supplier-tender-hall">
    <div class="page-header">
      <div>
        <h2>{{ t('route.supplierTenders') }}</h2>
        <p>{{ t('supplierTenderHall.total', { total }) }}</p>
      </div>
    </div>

    <div class="toolbar">
      <el-input v-model.trim="filters.search" clearable :placeholder="t('supplierTenderHall.searchPlaceholder')">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-segmented v-model="filters.status" :options="statusOptions" />
      <el-select v-model="filters.type" clearable :placeholder="t('common.allTypes')">
        <el-option value="engineering" :label="t('tender.engineering')" />
        <el-option value="transport" :label="t('tender.transport')" />
        <el-option value="routine" :label="t('tender.routine')" />
      </el-select>
      <el-select v-model="filters.participationScope" clearable :placeholder="t('supplierTenderHall.scopeFilter')">
        <el-option value="invited" :label="t('supplierTenderHall.invitedMe')" />
        <el-option value="public" :label="t('supplierTenderHall.publicTender')" />
      </el-select>
    </div>

    <div v-loading="loading" class="tender-grid">
      <article v-for="item in tenders" :key="item.id" class="tender-card">
        <div class="card-top">
          <span class="tender-no">{{ item.tenderNo }}</span>
          <div class="card-tags">
            <el-tag :type="participationTagType(resolveParticipationScope(item))" effect="plain" size="small">
              {{ t(participationLabelKey(resolveParticipationScope(item))) }}
            </el-tag>
            <el-tag :type="statusTag(item.status)" size="small">{{ statusLabel(item.status) }}</el-tag>
          </div>
        </div>
        <h3 class="card-title">{{ item.title }}</h3>
        <p class="card-summary">{{ item.hallSummary || item.description || t('supplierTenderHall.noSummary') }}</p>
        <dl class="card-meta">
          <div>
            <dt>{{ t('common.type') }}</dt>
            <dd>{{ typeLabel(item.type) }}</dd>
          </div>
          <div>
            <dt>{{ t('common.currency') }}</dt>
            <dd>{{ item.baseCurrency || 'IDR' }}</dd>
          </div>
          <div>
            <dt>{{ t('hall.start_time') }}</dt>
            <dd>{{ item.bidStartAt ? fmtDate(item.bidStartAt) : t('hall.start_after_publish') }}</dd>
          </div>
          <div>
            <dt>{{ t('hall.deadline') }}</dt>
            <dd>{{ item.bidDeadline ? fmtDate(item.bidDeadline) : t('common.not_set') }}</dd>
          </div>
          <div>
            <dt>{{ t('hall.lots') }}</dt>
            <dd>{{ t('supplierTenderHall.lotCount', { count: item.lots?.length ?? 0 }) }}</dd>
          </div>
        </dl>
        <div class="card-actions">
          <el-button @click="router.push(`/supplier/tenders/${item.id}`)">{{ t('common.details') }}</el-button>
          <el-button
            v-if="item.status === 'open' && item.lots?.[0]?.id"
            type="primary"
            @click="router.push(`/supplier/quotes/lots/${item.lots[0].id}`)"
          >
            {{ t('supplierTenderHall.quoteNow') }}
          </el-button>
        </div>
      </article>
      <el-empty v-if="!loading && tenders.length === 0" :description="t('supplierTenderHall.noAccessible')" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      v-model:current-page="page"
      :total="total"
      :page-size="pageSize"
      layout="prev, pager, next"
      class="pagination"
      @current-change="load"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { Search } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { participationLabelKey, participationTagType, resolveParticipationScope } from '../../utils/participation';

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
  participationScope: '',
});

const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('tender.status.published'), value: 'published' },
  { label: t('tender.status.open'), value: 'open' },
  { label: t('tender.status.closed'), value: 'closed' },
]);

function fmtDate(iso: string) {
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

function typeLabel(type: string) { return type ? t(`tender.${type}`) : ''; }

function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}

function statusTag(status: string) {
  return { published: '', open: 'success', closed: 'info', awarded: 'warning' }[status] ?? '';
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
        participationScope: filters.participationScope || undefined,
      },
    });
    tenders.value = res.data.data ?? [];
    total.value = res.data.meta?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function scheduleLoad() {
  if (queryTimer) clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 260);
}

watch(filters, scheduleLoad, { deep: true });
onMounted(load);
onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer);
});
</script>

<style scoped>
.supplier-tender-hall { display: grid; gap: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; }
.page-header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
.toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto 180px 160px;
  gap: 12px;
  align-items: center;
}
.toolbar :deep(.el-input__wrapper),
.toolbar :deep(.el-select__wrapper) {
  min-height: 36px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #d9dee8 inset;
}
.toolbar :deep(.el-segmented) {
  --el-segmented-item-selected-bg-color: #2563eb;
  --el-segmented-item-selected-color: #fff;
  padding: 2px;
  border-radius: 8px;
}
.tender-grid {
  min-height: 260px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  align-items: start;
  gap: 16px;
}
.tender-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.tender-card:hover {
  border-color: #bfdbfe;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.card-top, .card-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.card-top { min-width: 0; }
.card-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.tender-no {
  min-width: 0;
  overflow: hidden;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-title {
  display: -webkit-box;
  min-height: 48px;
  margin: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.card-summary {
  display: -webkit-box;
  min-height: 63px;
  margin: 0;
  overflow: hidden;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.card-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #f8fafc;
}
.card-meta div {
  min-width: 0;
}
.card-meta dt {
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;
}
.card-meta dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-actions {
  padding-top: 2px;
}
.pagination { display: flex; justify-content: flex-end; }
@media (max-width: 1280px) {
  .tender-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .card-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .toolbar { grid-template-columns: 1fr; }
  .tender-grid { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .card-top,
  .card-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .card-tags { justify-content: flex-start; }
  .card-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
}
</style>
