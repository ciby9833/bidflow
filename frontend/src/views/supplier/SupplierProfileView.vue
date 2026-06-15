<!--
文件：frontend/src/views/supplier/SupplierProfileView.vue
功能：供应商资料提交页，用于提交基础认证资料和简单附件信息。
交互：调用 supplier-portal.controller.ts 的资料读取与提交流程；供供应商完成首次认证和补件。
作者：吴川
-->
<template>
  <div class="profile-page" v-loading="loading">
    <div class="page-header">
      <div>
        <h2>{{ t('route.supplierProfile') }}</h2>
        <p class="sub">
          {{ t('supplierProfile.currentReviewStatus') }}
          <el-tag :type="reviewTag(form.reviewStatus)">{{ reviewStatusLabel(form.reviewStatus) }}</el-tag>
        </p>
      </div>
      <div class="header-actions">
        <el-button v-if="!editing && hasSubmitted && canEditProfile" @click="editing = true">{{ editButtonText }}</el-button>
        <el-button v-if="editing" @click="editing = false">{{ t('common.cancel') }}</el-button>
        <el-button v-if="editing" type="primary" :loading="submitting" @click="submit">{{ t('supplierProfile.submitProfile') }}</el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :lg="14" :span="24">
        <el-card v-if="!editing && !hasSubmitted" class="empty-state">
          <h3>{{ t('supplierProfile.notSubmittedTitle') }}</h3>
          <p>{{ t('supplierProfile.notSubmittedDesc') }}</p>
          <el-button type="primary" @click="editing = true">{{ t('supplierProfile.enterProfile') }}</el-button>
        </el-card>

        <el-card v-else-if="!editing">
          <section class="profile-view">
            <div class="kv"><span>{{ t('supplier.legal_name') }}</span><strong>{{ form.legalName || t('supplierProfile.notFilled') }}</strong></div>
            <div class="kv"><span>{{ t('supplier.short_name') }}</span><strong>{{ form.shortName || t('supplierProfile.notFilled') }}</strong></div>
            <div class="kv"><span>{{ t('common.contact_name') }}</span><strong>{{ form.contactName || t('supplierProfile.notFilled') }}</strong></div>
            <div class="kv"><span>{{ t('common.contact_phone') }}</span><strong>{{ form.contactPhone || t('supplierProfile.notFilled') }}</strong></div>
            <div class="kv"><span>{{ t('common.contact_email') }}</span><strong>{{ form.contactEmail || t('supplierProfile.notFilled') }}</strong></div>
            <div class="kv"><span>{{ t('supplierProfile.taxOrCreditCode') }}</span><strong>{{ form.taxId || t('supplierProfile.notFilled') }}</strong></div>
          </section>

          <el-divider>{{ t('supplierProfile.certificationDocs') }}</el-divider>
          <div class="doc-view-list">
            <button
              v-for="doc in form.documents"
              :key="doc.docType"
              :class="['doc-view-item', doc.fileUrl ? 'clickable' : 'missing']"
              type="button"
              @click="previewDoc(doc)"
            >
              <span>
                <strong>{{ docLabel(doc) }}</strong>
                <small>{{ doc.fileName || t('supplierProfile.notUploaded') }}</small>
              </span>
              <em>{{ doc.fileUrl ? t('common.view') : t('supplierProfile.missing') }}</em>
            </button>
          </div>
        </el-card>

        <el-card v-else>
          <el-form :model="form" label-position="top">
            <el-form-item :label="t('supplier.legal_name')" required><el-input v-model="form.legalName" /></el-form-item>
            <el-form-item :label="t('supplier.short_name')" required><el-input v-model="form.shortName" /></el-form-item>
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item :label="t('common.contact_name')" required><el-input v-model="form.contactName" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item :label="t('common.contact_phone')" required><el-input v-model="form.contactPhone" /></el-form-item></el-col>
            </el-row>
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item :label="t('common.contact_email')"><el-input v-model="form.contactEmail" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item :label="t('supplierProfile.taxOrCreditCode')"><el-input v-model="form.taxId" /></el-form-item></el-col>
            </el-row>

            <el-divider>{{ t('supplierProfile.certificationDocs') }}</el-divider>
            <p class="doc-tip">{{ t('supplierProfile.docTip') }}</p>
            <div v-for="(doc, index) in form.documents" :key="index" class="doc-block">
              <div class="doc-headline">
                <strong>{{ docLabel(doc) }}</strong>
                <span>{{ t('supplierProfile.required') }}</span>
              </div>
              <el-row :gutter="12" class="mt-8">
                <el-col :span="16">
                  <div class="file-line">
                    <input :ref="(el) => setFileInputRef(el, index)" hidden type="file" accept=".pdf,image/*" @change="uploadDocFile(index, $event)" />
                    <el-button :loading="uploadingIndex === index" @click="openFilePicker(index)">{{ t('supplierProfile.uploadPdfImage') }}</el-button>
                    <button v-if="doc.fileName" class="file-link" type="button" @click="previewDoc(doc)">
                      {{ doc.fileName }}{{ doc.fileSize ? ` · ${formatSize(doc.fileSize)}` : '' }}
                    </button>
                  </div>
                </el-col>
                <el-col :span="8"><el-button v-if="doc.fileUrl" @click="clearDocFile(index)">{{ t('supplierProfile.reupload') }}</el-button></el-col>
              </el-row>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <el-col :lg="10" :span="24">
        <el-card v-if="!auth.user?.supplierId" class="side-card">
          <h3>{{ t('supplierProfile.haveInvitation') }}</h3>
          <p class="hint">{{ t('supplierProfile.invitationHint') }}</p>
          <el-input v-model.trim="joinToken" :placeholder="t('supplierProfile.invitationPlaceholder')" />
          <div v-if="joinPreview" class="join-preview">
            <strong>{{ joinPreview.supplier?.legalName || joinPreview.supplier?.shortName || t('supplierProfile.unknownSupplier') }}</strong>
            <span>{{ invitationMetaText(joinPreview) }}</span>
          </div>
          <div v-if="joinError" class="join-error">{{ joinError }}</div>
          <el-button type="primary" :loading="joining" class="full-action" @click="joinByToken">{{ t('supplierProfile.joinSupplier') }}</el-button>
        </el-card>

        <el-card v-else class="side-card">
          <el-tabs v-model="sideTab">
            <el-tab-pane :label="t('supplierMembers.title')" name="members">
              <SupplierMembersPanel api-base="/api/supplier/members" :can-manage="canManageMembers" />
            </el-tab-pane>
            <el-tab-pane :label="t('supplierReviewDetail.memberInvitations')" name="invitations">
              <p class="hint">{{ t('supplierProfile.invitationExpiresHint') }}</p>
              <el-button v-if="canManageMembers" class="full-action" @click="createMemberInvitation">{{ t('supplierReviewDetail.createInvitation') }}</el-button>
              <div class="invite-list">
                <div v-if="invitations.length === 0" class="empty">{{ t('supplierReviewDetail.noInvitations') }}</div>
                <div v-for="item in invitations" :key="item.id" class="invite-item">
                  <div>
                    <strong>{{ item.token }}</strong>
                    <span>{{ invitationMetaText(item) }}</span>
                    <span v-if="item.acceptedBy">{{ t('supplierReviewDetail.usedBy', { name: item.acceptedBy.displayName || t('userList.namePlaceholder') }) }} · {{ item.acceptedBy.email }}</span>
                  </div>
                  <div class="row-actions">
                    <el-button v-if="item.status === 'pending'" text :icon="CopyDocument" @click="copyInvitation(item.token)" />
                    <el-button v-if="item.status === 'pending'" text type="danger" :icon="Delete" @click="revokeInvitation(item)" />
                  </div>
                </div>
              </div>
              <el-pagination
                v-if="inviteTotal > inviteQuery.limit"
                small
                layout="prev, pager, next"
                v-model:current-page="inviteQuery.page"
                :page-size="inviteQuery.limit"
                :total="inviteTotal"
                @current-change="changeInvitePage"
              />
            </el-tab-pane>
            <el-tab-pane :label="t('supplierReviewDetail.reviewLogs')" name="reviewLogs">
              <div v-if="logs.length === 0" class="empty">{{ t('supplierProfile.noReviewLogs') }}</div>
              <div v-for="log in logs" :key="log.id" class="log-item">
                <div class="log-top">
                  <strong>{{ logActionText(log.action) }}</strong>
                  <el-tag size="small" :type="reviewTag(log.reviewStatus)">{{ reviewStatusLabel(log.reviewStatus) || '—' }}</el-tag>
                </div>
                <div class="log-comment">{{ log.comment || t('supplierReviewDetail.noComment') }}</div>
                <div class="log-time">{{ fmt(log.createdAt) }}</div>
              </div>
              <el-pagination
                v-if="logTotal > logQuery.limit"
                small
                layout="prev, pager, next"
                v-model:current-page="logQuery.page"
                :page-size="logQuery.limit"
                :total="logTotal"
                @current-change="changeLogPage"
              />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="preview.visible" :title="preview.title" width="82vw" class="preview-dialog">
      <iframe v-if="preview.kind === 'inline'" class="preview-frame" :src="preview.url" :title="t('supplierReviewDetail.docPreview')" />
      <div v-else class="preview-fallback">
        <p>{{ t('supplierReviewDetail.previewUnsupported') }}</p>
        <el-button type="primary" @click="openPreviewFile">{{ t('supplierReviewDetail.openFile') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onActivated, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CopyDocument, Delete } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';
import SupplierMembersPanel from './SupplierMembersPanel.vue';

const loading = ref(false);
const submitting = ref(false);
const logs = ref<any[]>([]);
const invitations = ref<any[]>([]);
const inviteTotal = ref(0);
const logTotal = ref(0);
const inviteQuery = reactive({ page: 1, limit: 5 });
const logQuery = reactive({ page: 1, limit: 5 });
const sideTab = ref('members');
const auth = useAuthStore();
const { t } = useI18n();
const fileInputs = ref<Record<number, HTMLInputElement>>({});
const uploadingIndex = ref<number | null>(null);
const joinToken = ref('');
const joining = ref(false);
const joinPreview = ref<any>(null);
const joinError = ref('');
const editing = ref(true);
const preview = reactive({
  visible: false,
  title: '',
  url: '',
  kind: 'inline' as 'inline' | 'download',
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
// 当前业务仅开放印尼供应商认证，前端不展示国家选择器。
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
  reviewStatus: 'not_submitted',
  documents: [
    { docType: 'nib', docLabel: 'nib', textValue: '', fileName: '', fileUrl: '', objectKey: '', mimeType: '', fileSize: 0 },
  ] as any[],
});
const hasSubmitted = computed(() => form.reviewStatus !== 'not_submitted');
const canEditProfile = computed(() => ['not_submitted', 'supplement_required', 'rejected'].includes(form.reviewStatus));
const canManageMembers = computed(() => ['owner', 'admin'].includes(String(auth.user?.supplierRelationRole || '')));
const editButtonText = computed(() => (form.reviewStatus === 'supplement_required' ? t('supplierProfile.supplementProfile') : t('supplierProfile.editProfile')));
function reviewStatusLabel(status?: string) { return status ? t(`supplierReview.${status}`) : t('supplierReview.not_submitted'); }
function docLabel(doc: any) { return t(`supplierDocs.${doc.docType}`, doc.docLabel || doc.docType); }

function fmt(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function reviewTag(status?: string) {
  return {
    not_submitted: 'info',
    pending_review: 'warning',
    supplement_required: 'info',
    approved: 'success',
    rejected: 'danger',
  }[status || 'not_submitted'] ?? 'info';
}

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
    await auth.loadMe();
    const res = await api.get('/api/supplier/profile');
    const { supplier, documents, reviewLogs } = res.data.data;
    form.legalName = supplier.legalName ?? '';
    form.shortName = supplier.shortName ?? '';
    form.contactName = supplier.contactName ?? '';
    form.contactEmail = supplier.contactEmail ?? '';
    form.contactPhone = supplier.contactPhone ?? '';
    form.countryCode = FIXED_SUPPLIER_COUNTRY_CODE;
    form.taxId = supplier.taxId ?? '';
    form.reviewStatus = supplier.reviewStatus ?? 'not_submitted';
    form.documents = buildRequiredDocs(form.countryCode, documents ?? []);
    editing.value = false;
    logs.value = reviewLogs ?? [];
    if (auth.user?.supplierId) await Promise.all([loadInvitations(), loadReviewLogs()]);
  } finally {
    loading.value = false;
  }
}

