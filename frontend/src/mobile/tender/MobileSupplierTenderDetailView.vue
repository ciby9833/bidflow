<!--
文件：frontend/src/mobile/tender/MobileSupplierTenderDetailView.vue
功能：H5 供应商招标详情页，展示项目信息、项目描述、标包/线路和招标文件。
交互：调用 supplier 可见招标详情接口；跳转 H5 报价提交页。
作者：吴川
-->
<template>
  <main class="mobile-tender-detail" v-loading="loading">
    <template v-if="tender">
      <section class="hero">
        <div class="meta-line">
          <span>{{ tender.tenderNo }}</span>
          <em>{{ statusLabel(tender.status) }}</em>
        </div>
        <h1>{{ tender.title }}</h1>
        <p>{{ tender.hallSummary || t('supplierTenderHall.noSummary') }}</p>
      </section>

      <section class="metric-grid">
        <div><span>{{ t('common.type') }}</span><strong>{{ typeLabel(tender.type) }}</strong></div>
        <div><span>{{ t('common.currency') }}</span><strong>{{ tender.baseCurrency || 'IDR' }}</strong></div>
        <div><span>{{ t('tenderCreate.bidDeadline') }}</span><strong>{{ tender.bidDeadline ? fmt(tender.bidDeadline) : t('common.not_set') }}</strong></div>
        <div><span>{{ t('quote.rebidRequirement') }}</span><strong>{{ t('quote.times', { count: tender.maxRebidCount }) }} · {{ Number(tender.minDecrementPct ?? 0).toFixed(1) }}%</strong></div>
      </section>

      <section v-if="tender.description" class="section-card">
        <h2>{{ t('tenderCreate.projectDescription') }}</h2>
        <p class="description">{{ tender.description }}</p>
      </section>

      <section class="section-card">
        <h2>{{ t('hall.lots') }}</h2>
        <article v-for="lot in tender.lots || []" :key="lot.id" class="lot-card">
          <div class="lot-head">
            <div>
              <small>{{ lot.lotNo }}</small>
              <strong>{{ lot.title }}</strong>
            </div>
            <button type="button" :disabled="tender.status !== 'open'" @click="router.push(`/m/quotes/lots/${lot.id}`)">
              {{ tender.status === 'open' ? t('supplierTenderHall.quoteNow') : t('quote.notStarted') }}
            </button>
          </div>
          <p v-if="lot.description">{{ lot.description }}</p>
          <div v-if="lot.quantity" class="quantity">{{ Number(lot.quantity).toLocaleString() }} {{ lot.unit || '' }}</div>
          <div v-if="lot.lines?.length" class="line-list">
            <article v-for="(line, index) in lot.lines" :key="line.id" class="line-item">
              <button class="line-summary" type="button" @click="toggleLine(line.id)">
                <span>#{{ index + 1 }}</span>
                <strong>{{ lineTitle(line, lot) }}</strong>
                <em>{{ expandedLines[line.id] ? t('common.collapse') : t('quote.allFields') }}</em>
              </button>
              <div class="line-key-fields">
                <div v-for="field in primaryLineFields(line, lot)" :key="field.key">
                  <span>{{ field.label }}</span>
                  <strong>{{ field.value }}</strong>
                </div>
              </div>
              <div v-if="expandedLines[line.id]" class="line-all-fields">
                <div v-for="field in secondaryLineFields(line, lot)" :key="field.key">
                  <span>{{ field.label }}</span>
                  <strong>{{ field.value }}</strong>
                </div>
              </div>
            </article>
          </div>
        </article>
        <div v-if="!(tender.lots || []).length" class="empty">{{ t('quote.noLots') }}</div>
      </section>

      <section v-if="tender.attachments?.length" class="section-card">
        <h2>{{ t('tenderCreate.tenderDocuments') }}</h2>
        <button v-for="file in tender.attachments" :key="file.key" class="file-item" type="button" @click="openFile(file)">
          <span>{{ file.name }}</span>
          <small>{{ formatSize(file.size) }}</small>
        </button>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { reactive, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { api } from '../../composables/useApi';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const tender = ref<any>(null);
const expandedLines = reactive<Record<string, boolean>>({});

function fmt(value: string) { return dayjs(value).format('YYYY-MM-DD HH:mm'); }
function typeLabel(type: string) { return type ? t(`tender.${type}`) : ''; }
function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}
function lineTitle(line: any, lot: any) {
  const columns = lot.uiSchema?.lineColumns ?? [];
  const first = columns.find((col: any) => !col.required && line.dataJson?.[col.key]);
  return first ? `${first.label}: ${line.dataJson[first.key]}` : t('quote.lineDetails');
}
function lineFields(line: any, lot: any) {
  return (lot.uiSchema?.lineColumns ?? [])
    .filter((col: any) => !col.required)
    .map((col: any) => ({
      key: col.key,
      label: col.label,
      value: line.dataJson?.[col.key] || '—',
    }));
}
function primaryLineFields(line: any, lot: any) {
  return lineFields(line, lot).slice(0, 3);
}
function secondaryLineFields(line: any, lot: any) {
  return lineFields(line, lot).slice(3);
}
function toggleLine(lineId: string) {
  expandedLines[lineId] = !expandedLines[lineId];
}
function openFile(file: any) {
  const url = file.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(file.key)}`;
  window.open(url, '_blank');
}
function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(`/api/tenders/${route.params.id}`);
    tender.value = res.data.data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mobile-tender-detail { min-height: 100%; padding: 12px 16px 28px; }
.hero, .section-card, .metric-grid > div {
  border: 1px solid #e5e7eb;
  background: #fff;
}
.hero { padding: 18px; border-radius: 12px; }
.meta-line { display: flex; justify-content: space-between; gap: 12px; color: #64748b; font-size: 12px; }
.meta-line em { font-style: normal; color: #16a34a; }
h1 { margin: 10px 0 8px; color: #0f172a; font-size: 22px; line-height: 1.25; }
.hero p, .description, .lot-card p { margin: 0; color: #475569; line-height: 1.65; white-space: pre-wrap; }
.metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
.metric-grid > div { padding: 12px; border-radius: 10px; }
.metric-grid span { display: block; margin-bottom: 5px; color: #94a3b8; font-size: 12px; }
.metric-grid strong { color: #0f172a; font-size: 13px; }
.section-card { margin-top: 12px; padding: 14px; border-radius: 12px; }
h2 { margin: 0 0 12px; color: #0f172a; font-size: 16px; }
.lot-card { padding: 13px 0; border-top: 1px solid #eef2f7; }
.lot-card:first-of-type { border-top: 0; padding-top: 0; }
.lot-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.lot-head div { display: grid; gap: 4px; min-width: 0; }
.lot-head small, .quantity, .line-item span, .file-item small, .empty { color: #64748b; font-size: 12px; }
.lot-head strong { color: #0f172a; font-size: 15px; }
button { border: 0; border-radius: 8px; cursor: pointer; }
.lot-head button { flex: 0 0 auto; padding: 8px 11px; background: #0369a1; color: #fff; }
.lot-head button:disabled { background: #cbd5e1; color: #64748b; }
.quantity { margin-top: 9px; }
.line-list { display: grid; gap: 10px; margin-top: 10px; }
.line-item { padding: 10px; border-radius: 10px; background: #f8fafc; }
.line-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  background: transparent;
  text-align: left;
}
.line-summary span { color: #64748b; font-size: 12px; }
.line-summary strong {
  min-width: 0;
  color: #0f172a;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line-summary em { color: #0369a1; font-size: 12px; font-style: normal; }
.line-key-fields, .line-all-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.line-all-fields { padding-top: 10px; border-top: 1px dashed #cbd5e1; }
.line-key-fields div, .line-all-fields div {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: #fff;
}
.line-key-fields span, .line-all-fields span {
  display: block;
  margin-bottom: 4px;
  color: #94a3b8;
  font-size: 11px;
}
.line-key-fields strong, .line-all-fields strong {
  display: block;
  color: #334155;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  word-break: break-word;
}
.file-item { display: flex; justify-content: space-between; width: 100%; padding: 12px 0; border-bottom: 1px solid #eef2f7; background: transparent; text-align: left; }
.file-item span { color: #0f172a; }
.empty { padding: 24px 0; text-align: center; }
</style>
