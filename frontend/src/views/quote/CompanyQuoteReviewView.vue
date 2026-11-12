<!--
文件：frontend/src/views/quote/CompanyQuoteReviewView.vue
功能：公司 WEB 端标包报价评审页，只处理报价排名、快照和重建排名，不承载供应商报价表单。
交互：调用 quote.controller.ts 的 ranking/rebuild-ranking/snapshot 接口；从 tender.controller.ts 读取标包上下文。
作者：吴川
-->
<template>
  <div v-loading="loading" class="company-quote-page">
    <header v-if="lot && tender" class="review-head">
      <div>
        <div class="meta-line">
          <span>{{ tender.tenderNo }}</span>
          <span>{{ t('tenderList.roundNo', { round: tender.currentQuoteRound || 1 }) }}</span>
          <el-tag :type="statusTag(tender.status)" size="small">{{ statusLabel(tender.status) }}</el-tag>
        </div>
        <h2>{{ lot.title }}</h2>
        <p>{{ tender.title }}</p>
      </div>
      <div class="head-actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
        </el-button>
        <el-button v-if="auth.hasScope('tender:close')" :disabled="hasLineMode" @click="rebuildRanking">{{ t('companyQuoteReview.rebuild') }}</el-button>
        <el-button v-if="auth.hasScope('eval:freeze')" type="primary" :loading="freezing" :disabled="loading || tender.status !== 'closed' || Boolean(currentSnapshot)" @click="freezeSnapshot">{{ currentSnapshot ? t('evaluationFreeze.done', { round: tender.currentQuoteRound || 1 }) : t('companyQuoteReview.freeze') }}</el-button>
      </div>
    </header>

    <p v-if="auth.hasScope('eval:freeze') && tender?.status !== 'closed'" class="freeze-hint">{{ t('evaluationFreeze.closeFirst') }}</p>
    <section v-if="snapshots.length" class="freeze-results">
      <h3>{{ t('evaluationFreeze.history') }}</h3>
      <details v-for="snapshot in snapshots" :key="snapshot.id" :open="snapshot.id === currentSnapshot?.id">
        <summary>{{ snapshot.roundNo ? t('evaluationFreeze.done', { round: snapshot.roundNo }) : t('evaluationFreeze.title') }} · {{ fmtDate(snapshot.createdAt) }}</summary>
        <div v-for="row in snapshot.snapshotData" :key="row.quoteId || `${row.lineId}-${row.supplierId}`" class="frozen-row">
          <strong>{{ row.lineNo || lot?.title }} · #{{ row.rank }} · {{ row.supplierName || row.supplierId }}</strong>
          <span v-if="row.lineData">{{ Object.values(row.lineData).filter(Boolean).slice(0, 2).join(' → ') }}</span>
          <span class="frozen-price">{{ Number(row.totalPrice).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} {{ row.currency }} · V{{ row.version }}</span>
          <span v-for="(value, key) in (Array.isArray(row.items) ? {} : row.items || {})" :key="key">{{ row.columnLabels?.[key] || key }}: {{ value }}</span>
          <span>{{ fmtDate(row.submittedAt) }}</span>
        </div>
      </details>
    </section>

    <section class="summary-grid">
      <div><span>{{ t('quote.quoteStatus') }}</span><strong>{{ statusLabel(tender?.status) }}</strong></div>
      <div><span>{{ t('tenderCreate.bidDeadline') }}</span><strong>{{ tender?.bidDeadline ? fmtDate(tender.bidDeadline) : t('common.not_set') }}</strong></div>
      <div><span>{{ t('companyQuoteReview.quoteCount') }}</span><strong>{{ quotes.length }}</strong></div>
      <div><span>{{ t('tenderDetail.budget') }}</span><strong>{{ lot?.budgetAmount ? `${Number(lot.budgetAmount).toLocaleString(locale)} ${lot.budgetCurrency}` : '—' }}</strong></div>
    </section>

    <el-card v-if="hasLineMode" class="panel">
      <template #header>{{ t('companyQuoteReview.lines') }}</template>
      <section class="mobile-line-picker">
        <button v-for="(line, index) in lot.lines" :key="line.id" type="button" :aria-pressed="selectedLineId === line.id" @click="selectLine(line)">
          <strong>#{{ index + 1 }}</strong>
          <span v-for="col in lot.uiSchema?.lineColumns ?? []" :key="col.key">{{ col.label }}: {{ line.dataJson?.[col.key] || '—' }}</span>
        </button>
      </section>
      <el-table :data="lot.lines" border stripe size="small" highlight-current-row @current-change="selectLine" class="desktop-lines">
        <el-table-column label="#" width="58">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column
          v-for="col in lot.uiSchema?.lineColumns ?? []"
          :key="col.key"
          :label="col.label"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.dataJson?.[col.key] || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="panel">
      <template #header>{{ hasLineMode ? t('companyQuoteReview.lineRanking') : t('companyQuoteReview.ranking') }}</template>
      <section class="mobile-ranking">
        <article v-for="(row, index) in quotes" :key="row.id">
          <strong>#{{ index + 1 }} · {{ row.supplierName || row.supplierId }}</strong>
          <p>{{ Number(row.totalPrice).toLocaleString(locale) }} {{ row.currency }} · V{{ row.version }}</p>
          <p>{{ fmtDate(row.submittedAt) }}</p>
          <el-button @click="openQuoteDetail(row)">{{ t('common.details') }}</el-button>
        </article>
      </section>
      <el-table :data="quotes" stripe class="desktop-ranking">
        <el-table-column :label="t('quote.rank')" width="90">
          <template #default="{ $index }">#{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="quoteNo" :label="t('tenderDetail.field.quoteNo')" width="160" />
        <el-table-column :label="t('companyQuoteReview.supplier')" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="supplier-cell">
              <strong>{{ row.supplierName || row.supplier?.legalName || row.supplierId }}</strong>
              <span>{{ row.supplier?.businessId || row.supplierId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('quote.quoteAmount')" width="180">
          <template #default="{ row }">{{ Number(row.totalPrice).toLocaleString(locale) }} {{ row.currency }}</template>
        </el-table-column>
        <el-table-column :label="t('quote.convertedQuote')" width="190">
          <template #default="{ row }">{{ formatConvertedPrice(row) }}</template>
        </el-table-column>
        <el-table-column :label="t('quote.exchangeRate')" width="190">
          <template #default="{ row }">{{ formatExchangeRate(row) }}</template>
        </el-table-column>
        <el-table-column
          v-for="col in selectedLineRequiredColumns"
          :key="col.key"
          :label="col.label"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ quoteItemValue(row, col) }}</template>
        </el-table-column>
        <el-table-column prop="version" :label="t('quote.versionColumn')" width="80" />
        <el-table-column :label="t('quote.submitTime')" width="180">
          <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('org.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openQuoteDetail(row)">{{ t('common.details') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="detailVisible" :title="t('tenderDetail.quoteDetails')" size="520px">
      <template v-if="selectedQuote">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('companyQuoteReview.supplier')">{{ selectedQuote.supplierName || selectedQuote.supplierId }}</el-descriptions-item>
          <el-descriptions-item :label="t('supplierList.supplierNo')">{{ selectedQuote.supplier?.businessId || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_name')">{{ selectedQuote.supplier?.contactName || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_phone')">{{ selectedQuote.supplier?.contactPhone || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_email')">{{ selectedQuote.supplier?.contactEmail || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('tenderDetail.field.quoteNo')">{{ selectedQuote.quoteNo }}</el-descriptions-item>
          <el-descriptions-item :label="t('tenderDetail.quoteAmount')">{{ Number(selectedQuote.totalPrice).toLocaleString(locale) }} {{ selectedQuote.currency }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.convertedQuote')">{{ formatConvertedPrice(selectedQuote) }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.exchangeRate')">{{ formatExchangeRate(selectedQuote) }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.versionColumn')">V{{ selectedQuote.version }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.submitTime')">{{ fmtDate(selectedQuote.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.remark')">{{ selectedQuote.remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <section class="detail-section">
          <h3>{{ t('tenderDetail.supplierInputs') }}</h3>
          <div class="mobile-quote-fields"><p v-for="item in filledQuoteItems(selectedQuote)" :key="item.key">{{ item.label }}: {{ item.value }}</p></div>
          <el-table v-if="filledQuoteItems(selectedQuote).length" class="desktop-quote-fields" :data="filledQuoteItems(selectedQuote)" stripe size="small">
            <el-table-column prop="label" :label="t('tenderDetail.fieldName')" min-width="160" />
            <el-table-column prop="value" :label="t('tenderDetail.filledValue')" min-width="220" show-overflow-tooltip />
          </el-table>
          <el-empty v-else :description="t('tenderDetail.noSupplierInputs')" />
        </section>

        <section class="detail-section">
          <h3>{{ t('tenderDetail.quoteHistory') }}</h3>
          <div class="mobile-quote-history">
            <article v-for="row in quoteHistory" :key="row.id || row.version">
              <strong>V{{ row.version }} · {{ Number(row.totalPrice).toLocaleString(locale) }} {{ row.currency }}</strong>
              <p>{{ t('quote.current') }}: {{ row.isLatest ? t('companyQuoteReview.yes') : t('companyQuoteReview.no') }}</p>
              <p>{{ t('quote.convertedQuote') }}: {{ formatConvertedPrice(row) }}</p>
              <p>{{ formatExchangeRate(row) }}</p>
              <p v-for="col in selectedLineRequiredColumns" :key="col.key">{{ col.label }}: {{ quoteItemValue(row, col) }}</p>
              <p>{{ fmtDate(row.submittedAt) }}</p>
            </article>
          </div>
          <el-table v-if="quoteHistory.length" class="desktop-quote-history" :data="quoteHistory" stripe size="small">
            <el-table-column :label="t('quote.versionColumn')" width="80">
              <template #default="{ row }">V{{ row.version }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.quoteAmount')" width="160">
              <template #default="{ row }">{{ Number(row.totalPrice).toLocaleString(locale) }} {{ row.currency }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.convertedQuote')" width="170">
              <template #default="{ row }">{{ formatConvertedPrice(row) }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.exchangeRate')" width="180">
              <template #default="{ row }">{{ formatExchangeRate(row) }}</template>
            </el-table-column>
            <el-table-column
              v-for="col in selectedLineRequiredColumns"
              :key="col.key"
              :label="col.label"
              min-width="130"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ quoteItemValue(row, col) }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.current')" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isLatest ? 'success' : 'info'" size="small">{{ row.isLatest ? t('companyQuoteReview.yes') : t('companyQuoteReview.no') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('quote.submitTime')" min-width="150">
              <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else :description="t('tenderDetail.noQuoteHistory')" />
        </section>

        <section class="detail-section">
          <h3>{{ t('tenderCreate.attachments') }}</h3>
          <div v-if="selectedQuote.attachments?.length" class="attachment-list">
            <div v-for="file in selectedQuote.attachments" :key="file.key" class="attachment-item">
              <span>{{ file.name }}</span>
              <small>{{ file.size ? `${Math.round(file.size / 1024)} KB` : '' }}</small>
            </div>
          </div>
          <el-empty v-else :description="t('companyQuoteReview.noAttachments')" />
        </section>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onActivated, onMounted, ref,
} from 'vue';
import { useRoute } from 'vue-router';
import { institutionWallTime } from '../../shared/institution-time';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const { t, locale } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const lotId = route.params.lotId as string;
const lot = ref<any>(null);
const tender = ref<any>(null);
const quotes = ref<any[]>([]);
const loading = ref(false);
const freezing = ref(false);
const snapshots = ref<any[]>([]);
const currentSnapshot = computed(() => snapshots.value.find(s => s.roundNo === (tender.value?.currentQuoteRound || 1)));
const detailVisible = ref(false);
const selectedQuote = ref<any>(null);
const selectedLineId = ref<string>('');
const quoteHistory = ref<any[]>([]);
const hasLineMode = computed(() => Boolean(lot.value?.lines?.length));
const selectedLineRequiredColumns = computed(() => {
  if (!hasLineMode.value || !selectedLineId.value) return [];
  return (lot.value?.uiSchema?.lineColumns ?? []).filter((col: any) => Boolean(col.required));
});

function fmtDate(iso: string) { return institutionWallTime(iso, tender.value?.timezone || 'UTC') + ' (' + (tender.value?.timezone || 'UTC') + ')'; }
function statusLabel(status?: string) {
  return status ? t(`tender.status.${status}`) : '—';
}
function statusTag(status?: string) {
  return { draft: 'info', published: '', open: 'success', closed: 'info', awarded: 'warning', cancelled: 'danger' }[status ?? ''] ?? '';
}

function quoteRankPrice(quote: any) {
  const converted = Number(quote?.priceInBase);
  if (Number.isFinite(converted) && converted > 0) return converted;
  return Number(quote?.totalPrice ?? 0);
}

function formatConvertedPrice(quote: any) {
  const currency = quote?.baseCurrency || tender.value?.baseCurrency || quote?.currency || 'IDR';
  return `${quoteRankPrice(quote).toLocaleString(locale.value, { maximumFractionDigits: 2 })} ${currency}`;
}

function formatExchangeRate(quote: any) {
  const from = quote?.currency;
  const to = quote?.baseCurrency || tender.value?.baseCurrency;
  const rate = Number(quote?.exchangeRate ?? (from && to && from === to ? 1 : NaN));
  if (!from || !to || !Number.isFinite(rate)) return '—';
  const suffix = quote?.exchangeRateDate ? ` · ${quote.exchangeRateDate}` : '';
  return `1 ${from} = ${rate.toLocaleString(locale.value, { maximumFractionDigits: 6 })} ${to}${suffix}`;
}

async function load() {
  loading.value = true;
  try {
    const lotRes = await api.get(`/api/tenders/lots/${lotId}`);
    lot.value = lotRes.data.data;
    tender.value = lotRes.data.data.tender;
    snapshots.value = (await api.get(`/api/quotes/lots/${lotId}/snapshots`)).data.data ?? [];
    if (lot.value?.lines?.length) {
      if (!lot.value.lines.some((line: any) => line.id === selectedLineId.value)) selectedLineId.value = lot.value.lines[0].id;
      await loadLineRanking();
    } else {
      const quoteRes = await api.get(`/api/quotes/lots/${lotId}/ranking`);
      quotes.value = quoteRes.data.data ?? [];
    }
  } finally {
    loading.value = false;
  }
}

async function selectLine(line: any) {
  if (!line?.id) return;
  selectedLineId.value = line.id;
  await loadLineRanking();
}

async function loadLineRanking() {
  if (!selectedLineId.value) {
    quotes.value = [];
    return;
  }
  const quoteRes = await api.get(`/api/quotes/lines/${selectedLineId.value}/ranking`);
  quotes.value = quoteRes.data.data ?? [];
}

async function rebuildRanking() {
  await api.post(`/api/quotes/lots/${lotId}/rebuild-ranking`);
  ElMessage.success(t('companyQuoteReview.rebuilt'));
  await load();
}

async function freezeSnapshot() {
  if (freezing.value || currentSnapshot.value || tender.value?.status !== 'closed') return;
  const roundNo = tender.value.currentQuoteRound || 1;
  try { await ElMessageBox.confirm(t('evaluationFreeze.confirm', { round: roundNo }), t('evaluationFreeze.title'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }); }
  catch { return; }
  freezing.value = true;
  try {
    await api.post(`/api/quotes/lots/${lotId}/snapshot`, { trigger: 'EVAL_FREEZE', roundNo });
    await load();
    ElMessage.success(t('companyQuoteReview.frozen'));
  } finally { freezing.value = false; }
}

function quoteItemValue(quote: any, col: any) {
  const value = quote?.items?.[col.key];
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function filledQuoteItems(quote: any) {
  return selectedLineRequiredColumns.value
    .map((col: any) => ({ key: col.key, label: col.label, value: quoteItemValue(quote, col) }))
    .filter((item: any) => item.value !== '—');
}

async function openQuoteDetail(row: any) {
  selectedQuote.value = row;
  quoteHistory.value = [];
  detailVisible.value = true;
  if (hasLineMode.value && selectedLineId.value && row.supplierId) {
    const historyRes = await api.get(`/api/quotes/lines/${selectedLineId.value}/suppliers/${row.supplierId}/history`);
    quoteHistory.value = historyRes.data.data ?? [];
  }
}

onMounted(load);
onActivated(load);
</script>

<style scoped>
.freeze-hint { margin: 0; color: #64748b; font-size: 13px; }
.freeze-results { padding: 14px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; }
.freeze-results h3 { margin: 0 0 8px; font-size: 15px; }
.freeze-results summary { padding: 12px 0; cursor: pointer; line-height: 1.5; overflow-wrap: anywhere; }
.frozen-row { display: grid; gap: 6px; padding: 12px 0; border-top: 1px solid #e2e8f0; overflow-wrap: anywhere; font-size: 14px; }
.frozen-price { font-weight: 600; color: #0f172a; }
.mobile-line-picker, .mobile-quote-fields, .mobile-quote-history { display: none; }
@media (max-width: 768px) {
  .desktop-quote-fields, .desktop-quote-history { display: none; }
  .mobile-quote-fields, .mobile-quote-history { display: grid; gap: 8px; overflow-wrap: anywhere; }
  .mobile-quote-history article { border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
  .mobile-quote-history p, .mobile-quote-fields p { margin: 4px 0; }
  :deep(.el-descriptions__table) { table-layout: fixed; overflow-wrap: anywhere; }
  .desktop-lines { display: none; }
  .mobile-line-picker { display: grid; gap: 8px; max-height: 320px; overflow: auto; }
  .mobile-line-picker button { display: grid; gap: 6px; padding: 12px; text-align: left; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; overflow-wrap: anywhere; }
  .mobile-line-picker button[aria-pressed="true"] { border: 2px solid #2563eb; background: #eff6ff; }
}
.mobile-ranking { display: none; }
@media (max-width: 768px) {
  .mobile-ranking { display: grid; gap: 12px; }
  .mobile-ranking article { padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; overflow-wrap: anywhere; }
  .mobile-ranking p { color: #475569; }
  .desktop-ranking { display: none; }
}
.company-quote-page { display: grid; gap: 16px; }
.review-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
}
.meta-line { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: #64748b; font-size: 13px; }
.review-head h2 { margin: 0; color: #0f172a; font-size: 24px; }
.review-head p { margin: 8px 0 0; color: #64748b; }
.head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.summary-grid div {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}
.summary-grid span { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 6px; }
.summary-grid strong { color: #0f172a; }
.panel { border-radius: 14px; }
.supplier-cell { display: grid; gap: 2px; }
.supplier-cell strong { color: #0f172a; font-weight: 700; }
.supplier-cell span { color: #64748b; font-size: 12px; }
.detail-section { margin-top: 20px; }
.detail-section h3 { margin: 0 0 10px; color: #0f172a; font-size: 15px; }
.json-box {
  max-height: 280px;
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 12px;
}
.attachment-list { display: grid; gap: 8px; }
.attachment-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.attachment-item small { color: #64748b; }
@media (max-width: 768px) {
  .review-head { flex-direction: column; padding: 14px; gap: 12px; border-radius: 8px; }
  .review-head h2 { font-size: 20px; overflow-wrap: anywhere; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .summary-grid div { padding: 10px; border-radius: 8px; overflow-wrap: anywhere; }
  .summary-grid strong { font-size: 13px; }
  .head-actions { justify-content: flex-start; }
}
</style>
