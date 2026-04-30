<!--
文件：frontend/src/views/tender/SupplierTenderDetailView.vue
功能：供应商 WEB 端招标详情页，只展示供应商参与投标所需的信息、标包与附件。
交互：调用 supplier/tender 可见性接口复用的 tender.controller.ts 详情能力；跳转 SupplierQuoteBidView.vue 提交报价。
作者：吴川
-->
<template>
  <div v-loading="loading" class="supplier-tender-detail">
    <template v-if="tender">
      <header class="detail-head">
        <div>
          <div class="meta-line">
            <span class="tender-no">{{ tender.tenderNo }}</span>
            <el-tag :type="statusTag(tender.status)" size="small">{{ statusLabel(tender.status) }}</el-tag>
          </div>
          <h2>{{ tender.title }}</h2>
          <p>{{ tender.hallSummary || t('supplierTenderHall.noSummary') }}</p>
        </div>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
        </el-button>
      </header>

      <section class="info-grid">
        <div><span>{{ t('common.type') }}</span><strong>{{ typeLabel(tender.type) }}</strong></div>
        <div><span>{{ t('common.currency') }}</span><strong>{{ tender.baseCurrency || 'IDR' }}</strong></div>
        <div><span>{{ t('tenderCreate.bidStart') }}</span><strong>{{ tender.bidStartAt ? fmt(tender.bidStartAt) : t('hall.start_after_publish') }}</strong></div>
        <div><span>{{ t('tenderCreate.bidDeadline') }}</span><strong>{{ tender.bidDeadline ? fmt(tender.bidDeadline) : t('common.not_set') }}</strong></div>
        <div><span>{{ t('quote.maxRebid') }}</span><strong>{{ t('quote.times', { count: tender.maxRebidCount }) }}</strong></div>
        <div><span>{{ t('quote.cooldownSeconds') }}</span><strong>{{ t('quote.seconds', { count: tender.cooldownSeconds }) }}</strong></div>
      </section>

      <el-card v-if="tender.description" class="panel project-description">
        <template #header>{{ t('tenderCreate.projectDescription') }}</template>
        <p>{{ tender.description }}</p>
      </el-card>

      <el-card class="panel">
        <template #header>{{ t('hall.lots') }}</template>
        <el-table :data="tender.lots ?? []" stripe>
          <el-table-column type="expand" width="48">
            <template #default="{ row }">
              <div v-if="row.lines?.length" class="line-expand">
                <el-table :data="row.lines" border size="small">
                  <el-table-column label="#" width="58">
                    <template #default="{ $index }">{{ $index + 1 }}</template>
                  </el-table-column>
                  <el-table-column
                    v-for="col in row.uiSchema?.lineColumns ?? []"
                    :key="col.key"
                    :label="col.label"
                    min-width="140"
                    show-overflow-tooltip
                  >
                    <template #default="{ row: line }">{{ line.dataJson?.[col.key] || '—' }}</template>
                  </el-table-column>
                </el-table>
              </div>
              <el-empty v-else :description="t('quote.noLines')" />
            </template>
          </el-table-column>
          <el-table-column prop="lotNo" :label="t('common.number')" width="150" />
          <el-table-column prop="title" :label="t('common.name')" min-width="180" />
          <el-table-column prop="description" :label="t('common.description')" min-width="180" show-overflow-tooltip />
          <el-table-column :label="t('tenderCreate.quantity')" width="130">
            <template #default="{ row }">
              {{ row.quantity ? `${Number(row.quantity).toLocaleString()} ${row.unit || ''}` : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                :type="tender.status === 'open' ? 'primary' : ''"
                :disabled="tender.status !== 'open'"
                @click="router.push(`/supplier/quotes/lots/${row.id}`)"
              >
                {{ tender.status === 'open' ? t('supplierTenderHall.quoteNow') : t('quote.notStarted') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card v-if="tender.attachments?.length" class="panel">
        <template #header>{{ t('tenderCreate.tenderDocuments') }}</template>
        <div class="attachment-list">
          <button
            v-for="file in tender.attachments"
            :key="file.key"
            class="attachment-item"
            type="button"
            @click="previewAttachment(file)"
          >
            <span>{{ file.name }}</span>
            <small>{{ formatSize(file.size) }}</small>
          </button>
        </div>
      </el-card>
    </template>

    <el-dialog v-model="preview.visible" :title="preview.title" width="82vw">
      <iframe v-if="preview.kind === 'inline'" class="preview-frame" :src="preview.url" :title="t('tenderCreate.attachmentPreview')" />
      <div v-else class="preview-fallback">
        <p>{{ t('tenderCreate.previewUnsupported') }}</p>
        <el-button type="primary" @click="openPreviewFile">{{ t('tenderCreate.openInNewWindow') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  onActivated, onMounted, reactive, ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tender = ref<any>(null);
const loading = ref(false);
const preview = reactive({
  visible: false,
  title: '',
  url: '',
  kind: 'inline' as 'inline' | 'download',
});

function fmt(iso: string) { return dayjs(iso).format('YYYY-MM-DD HH:mm'); }
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
    const res = await api.get(`/api/tenders/${route.params.id}`);
    tender.value = res.data.data;
  } finally {
    loading.value = false;
  }
}

function previewAttachment(file: any) {
  preview.title = file.name || t('tenderCreate.attachmentPreview');
  preview.url = file.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(file.key)}`;
  preview.kind = file.mimeType?.startsWith('image/') || file.mimeType === 'application/pdf' ? 'inline' : 'download';
  preview.visible = true;
}

function openPreviewFile() {
  if (preview.url) window.open(preview.url, '_blank');
}

function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

onMounted(load);
onActivated(load);
</script>

<style scoped>
.supplier-tender-detail { display: grid; gap: 16px; }
.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
}
.meta-line { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.tender-no { color: #64748b; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
.detail-head h2 { margin: 0; color: #0f172a; font-size: 24px; }
.detail-head p { margin: 8px 0 0; color: #64748b; line-height: 1.6; }
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.info-grid div {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}
.info-grid span { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 6px; }
.info-grid strong { color: #0f172a; font-size: 15px; }
.panel { border-radius: 14px; }
.project-description p {
  margin: 0;
  color: #334155;
  line-height: 1.7;
  white-space: pre-wrap;
}
.line-expand { padding: 8px 18px 12px; background: #f8fafc; }
.attachment-list { display: grid; gap: 10px; }
.attachment-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  color: #0f172a;
  cursor: pointer;
}
.attachment-item small { color: #64748b; }
.preview-frame { width: 100%; height: 72vh; border: 0; }
.preview-fallback { text-align: center; padding: 32px; }
</style>