function clearDocFile(index: number) {
  Object.assign(form.documents[index], {
    fileName: '',
    fileUrl: '',
    objectKey: '',
    mimeType: '',
    fileSize: 0,
  });
}

function setFileInputRef(el: any, index: number) {
  if (el) fileInputs.value[index] = el;
}

function openFilePicker(index: number) {
  fileInputs.value[index]?.click();
}

async function uploadDocFile(index: number, event: Event) {
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
    Object.assign(form.documents[index], res.data.data);
  } finally {
    uploadingIndex.value = null;
    input.value = '';
  }
}

function previewDoc(doc: any) {
  if (!doc.fileUrl) return;
  preview.title = doc.fileName || docLabel(doc) || t('supplierReviewDetail.docPreview');
  preview.url = doc.fileUrl;
  preview.kind = doc.mimeType?.startsWith('image/') || doc.mimeType === 'application/pdf' ? 'inline' : 'download';
  preview.visible = true;
}

function openPreviewFile() {
  if (preview.url) window.open(preview.url, '_blank');
}

function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

async function joinByToken() {
  if (!joinToken.value) {
    joinError.value = t('supplierProfile.invitationRequired');
    return;
  }
  joining.value = true;
  joinError.value = '';
  joinPreview.value = null;
  try {
    const preview = await previewInvitation(joinToken.value);
    joinPreview.value = preview;
    if (!preview.canJoin) {
      joinError.value = t('supplierProfile.invitationCannotJoin', { status: invitationStatusText(preview.status) });
      return;
    }
    const supplierName = preview.supplier?.legalName || preview.supplier?.shortName || t('supplierProfile.unknownSupplier');
    await ElMessageBox.confirm(
      t('supplierProfile.joinConfirmMessage', { name: supplierName, status: invitationStatusText(preview.status), time: fmt(preview.expiresAt) }),
      t('supplierProfile.joinConfirmTitle'),
      { type: 'warning', confirmButtonText: t('supplierProfile.confirmJoin'), cancelButtonText: t('common.cancel') },
    );
    await api.post('/api/supplier/company/join', { token: joinToken.value });
    await auth.loadMe();
    ElMessage.success(t('supplierProfile.joinedSupplier'));
    await load();
  } catch (e: any) {
    if (e !== 'cancel') joinError.value = e.response?.data?.message ?? t('supplierProfile.joinFailed');
  } finally {
    joining.value = false;
  }
}

