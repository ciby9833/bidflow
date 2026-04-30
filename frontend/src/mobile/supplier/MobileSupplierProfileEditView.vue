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
  onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const loading = ref(false);
const submitting = ref(false);
const uploadingIndex = ref<number | null>(null);
const fileInputs = ref<Record<number, HTMLInputElement>>({});
const step = ref<1 | 2>(1);
const error = ref('');
// 当前业务仅开放印尼供应商认证，H5 不展示国家选择器。
// 后续开放多国家时，恢复国家选择控件，并按国家扩展 docTemplates 即可。
const FIXED_SUPPLIER_COUNTRY_CODE = 'ID';
const form = reactive({
  legalName: '',
  shortName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  countryCode: FIXED_SUPPLIER_COUNTRY_CODE,
  taxId: '',
});
const docTemplates: Record<string, Array<{ docType: string; docLabel: string }>> = {
  CN: [
    { docType: 'business_license', docLabel: 'business_license' },
    { docType: 'legal_representative_id', docLabel: 'legal_representative_id' },
    { docType: 'bank_account_certificate', docLabel: 'bank_account_certificate' },
  ],
  ID: [
    { docType: 'nib', docLabel: 'nib' },
    { docType: 'npwp', docLabel: 'npwp' },
    { docType: 'akta_sk', docLabel: 'Akta / SK Kemenkumham' },
  ],
};
const documents = ref<any[]>([]);
function docLabel(doc: any) { return t(`supplierDocs.${doc.docType}`, doc.docLabel || doc.docType); }

function buildRequiredDocs(countryCode = FIXED_SUPPLIER_COUNTRY_CODE, existing: any[] = []) {
  const templates = docTemplates[String(countryCode).toUpperCase()] ?? docTemplates.ID;
  return templates.map((item) => ({
    ...item,
    textValue: '',
    fileName: '',
    fileUrl: '',
    objectKey: '',
    mimeType: '',
    fileSize: 0,
    ...(existing.find((doc) => doc.docType === item.docType) ?? {}),
  }));
}

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
    form.countryCode = FIXED_SUPPLIER_COUNTRY_CODE;
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
  if (documents.value.some((item) => !item.fileUrl)) {
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
      countryCode: FIXED_SUPPLIER_COUNTRY_CODE,
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
    if (!oldValue) return;
    documents.value = buildRequiredDocs(value, documents.value);
  },
);

onMounted(load);
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
</style>
