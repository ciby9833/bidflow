<!--
文件：frontend/src/mobile/supplier/MobileSupplierProfileEditView.vue
功能：H5 供应商认证资料录入页，按步骤填写公司资料并上传认证附件。
交互：读取 /api/supplier/profile 回填；上传附件后调用 /api/supplier/profile/submit；提交前二次确认。
作者：吴川
-->
<template>
  <main class="profile-edit" v-loading="loading">
    <nav class="steps" :aria-label="t('supplierProfile.entrySteps')">
      <button :class="{ active: step === 1 }" type="button" @click="step = 1">1 {{ t('supplierProfile.companyInfo') }}</button>
      <button :class="{ active: step === 2 }" type="button" @click="goStepTwo">2 {{ t('supplierProfile.certificationAttachments') }}</button>
    </nav>

    <el-form v-if="step === 1" class="form-sheet" :model="form" label-position="top">
      <section class="field-card">
        <!-- 首次注册需选择归属机构；已绑定供应商主体的账号归属已定，不再展示 -->
        <el-form-item v-if="needsBranchChoice" :label="t('supplierProfile.registerBranch')" required>
          <el-select v-model="form.branchId" size="large" style="width:100%" :placeholder="t('supplierProfile.registerBranchPlaceholder')">
            <el-option v-for="b in registrableBranches" :key="b.id" :label="countryLabel(b)" :value="b.id" />
          </el-select>
          <div class="branch-hint">{{ t('supplierProfile.registerBranchHint') }}</div>
        </el-form-item>
        <SupplierCountrySelect v-model="form.countryCode" :branch-id="form.branchId" :auto-default="needsBranchChoice" />
            <el-form-item :label="t('supplier.legal_name')" required>
          <el-input v-model.trim="form.legalName" size="large" />
        </el-form-item>
        <el-form-item :label="t('supplier.short_name')" required>
          <el-input v-model.trim="form.shortName" size="large" />
        </el-form-item>
        <el-form-item :label="t('common.contact_name')" required>
          <el-input v-model.trim="form.contactName" autocomplete="name" size="large" />
        </el-form-item>
        <el-form-item :label="t('common.contact_phone')" required>
          <el-input v-model.trim="form.contactPhone" autocomplete="tel" inputmode="tel" size="large" />
        </el-form-item>
        <el-form-item :label="t('supplierProfile.taxOrCreditCode')">
          <el-input v-model.trim="form.taxId" size="large" />
        </el-form-item>
      </section>
      <button class="primary-action" type="button" @click="goStepTwo">{{ t('tenderCreate.next') }}</button>
    </el-form>

    <section v-else class="doc-list">
      <article v-for="(item, index) in documents" :key="item.docType" class="doc-card">
        <span>{{ docLabel(item) }}</span>
        <input :ref="(el) => setFileInputRef(el, index)" hidden type="file" accept=".pdf,image/*" @change="uploadFile(index, $event)" />
        <button v-if="!item.fileUrl" class="upload-button" type="button" @click="fileInputs[index]?.click()">
          {{ uploadingIndex === index ? t('tenderCreate.uploading') : t('supplierProfile.uploadPdfImage') }}
        </button>
        <button v-else class="file-name" type="button" @click="previewDoc(item)">{{ item.fileName }}</button>
        <button v-if="item.fileUrl" class="secondary-action" type="button" @click="clearDocFile(index)">{{ t('supplierProfile.reupload') }}</button>
      </article>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <button class="secondary-action" type="button" @click="step = 1">{{ t('tenderCreate.previous') }}</button>
      <button class="primary-action" type="button" :disabled="submitting" @click="submit">
        {{ submitting ? t('supplierProfile.submitting') : t('supplierProfile.submitProfile') }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  onMounted, reactive, ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { buildSupplierDocuments as buildRequiredDocs } from '../../composables/supplierDocuments';
import SupplierCountrySelect from '../../components/SupplierCountrySelect.vue';
import { api } from '../../composables/useApi';
import { preselectBranch } from '../../composables/useBranchPreselect';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();
const loading = ref(false);
const submitting = ref(false);

/** 可注册的国家机构。与桌面端同源，供应商必须显式选择归属。 */
const registrableBranches = ref<{ id: string; code: string; name: string }[]>([]);
const needsBranchChoice = computed(() => !auth.user?.supplierId);

/**
 * 供应商侧展示国家而非机构名。
 * "Indonesia Branch" 是采购方的内部组织称谓，对供应商没有意义 ——
 * 他关心的是"我要向哪个国家注册"。国别代码用 Intl 转成本地化的国家名。
 */
function countryLabel(b: { name: string; code: string; countryCode?: string }) {
  if (!b.countryCode) return b.name;
  try {
    const dn = new Intl.DisplayNames([locale.value], { type: 'region' });
    return dn.of(b.countryCode) ?? b.name;
  } catch {
    return b.name;
  }
}

async function loadRegistrableBranches() {
  if (!needsBranchChoice.value) return;
  try {
    registrableBranches.value = (await api.get('/api/hall/registrable-branches')).data.data;
    form.branchId = preselectBranch(registrableBranches.value) || form.branchId;
  } catch {
    // 拉取失败不阻塞；提交时后端会校验
  }
}
const uploadingIndex = ref<number | null>(null);
const fileInputs = ref<Record<number, HTMLInputElement>>({});
const step = ref<1 | 2>(1);
const error = ref('');
const form = reactive({
  branchId: '',
  legalName: '',
  shortName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  countryCode: '',
  taxId: '',
});
const documents = ref<any[]>([]);
function docLabel(doc: any) { return t(`supplierDocs.${doc.docType}`, doc.docLabel || doc.docType); }

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/supplier/profile');
    const { supplier, documents: existingDocuments } = res.data.data;
    form.legalName = supplier.legalName ?? '';
    form.shortName = supplier.shortName ?? '';
    form.contactName = supplier.contactName ?? '';
    form.contactEmail = supplier.contactEmail ?? '';
    form.contactPhone = supplier.contactPhone ?? '';
    form.countryCode = supplier.countryCode || form.countryCode;
    form.taxId = supplier.taxId ?? '';
    documents.value = buildRequiredDocs(form.countryCode, existingDocuments ?? []);
  } finally {
    loading.value = false;
  }
}