async function previewInvitation(token: string) {
  const res = await api.get('/api/supplier/company/invitation-preview', { params: { token } });
  return res.data.data;
}

async function createMemberInvitation() {
  const res = await api.post('/api/supplier/members/invitations', {});
  try {
    await ElMessageBox.confirm(res.data.data.token, t('supplierReviewDetail.memberInvitationCode'), {
      confirmButtonText: t('supplierReviewDetail.copyInvitation'),
      cancelButtonText: t('common.close'),
    });
    await copyInvitation(res.data.data.token);
  } catch {
    // 用户关闭弹窗，不需要额外处理。
  }
  inviteQuery.page = 1;
  await loadInvitations();
}

async function loadInvitations() {
  const res = await api.get('/api/supplier/members/invitations', { params: inviteQuery });
  invitations.value = res.data.data?.items ?? [];
  inviteTotal.value = res.data.data?.total ?? 0;
}

async function loadReviewLogs() {
  const res = await api.get('/api/supplier/review-logs', { params: logQuery });
  logs.value = res.data.data?.items ?? [];
  logTotal.value = res.data.data?.total ?? 0;
}

async function revokeInvitation(item: any) {
  await ElMessageBox.confirm(t('supplierReviewDetail.revokeConfirm'), t('supplierReviewDetail.revokeInvitation'), {
    type: 'warning',
    confirmButtonText: t('supplierReviewDetail.confirmRevoke'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/supplier/members/invitations/${item.id}/revoke`);
  ElMessage.success(t('supplierReviewDetail.invitationRevoked'));
  await loadInvitations();
}

async function copyInvitation(token: string) {
  await navigator.clipboard.writeText(token);
  ElMessage.success(t('supplierReviewDetail.invitationCopied'));
}

function changeInvitePage(page: number) {
  inviteQuery.page = page;
  loadInvitations();
}

function changeLogPage(page: number) {
  logQuery.page = page;
  loadReviewLogs();
}

function invitationStatusText(status?: string) {
  return {
    pending: t('supplierReviewDetail.invitationStatus.pending'),
    accepted: t('supplierReviewDetail.invitationStatus.accepted'),
    revoked: t('supplierReviewDetail.invitationStatus.revoked'),
    expired: t('supplierReviewDetail.invitationStatus.expired'),
  }[status ?? ''] ?? status ?? t('supplierReviewDetail.invitationStatus.unknown');
}

function invitationMetaText(item: any) {
  const status = invitationStatusText(item?.status);
  if (item?.status === 'pending') return t('supplierReviewDetail.invitationPendingMeta', { status, time: fmt(item.expiresAt) });
  return t('supplierReviewDetail.invitationMeta', { status });
}

function logActionText(action?: string) {
  const map: Record<string, string> = {
    submit_profile: t('supplierReviewDetail.logAction.submit_profile'),
    approve: t('supplierReviewDetail.logAction.approve'),
    reject: t('supplierReviewDetail.logAction.reject'),
    request_supplement: t('supplierReviewDetail.logAction.request_supplement'),
    supplement: t('supplierReviewDetail.logAction.request_supplement'),
    suspend: t('supplierReviewDetail.logAction.suspend'),
    resume: t('supplierReviewDetail.logAction.resume'),
  };
  return map[action ?? ''] ?? action ?? t('supplierReviewDetail.reviewLogs');
}

async function submit() {
  if (!form.legalName.trim() || !form.shortName.trim() || !form.contactName.trim() || !form.contactPhone.trim()) {
    ElMessage.error(t('supplierProfile.validationBaseRequired'));
    return;
  }
  const validDocuments = form.documents.filter((doc) => doc.docType && doc.docLabel && doc.fileUrl);
  if (validDocuments.length !== form.documents.length) {
    ElMessage.error(t('supplierProfile.validationDocsRequired'));
    return;
  }
  await ElMessageBox.confirm(
    t('supplierProfile.submitConfirmMessage'),
    t('common.confirm'),
    { type: 'warning', confirmButtonText: t('supplierProfile.submitProfile'), cancelButtonText: t('common.cancel') },
  );
  submitting.value = true;
  try {
    await api.post('/api/supplier/profile/submit', {
      legalName: form.legalName,
      shortName: form.shortName,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      countryCode: FIXED_SUPPLIER_COUNTRY_CODE,
      taxId: form.taxId,
      documents: validDocuments.map((doc) => ({ ...doc, docLabel: docLabel(doc) })),
    });
    await auth.loadMe();
    ElMessage.success(t('supplierProfile.submittedPending'));
    await load();
  } finally {
    submitting.value = false;
  }
}

watch(
  () => form.countryCode,
  (value, oldValue) => {
    if (!oldValue) return;
    form.documents = buildRequiredDocs(value, form.documents);
  },
);

onMounted(load);
onActivated(load);
</script>

<style scoped>
.profile-page { display: grid; gap: 18px; }
.profile-page :deep(.el-select) { width: 100%; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 4px; }
.page-header h2 { margin: 0 0 8px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.sub { margin: 0; color: #606266; }
.empty-state {
  text-align: center;
}
.empty-state h3 {
  margin: 12px 0 8px;
  color: #111827;
}
.empty-state p {
  max-width: 520px;
  margin: 0 auto 18px;
  color: #606266;
  line-height: 1.8;
}
.profile-view { display: grid; gap: 12px; }
.kv { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 10px; border-bottom: 1px solid #f0f2f5; }
.kv span { color: #606266; }
.kv strong { color: #111827; text-align: right; overflow-wrap: anywhere; }
.doc-view-list { display: grid; gap: 10px; }
.doc-view-item { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; text-align: left; }
.doc-view-item.clickable { cursor: pointer; }
.doc-view-item span { min-width: 0; display: grid; gap: 5px; }
.doc-view-item strong { color: #111827; }
.doc-view-item small { color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-view-item em { color: #0369a1; font-style: normal; white-space: nowrap; }
.doc-view-item.missing em { color: #dc2626; }
.doc-block { padding: 14px; border: 1px solid #ebeef5; border-radius: 12px; margin-bottom: 12px; }
.doc-tip { margin: 0 0 12px; color: #606266; }
.doc-headline { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.doc-headline strong { color: #111827; }
.doc-headline span { color: #dc2626; font-size: 12px; }
.mt-8 { margin-top: 8px; }
.file-line { display: flex; align-items: center; gap: 10px; min-height: 32px; }
.file-line span { color: #606266; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-link { min-width: 0; border: 0; background: transparent; color: #0369a1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.side-card { margin-bottom: 16px; }
.hint { margin: 0 0 12px; color: #606266; line-height: 1.7; }
.full-action { width: 100%; margin-top: 12px; }
.join-preview { display: grid; gap: 4px; padding: 10px 12px; margin-top: 12px; border-radius: 10px; background: #f0f9ff; }
.join-preview strong { color: #111827; overflow-wrap: anywhere; }
.join-preview span { color: #0369a1; font-size: 12px; }
.join-error { padding: 10px 12px; margin-top: 12px; border-radius: 10px; background: #fff1f2; color: #e11d48; font-size: 13px; }
.invite-list { display: grid; gap: 10px; margin-top: 14px; }
.invite-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid #f0f2f5; }
.invite-item div { min-width: 0; display: grid; gap: 4px; }
.invite-item strong { color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow-wrap: anywhere; }
.invite-item span { color: #606266; font-size: 12px; }
.row-actions { display: inline-flex !important; grid-auto-flow: column; align-items: center; gap: 2px; }
.preview-frame { width: 100%; height: 72vh; border: 0; }
.preview-fallback { display: grid; justify-items: center; gap: 16px; padding: 48px 0; color: #606266; }
.log-item { padding: 12px 0; border-bottom: 1px solid #f0f2f5; }
.log-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 6px; }
.log-comment { color: #606266; line-height: 1.7; }
.log-time { color: #909399; font-size: 12px; margin-top: 4px; }
.empty { color: #909399; padding: 12px 0; }
@media (pointer: coarse) {
  .profile-page { gap: 12px; }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .page-header h2 {
    font-size: 22px;
  }
  .page-header :deep(.el-button) {
    min-height: 44px;
  }
  :deep(.el-card) {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
  :deep(.el-card__body) {
    padding: 0;
  }
  .doc-block {
    padding: 12px 0;
    border: 0;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0;
  }
  .doc-block :deep(.el-row) {
    display: grid;
    gap: 10px;
  }
  .doc-block :deep(.el-col) {
    max-width: none;
    flex: none;
    width: 100%;
  }
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 44px;
  }
}
</style>
