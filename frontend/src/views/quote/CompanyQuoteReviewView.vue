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
          <el-tag :type="statusTag(tender.status)" size="small">{{ statusLabel(tender.status) }}</el-tag>
        </div>
        <h2>{{ lot.title }}</h2>
        <p>{{ tender.title }}</p>
      </div>
      <div class="head-actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button :disabled="hasLineMode" @click="rebuildRanking">重建排名</el-button>
        <el-button type="primary" :disabled="hasLineMode" @click="freezeSnapshot">冻结快照</el-button>
      </div>
    </header>

    <section class="summary-grid">
      <div><span>报价状态</span><strong>{{ statusLabel(tender?.status) }}</strong></div>
      <div><span>报价截止</span><strong>{{ tender?.bidDeadline ? fmtDate(tender.bidDeadline) : '未设置' }}</strong></div>
      <div><span>报价数量</span><strong>{{ quotes.length }}</strong></div>
      <div><span>预算</span><strong>{{ lot?.budgetAmount ? `${Number(lot.budgetAmount).toLocaleString()} ${lot.budgetCurrency}` : '—' }}</strong></div>
    </section>

    <el-card v-if="hasLineMode" class="panel">
      <template #header>线路/明细</template>
      <el-table :data="lot.lines" border stripe size="small" highlight-current-row @current-change="selectLine">
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
      <template #header>{{ hasLineMode ? '当前线路报价排名' : '报价排名' }}</template>
      <el-table :data="quotes" stripe>
        <el-table-column label="排名" width="90">
          <template #default="{ $index }">#{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="quoteNo" label="报价编号" width="160" />
        <el-table-column label="供应商" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="supplier-cell">
              <strong>{{ row.supplierName || row.supplier?.legalName || row.supplierId }}</strong>
              <span>{{ row.supplier?.businessId || row.supplierId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="报价" width="180">
          <template #default="{ row }">{{ Number(row.totalPrice).toLocaleString() }} {{ row.currency }}</template>
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
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openQuoteDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="detailVisible" title="报价详情" size="520px">
      <template v-if="selectedQuote">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="供应商">{{ selectedQuote.supplierName || selectedQuote.supplierId }}</el-descriptions-item>
          <el-descriptions-item label="供应商编号">{{ selectedQuote.supplier?.businessId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ selectedQuote.supplier?.contactName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ selectedQuote.supplier?.contactPhone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系邮箱">{{ selectedQuote.supplier?.contactEmail || '—' }}</el-descriptions-item>
          <el-descriptions-item label="报价编号">{{ selectedQuote.quoteNo }}</el-descriptions-item>
          <el-descriptions-item label="报价金额">{{ Number(selectedQuote.totalPrice).toLocaleString() }} {{ selectedQuote.currency }}</el-descriptions-item>
          <el-descriptions-item label="版本">V{{ selectedQuote.version }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ fmtDate(selectedQuote.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ selectedQuote.remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <section class="detail-section">
          <h3>供应商填写项</h3>
          <el-table v-if="filledQuoteItems(selectedQuote).length" :data="filledQuoteItems(selectedQuote)" stripe size="small">
            <el-table-column prop="label" label="字段" min-width="160" />
            <el-table-column prop="value" label="填写内容" min-width="220" show-overflow-tooltip />
          </el-table>
          <el-empty v-else description="暂无供应商填写项" />
        </section>

        <section class="detail-section">
          <h3>历史报价</h3>
          <el-table v-if="quoteHistory.length" :data="quoteHistory" stripe size="small">
            <el-table-column label="版本" width="80">
              <template #default="{ row }">V{{ row.version }}</template>
            </el-table-column>
            <el-table-column label="报价" width="160">
              <template #default="{ row }">{{ Number(row.totalPrice).toLocaleString() }} {{ row.currency }}</template>
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
            <el-table-column label="当前" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isLatest ? 'success' : 'info'" size="small">{{ row.isLatest ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" min-width="150">
              <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无历史报价" />
        </section>

        <section class="detail-section">
          <h3>附件</h3>
          <div v-if="selectedQuote.attachments?.length" class="attachment-list">
            <div v-for="file in selectedQuote.attachments" :key="file.key" class="attachment-item">
              <span>{{ file.name }}</span>
              <small>{{ file.size ? `${Math.round(file.size / 1024)} KB` : '' }}</small>
            </div>
          </div>
          <el-empty v-else description="暂无附件" />
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
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const route = useRoute();
const lotId = route.params.lotId as string;
const lot = ref<any>(null);
const tender = ref<any>(null);
const quotes = ref<any[]>([]);
const loading = ref(false);
const detailVisible = ref(false);
const selectedQuote = ref<any>(null);
const selectedLineId = ref<string>('');
const quoteHistory = ref<any[]>([]);
const hasLineMode = computed(() => Boolean(lot.value?.lines?.length));
const selectedLineRequiredColumns = computed(() => {
  if (!hasLineMode.value || !selectedLineId.value) return [];
  return (lot.value?.uiSchema?.lineColumns ?? []).filter((col: any) => Boolean(col.required));
});

function fmtDate(iso: string) { return dayjs(iso).format('YYYY-MM-DD HH:mm'); }
function statusLabel(status?: string) {
  return { draft: '草稿', published: '已发布', open: '报价中', closed: '已关标', awarded: '已定标', cancelled: '已取消' }[status ?? ''] ?? status ?? '—';
}
function statusTag(status?: string) {
  return { draft: 'info', published: '', open: 'success', closed: 'info', awarded: 'warning', cancelled: 'danger' }[status ?? ''] ?? '';
}

async function load() {
  loading.value = true;
  try {
    const lotRes = await api.get(`/api/tenders/lots/${lotId}`);
    lot.value = lotRes.data.data;
    tender.value = lotRes.data.data.tender;
    if (lot.value?.lines?.length) {
      selectedLineId.value ||= lot.value.lines[0].id;
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
  ElMessage.success('排名已重建');
  await load();
}

async function freezeSnapshot() {
  await api.post(`/api/quotes/lots/${lotId}/snapshot`, { trigger: 'EVAL_FREEZE' });
  ElMessage.success('快照已生成');
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
  .review-head { flex-direction: column; }
  .head-actions { justify-content: flex-start; }
}
</style>