function setFileInputRef(el: any, index: number) {
  if (el) fileInputs.value[index] = el;
}

function goStepTwo() {
  if (!form.legalName || !form.shortName || !form.contactName || !form.contactPhone) {
    error.value = t('supplierProfile.validationBaseRequired');
    return;
  }
  error.value = '';
  step.value = 2;
}

async function uploadFile(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadingIndex.value = index;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/uploads/supplier-documents', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    Object.assign(documents.value[index], res.data.data);
  } finally {
    uploadingIndex.value = null;
    input.value = '';
  }
}

function previewDoc(item: any) {
  const url = item.objectKey ? `/api/uploads/preview/${encodeURIComponent(item.objectKey)}` : item.fileUrl;
  if (url) window.open(url, '_blank');
}

function clearDocFile(index: number) {
  Object.assign(documents.value[index], {
    fileName: '',
    fileUrl: '',
    objectKey: '',
    mimeType: '',
    fileSize: 0,
  });
}

async function submit() {
  if (!form.legalName || !form.shortName || !form.contactName || !form.contactPhone) {
    error.value = t('supplierProfile.validationBaseRequired');
    return;
  }
  if (documents.value.some((item) => !(item.fileUrl || item.textValue))) {
    error.value = t('supplierProfile.validationDocsRequired');
    return;
  }
  await ElMessageBox.confirm(
    t('supplierProfile.submitConfirmMessage'),
    t('common.confirm'),
    { confirmButtonText: t('supplierProfile.submitProfile'), cancelButtonText: t('common.cancel') },
  );
  submitting.value = true;
  error.value = '';
  try {
    await api.post('/api/supplier/profile/submit', {
      ...form,
      countryCode: form.countryCode || undefined,
      documents: documents.value.map((doc) => ({ ...doc, docLabel: docLabel(doc) })),
    });
    await auth.loadMe();
    router.replace('/m/supplier/review-pending');
  } catch (e: any) {
    error.value = e.response?.data?.error?.message_key ? t(e.response.data.error.message_key) : (e.response?.data?.message ?? t('quote.submitFailed'));
  } finally {
    submitting.value = false;
  }
}

watch(
  () => form.countryCode,
  (value, oldValue) => {
    if (value === oldValue) return;
    documents.value = buildRequiredDocs(value, documents.value);
  },
);

onMounted(() => { void load(); void loadRegistrableBranches(); });
</script>

<style scoped>
.profile-edit {
  min-height: 100%;
  padding: 12px 12px 96px;
  background: #f2f2f7;
}
.steps {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  padding: 3px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: #e5e5ea;
}
.steps button {
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  font-weight: 650;
}
.steps button.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.form-sheet,
.doc-list {
  display: grid;
  gap: 10px;
}
.field-card {
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  padding: 2px 14px;
}
.field-card :deep(.el-form-item) {
  margin-bottom: 0;
  padding: 10px 0;
  border-bottom: 1px solid #e5e5ea;
}
.field-card :deep(.el-form-item:last-child) {
  border-bottom: 0;
}
.field-card :deep(.el-form-item__label) {
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.2;
}
.field-card :deep(.el-select) {
  width: 100%;
}
.field-card :deep(.el-input__wrapper),
.field-card :deep(.el-select__wrapper) {
  min-height: 42px;
  padding: 0;
  box-shadow: none;
  background: transparent;
}
.field-card :deep(.el-input__inner),
.field-card :deep(.el-select__placeholder),
.field-card :deep(.el-select__selected-item) {
  color: #111827;
  font-size: 16px;
}
.doc-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  background: #fff;
}
.doc-card span {
  color: #111827;
  font-weight: 650;
}
.upload-button,
.secondary-action,
.primary-action {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 650;
}
.upload-button,
.secondary-action {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
}
.primary-action {
  border: 0;
  background: #007aff;
  color: #fff;
}
.primary-action:disabled {
  opacity: .65;
}
.file-name {
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: 12px;
  background: #eef6ff;
  padding: 0 10px;
  color: #6b7280;
  font-size: 13px;
  text-align: left;
  word-break: break-all;
}
.branch-hint { margin-top: 4px; font-size: 12px; color: #909399; line-height: 1.5; }
</style>
