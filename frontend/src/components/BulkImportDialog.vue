<!--
文件：frontend/src/components/BulkImportDialog.vue
功能：通用「批量导入」弹窗——内置下载模板链接、拖拽/点击上传区，上传后切换到结果视图。
交互：父组件通过 v-model 控制显隐，传入 templateUrl/uploadUrl 等接口路径；上传完成通过 @imported 通知父组件。
作者：吴川
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="640px"
    :close-on-click-modal="!uploading"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @closed="reset"
  >
    <!-- 上传阶段 -->
    <div v-if="stage === 'upload'" class="bid-stage">
      <div class="bid-template">
        <el-button text type="primary" :loading="downloadingTemplate" @click="downloadTemplate">
          <el-icon><Download /></el-icon>
          {{ t('bulkImport.downloadTemplate') }}
        </el-button>
        <span v-if="templateHint" class="bid-template-hint">{{ templateHint }}</span>
      </div>

      <div
        class="bid-dropzone"
        :class="{ 'is-dragging': dragging, 'is-uploading': uploading }"
        @click="onDropzoneClick"
        @dragover.prevent="dragging = true"
        @dragenter.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <el-icon size="42" class="bid-icon">
          <Loading v-if="uploading" />
          <UploadFilled v-else />
        </el-icon>
        <p class="bid-primary-text">{{ uploading ? t('bulkImport.uploading') : t('bulkImport.dropOrClick') }}</p>
        <p class="bid-hint-text">{{ t('bulkImport.formatHint') }}</p>
        <input ref="fileInput" hidden type="file" accept=".xlsx,.xls" @change="onFileChange" />
      </div>
    </div>

    <!-- 结果阶段 -->
    <div v-else class="bid-stage">
      <div class="bid-stat">
        <span class="bid-stat-ok">{{ successLabel(createdCount) }}</span>
        <span v-if="failedCount" class="bid-stat-fail">{{ t('bulkImport.failedCount', { count: failedCount }) }}</span>
      </div>
      <el-table v-if="failedCount" :data="result.errors" border size="small" max-height="320">
        <el-table-column :label="t('bulkImport.row')" width="70">
          <template #default="{ row }">{{ row.row }}</template>
        </el-table-column>
        <el-table-column :label="identifierLabel" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.value || '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('bulkImport.reason')" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason }}</template>
        </el-table-column>
      </el-table>
      <p v-else class="bid-all-ok">{{ allOkLabel || t('bulkImport.allOk') }}</p>
    </div>

    <template #footer>
      <el-button v-if="stage === 'result'" @click="resetToUpload">{{ t('bulkImport.importAgain') }}</el-button>
      <el-button type="primary" @click="emit('update:modelValue', false)">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Download, Loading, UploadFilled } from '@element-plus/icons-vue';
import { api } from '../composables/useApi';

interface ImportError { row: number; value: string; reason: string }
interface ImportResult {
  created?: any[];
  matched?: any[];
  errors: ImportError[];
  total: number;
}

const props = defineProps<{
  modelValue: boolean;
  title: string;
  templateUrl: string;
  templateFilename: string;
  uploadUrl: string;
  successLabel: (count: number) => string;
  identifierLabel: string;
  templateHint?: string;
  allOkLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'imported', result: ImportResult): void;
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const stage = ref<'upload' | 'result'>('upload');
const dragging = ref(false);
const uploading = ref(false);
const downloadingTemplate = ref(false);
const result = ref<ImportResult>({ created: [], errors: [], total: 0 });

const createdCount = computed(() => (result.value.created?.length ?? result.value.matched?.length ?? 0));
const failedCount = computed(() => result.value.errors?.length ?? 0);

watch(() => props.modelValue, (visible) => { if (visible) reset(); });

function reset() {
  stage.value = 'upload';
  dragging.value = false;
  uploading.value = false;
  result.value = { created: [], errors: [], total: 0 };
  if (fileInput.value) fileInput.value.value = '';
}

function resetToUpload() {
  stage.value = 'upload';
  result.value = { created: [], errors: [], total: 0 };
  if (fileInput.value) fileInput.value.value = '';
}

function onDropzoneClick() {
  if (uploading.value) return;
  fileInput.value?.click();
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void upload(file);
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void upload(file);
}

async function downloadTemplate() {
  downloadingTemplate.value = true;
  try {
    const res = await api.get(props.templateUrl, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = props.templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('bulkImport.downloadFailed'));
  } finally {
    downloadingTemplate.value = false;
  }
}

async function upload(file: File) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    ElMessage.warning(t('bulkImport.formatHint'));
    return;
  }
  uploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post(props.uploadUrl, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    result.value = res.data.data ?? { created: [], errors: [], total: 0 };
    stage.value = 'result';
    emit('imported', result.value);
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('bulkImport.uploadFailed'));
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<style scoped>
.bid-stage { display: flex; flex-direction: column; gap: 16px; }
.bid-template {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.bid-template-hint { font-size: 12px; color: #64748b; }

.bid-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  background: #fafbfc;
  cursor: pointer;
  transition: all .15s;
}
.bid-dropzone:hover { border-color: #2563eb; background: #f0f6ff; }
.bid-dropzone.is-dragging { border-color: #2563eb; background: #e0edff; transform: scale(1.005); }
.bid-dropzone.is-uploading { cursor: progress; opacity: 0.85; }
.bid-icon { color: #2563eb; }
.bid-primary-text { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #0f172a; }
.bid-hint-text { margin: 0; font-size: 12px; color: #94a3b8; }

.bid-stat {
  display: flex;
  gap: 20px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
}
.bid-stat-ok { color: #15803d; font-weight: 600; }
.bid-stat-fail { color: #b91c1c; font-weight: 600; }
.bid-all-ok { color: #15803d; margin: 0; font-size: 13px; }
</style>
