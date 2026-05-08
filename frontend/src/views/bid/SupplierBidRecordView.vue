<!--
文件：frontend/src/views/bid/SupplierBidRecordView.vue
功能：供应商 WEB 端“我的投标”页面，查询本人已提交的投标/报价记录。
交互：调用 api/supplier/bids；详情复用 SupplierTenderDetailView.vue，继续投标复用 SupplierQuoteBidView.vue。
作者：吴川
-->
<template>
  <div class="supplier-bid-records">
    <div class="page-header">
      <div>
        <h2>{{ t('route.supplierBids') }}</h2>
        <p>{{ t('bidRecords.summary', { total }) }}</p>
      </div>
      <el-button :icon="Refresh" @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <div class="toolbar">
      <el-input v-model.trim="filters.search" clearable :placeholder="t('bidRecords.searchPlaceholder')">
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
      <el-select v-model="filters.kind" clearable :placeholder="t('bidRecords.allBids')">
        <el-option value="lot" :label="t('bidRecords.lotQuote')" />
        <el-option value="line" :label="t('bidRecords.lineQuote')" />
      </el-select>
      <el-select v-model="filters.participationScope" clearable :placeholder="t('supplierTenderHall.scopeFilter')">
        <el-option value="invited" :label="t('supplierTenderHall.invitedMe')" />
        <el-option value="public" :label="t('supplierTenderHall.publicTender')" />
      </el-select>
    </div>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="records" :empty-text="t('bidRecords.noRecords')">
        <el-table-column :label="t('hall.project_name')" min-width="260">
          <template #default="{ row }">
            <div class="project-cell">
              <span class="mono">{{ row.tenderNo }}</span>
              <strong>{{ row.tenderTitle }}</strong>
              <small>{{ row.lotNo }} · {{ row.lotTitle }}</small>
              <el-tag :type="participationTagType(resolveParticipationScope(row))" effect="plain" size="small">
                {{ t(participationLabelKey(resolveParticipationScope(row))) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('tender.title')" width="110">
          <template #default="{ row }">{{ typeLabel(row.tenderType) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.tenderStatus)" size="small">{{ statusLabel(row.tenderStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('bidRecords.bidMethod')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.kind === 'line' ? 'warning' : 'info'" effect="plain" size="small">
              {{ row.kind === 'line' ? lineQuoteLabel(row.roundNo) : t('bidRecords.lotQuote') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('bidRecords.latestAmount')" width="150" align="right">
          <template #default="{ row }">
            <span class="price">{{ formatMoney(row.latestTotalPrice) }}</span>
            <span class="currency">{{ row.currency }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('bidRecords.quoteCount')" width="110" align="center">
          <template #default="{ row }">
            <span>{{ row.quoteCount }}</span>
            <small v-if="row.kind === 'line'" class="line-count">
              {{ t('bidRecords.lineCount', { submitted: row.submittedLineCount, total: row.totalLineCount }) }}
            </small>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.submittedAt')" width="160">
          <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('hall.deadline')" width="160">
          <template #default="{ row }">{{ row.bidDeadline ? fmtDate(row.bidDeadline) : t('common.not_set') }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="180" fixed="right">
          <template #default="{ row }">
            <div class="actions">
              <el-button link type="primary" @click="router.push(`/supplier/tenders/${row.tenderId}`)">{{ t('common.details') }}</el-button>
              <el-button
                link
                type="primary"
                :disabled="row.tenderStatus !== 'open'"
                @click="router.push(`/supplier/quotes/lots/${row.lotId}`)"
              >
                {{ row.tenderStatus === 'open' ? t('bidRecords.continueBid') : t('bidRecords.closed') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="load"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { Refresh, Search } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { participationLabelKey, participationTagType, resolveParticipationScope } from '../../utils/participation';

const { t, locale } = useI18n();
const router = useRouter();
const loading = ref(false);
const records = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
let queryTimer: ReturnType<typeof setTimeout> | undefined;

const filters = reactive({
  search: '',
  status: '',
  type: '',
  kind: '',
  participationScope: '',
});

const statusOptions = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('tender.status.published'), value: 'published' },
  { label: t('tender.status.open'), value: 'open' },
  { label: t('tender.status.closed'), value: 'closed' },
  { label: t('tender.status.awarded'), value: 'awarded' },
]);

function fmtDate(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function formatMoney(value: number | string) {
  return Number(value ?? 0).toLocaleString(locale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeLabel(type: string) {
  return type ? t(`tender.${type}`, type) : type;
}

function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`, status) : status;
}

function lineQuoteLabel(roundNo?: number) {
  return roundNo ? t('bidRecords.lineQuoteRound', { round: roundNo }) : t('bidRecords.lineQuote');
}

function statusTag(status: string) {
  return { published: '', open: 'success', closed: 'info', awarded: 'warning' }[status] ?? '';
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
    total.value = res.data.meta?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function scheduleLoad() {
  if (queryTimer) clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 260);
}

watch(filters, scheduleLoad, { deep: true });
onMounted(load);
onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer);
});
</script>

<style scoped>
.supplier-bid-records { display: grid; gap: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.page-header h2 { margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; }
.page-header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
.table-card { border: 1px solid #e5e7eb; border-radius: 8px; }
.toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto 180px 160px 160px;
  gap: 12px;
  align-items: center;
}
.project-cell { display: grid; gap: 4px; line-height: 1.35; }
.project-cell strong { color: #0f172a; font-weight: 650; }
.project-cell small, .currency, .line-count { color: #64748b; }
.mono { color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
.price { color: #0f172a; font-weight: 700; }
.currency { margin-left: 4px; font-size: 12px; }
.line-count { display: block; margin-top: 2px; font-size: 12px; }
.actions { display: flex; gap: 10px; align-items: center; }
.pagination { margin-top: 16px; justify-content: flex-end; }
@media (max-width: 1100px) {
  .toolbar { grid-template-columns: 1fr; }
}
</style>
