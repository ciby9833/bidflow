<!--
文件：frontend/src/mobile/supplier/MobileSupplierProfileView.vue
功能：H5 供应商认证资料提交页。
交互：调用 supplier profile 接口；提交后进入 H5 审核进度页。
作者：吴川
-->
<template>
  <main class="mobile-profile" v-loading="loading">
    <section class="status-card">
      <span class="eyebrow">{{ t('route.supplierProfile') }}</span>
      <strong>{{ reviewStatusText }}</strong>
      <p>{{ statusHint }}</p>
      <button v-if="canEditProfile" class="status-action" type="button" @click="router.push('/m/supplier/profile/edit')">
        {{ editButtonText }}
      </button>
    </section>

    <section v-if="!auth.user?.supplierId" class="join-card top-card">
      <strong>{{ t('supplierProfile.haveInvitation') }}</strong>
      <span>{{ t('supplierProfile.invitationHint') }}</span>
      <input v-model.trim="joinToken" :placeholder="t('supplierProfile.invitationPlaceholder')" />
      <div v-if="joinPreview" class="join-preview">
        <strong>{{ joinPreview.supplier?.legalName || joinPreview.supplier?.shortName || t('supplierProfile.unknownSupplier') }}</strong>
        <span>{{ invitationMetaText(joinPreview) }}</span>
      </div>
      <div v-if="error" class="join-error">{{ error }}</div>
      <button type="button" :disabled="joining" @click="joinByToken">{{ joining ? t('supplierProfile.checking') : t('supplierProfile.joinSupplier') }}</button>
    </section>
    <section v-else class="join-card top-card">
      <strong>{{ t('supplierReviewDetail.memberInvitations') }}</strong>
      <span>{{ t('supplierProfile.invitationExpiresHint') }}</span>
      <button type="button" @click="createMemberInvitation">{{ t('supplierReviewDetail.createInvitation') }}</button>
    </section>

    <nav class="segmented-tabs" :aria-label="t('supplierProfile.certificationInfo')">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ t(tab.labelKey) }}
      </button>
    </nav>

    <section v-if="activeTab === 'profile'" class="profile-view">
      <div class="section-head">
        <span>{{ t('supplierProfile.companyInfo') }}</span>
      </div>
      <div class="profile-card">
        <div><span>{{ t('supplier.legal_name') }}</span><strong>{{ form.legalName || t('supplierProfile.notFilled') }}</strong></div>
        <div><span>{{ t('supplier.short_name') }}</span><strong>{{ form.shortName || t('supplierProfile.notFilled') }}</strong></div>
        <div><span>{{ t('common.contact_name') }}</span><strong>{{ form.contactName || t('supplierProfile.notFilled') }}</strong></div>
        <div><span>{{ t('common.contact_phone') }}</span><strong>{{ form.contactPhone || t('supplierProfile.notFilled') }}</strong></div>
        <div><span>{{ t('supplierProfile.taxOrCreditCode') }}</span><strong>{{ form.taxId || t('supplierProfile.notFilled') }}</strong></div>
      </div>
    </section>

    <section v-if="activeTab === 'documents'" class="doc-list view-docs">
      <div class="section-head">
        <span>{{ t('supplierProfile.certificationAttachments') }}</span>
      </div>
      <button
        v-for="item in displayDocuments"
        :key="item.docType"
        :class="['doc-view-item', item.fileUrl || item.objectKey ? '' : 'missing']"
        type="button"
        @click="previewDoc(item)"
      >
        <span>
          <strong>{{ docLabel(item) }}</strong>
          <small>{{ item.fileName || t('supplierProfile.notUploaded') }}</small>
        </span>
        <em>{{ item.fileUrl || item.objectKey ? t('common.view') : t('supplierProfile.missing') }}</em>
      </button>
      <div v-if="!displayDocuments.length" class="empty-card">{{ t('supplierProfile.noAttachments') }}</div>
    </section>

    <section v-if="activeTab === 'logs'" class="log-list" @touchstart="onRecordTouchStart" @touchend="onRecordTouchEnd">
      <div class="section-head">
        <span>{{ t('supplierProfile.records') }}</span>
      </div>
      <nav class="record-switch" :aria-label="t('supplierProfile.recordType')">
        <button :class="{ active: recordTab === 'invitations' }" type="button" @click="recordTab = 'invitations'">{{ t('supplierProfile.invitationRecords') }}</button>
        <button :class="{ active: recordTab === 'reviewLogs' }" type="button" @click="recordTab = 'reviewLogs'">{{ t('supplierReviewDetail.reviewLogs') }}</button>
      </nav>
      <template v-if="recordTab === 'invitations'">
        <article v-for="item in invitations" :key="item.id" class="log-item invite-record">
          <div>
            <strong>{{ item.token }}</strong>
            <small>{{ invitationMetaText(item) }}</small>
            <small v-if="item.acceptedBy">{{ t('supplierReviewDetail.usedBy', { name: item.acceptedBy.displayName || t('userList.namePlaceholder') }) }} · {{ item.acceptedBy.email }}</small>
          </div>
          <div class="mobile-row-actions">
            <button v-if="item.status === 'pending'" type="button" :aria-label="t('supplierReviewDetail.copyInvitation')" @click="copyInvitation(item.token)">
              <CopyDocument />
            </button>
            <button v-if="item.status === 'pending'" class="danger" type="button" :aria-label="t('supplierReviewDetail.revokeInvitation')" @click="revokeInvitation(item)">
              <Delete />
            </button>
          </div>
        </article>
        <div v-if="!invitations.length" class="empty-card">{{ t('supplierProfile.noInvitationRecords') }}</div>
        <div v-if="recordLoading" class="load-more">{{ t('quote.loading') }}</div>
        <div v-else-if="invitations.length < inviteTotal" class="load-more">{{ t('supplierProfile.swipeLoadMore') }}</div>
      </template>
      <template v-else>
        <article v-for="log in logs" :key="log.id" class="log-item">
          <div>
            <strong>{{ logActionText(log.action) }}</strong>
            <small>{{ log.comment || t('supplierReviewDetail.noComment') }}</small>
          </div>
          <time>{{ fmt(log.createdAt) }}</time>
        </article>
        <div v-if="!logs.length" class="empty-card">{{ t('supplierProfile.noReviewLogs') }}</div>
        <div v-if="recordLoading" class="load-more">{{ t('quote.loading') }}</div>
        <div v-else-if="logs.length < logTotal" class="load-more">{{ t('supplierProfile.swipeLoadMore') }}</div>
      </template>
    </section>

  </main>
</template>

<script setup lang="ts">
import {
  computed, onMounted, onUnmounted, reactive, ref, watch,
} from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { CopyDocument, Delete } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();
const loading = ref(false);
const error = ref('');
const joinToken = ref('');
const joining = ref(false);
const joinPreview = ref<any>(null);
// 当前业务仅开放印尼供应商认证，浏览页不展示国家字段。
// 后续开放多国家时，恢复显示字段，并按国家扩展 docTemplates 即可。
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
const rawDocuments = ref<any[]>([]);
const logs = ref<any[]>([]);
const invitations = ref<any[]>([]);
const inviteTotal = ref(0);
const logTotal = ref(0);
const inviteQuery = reactive({ page: 1, limit: 10 });
const logQuery = reactive({ page: 1, limit: 10 });
const recordLoading = ref(false);
const reviewStatus = ref('not_submitted');
const activeTab = ref<'profile' | 'documents' | 'logs'>('profile');
const recordTab = ref<'invitations' | 'reviewLogs'>('invitations');
const touchStartX = ref(0);
const scrollContainer = ref<HTMLElement | Window | null>(null);
const tabs = [
  { key: 'profile', labelKey: 'supplierProfile.profileTab' },
  { key: 'documents', labelKey: 'supplierProfile.documentsTab' },
  { key: 'logs', labelKey: 'supplierProfile.logsTab' },
] as const;
const hasSubmitted = computed(() => reviewStatus.value !== 'not_submitted');
const canEditProfile = computed(() => ['not_submitted', 'supplement_required', 'rejected'].includes(reviewStatus.value));
const editButtonText = computed(() => (reviewStatus.value === 'supplement_required' ? t('supplierProfile.supplementProfile') : t('supplierProfile.editProfile')));
const reviewStatusText = computed(() => t(`supplierReview.${reviewStatus.value}`));
const statusHint = computed(() => t(`supplierProfile.statusHint.${reviewStatus.value}`, t('supplierProfile.statusHint.default')));
const displayDocuments = computed(() => rawDocuments.value.filter((doc) => doc.fileUrl || doc.objectKey || doc.fileName));
function docLabel(doc: any) { return t(`supplierDocs.${doc.docType}`, doc.docLabel || doc.docType); }

function buildRequiredDocs(countryCode = FIXED_SUPPLIER_COUNTRY_CODE, existing: any[] = []) {
  const templates = docTemplates[String(countryCode).toUpperCase()] ?? docTemplates.ID;
  const templateDocs = templates.map((item) => ({
    ...item,
    textValue: '',
    fileName: '',
    fileUrl: '',
    objectKey: '',
    mimeType: '',
    fileSize: 0,
    ...(existing.find((doc) => doc.docType === item.docType) ?? {}),
  }));
  const templateTypes = new Set(templates.map((item) => item.docType));
  const extraDocs = existing
    .filter((doc) => doc.docType && !templateTypes.has(doc.docType))
    .map((doc, index) => ({
      docLabel: doc.docLabel || doc.docType || `attachment_${index + 1}`,
      textValue: '',
      fileName: '',
      fileUrl: '',
      objectKey: '',
      mimeType: '',
      fileSize: 0,
      ...doc,
    }));
  return [...templateDocs, ...extraDocs];
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/supplier/profile');
    const { supplier, documents, reviewLogs } = res.data.data;
    form.legalName = supplier.legalName ?? '';
    form.shortName = supplier.shortName ?? '';
    form.contactName = supplier.contactName ?? '';
    form.contactEmail = supplier.contactEmail ?? '';
    form.contactPhone = supplier.contactPhone ?? '';
    form.countryCode = FIXED_SUPPLIER_COUNTRY_CODE;
    form.taxId = supplier.taxId ?? '';
    reviewStatus.value = supplier.reviewStatus ?? 'not_submitted';
    rawDocuments.value = documents ?? [];
    documents.value = buildRequiredDocs(form.countryCode, rawDocuments.value);
    logs.value = reviewLogs ?? [];
    if (auth.user?.supplierId) await Promise.all([loadInvitations(), loadReviewLogs()]);
    activeTab.value = 'profile';
  } finally {
    loading.value = false;
  }
}

function previewDoc(item: any) {
  const url = item.objectKey ? `/api/uploads/preview/${encodeURIComponent(item.objectKey)}` : item.fileUrl;
  if (url) window.open(url, '_blank');
}

async function joinByToken() {
  if (!joinToken.value) {
    error.value = t('supplierProfile.invitationRequired');
    return;
  }
  joining.value = true;
  error.value = '';
  joinPreview.value = null;
  try {
    const preview = await previewInvitation(joinToken.value);
    joinPreview.value = preview;
    if (!preview.canJoin) {
      error.value = t('supplierProfile.invitationCannotJoin', { status: invitationStatusText(preview.status) });
      return;
    }
    const supplierName = preview.supplier?.legalName || preview.supplier?.shortName || t('supplierProfile.unknownSupplier');
    await ElMessageBox.confirm(
      t('supplierProfile.joinConfirmMessage', { name: supplierName, status: invitationStatusText(preview.status), time: fmt(preview.expiresAt) }),
      t('supplierProfile.joinConfirmTitle'),
      { confirmButtonText: t('supplierProfile.confirmJoin'), cancelButtonText: t('common.cancel') },
    );
    await api.post('/api/supplier/company/join', { token: joinToken.value });
    await auth.loadMe();
    await load();
  } catch (e: any) {
    if (e !== 'cancel') error.value = e.response?.data?.message ?? t('supplierProfile.joinFailed');
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

async function loadInvitations(append = false) {
  const res = await api.get('/api/supplier/members/invitations', { params: inviteQuery });
  const items = res.data.data?.items ?? [];
  invitations.value = append ? [...invitations.value, ...items] : items;
  inviteTotal.value = res.data.data?.total ?? 0;
}

async function loadReviewLogs(append = false) {
  const res = await api.get('/api/supplier/review-logs', { params: logQuery });
  const items = res.data.data?.items ?? [];
  logs.value = append ? [...logs.value, ...items] : items;
  logTotal.value = res.data.data?.total ?? 0;
}

async function revokeInvitation(item: any) {
  await ElMessageBox.confirm(t('supplierReviewDetail.revokeConfirm'), t('supplierReviewDetail.revokeInvitation'), {
    confirmButtonText: t('supplierReviewDetail.confirmRevoke'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/supplier/members/invitations/${item.id}/revoke`);
  await loadInvitations();
}

async function copyInvitation(token: string) {
  await navigator.clipboard.writeText(token);
  ElMessage.success(t('supplierReviewDetail.invitationCopied'));
}

function onRecordTouchStart(event: TouchEvent) {
  touchStartX.value = event.changedTouches[0]?.clientX ?? 0;
}

function onRecordTouchEnd(event: TouchEvent) {
  const endX = event.changedTouches[0]?.clientX ?? 0;
  const delta = endX - touchStartX.value;
  if (Math.abs(delta) < 50) return;
  recordTab.value = delta < 0 ? 'reviewLogs' : 'invitations';
}

async function loadMoreRecords() {
  if (recordLoading.value || activeTab.value !== 'logs') return;
  if (recordTab.value === 'invitations') {
    if (invitations.value.length >= inviteTotal.value) return;
    recordLoading.value = true;
    try {
      inviteQuery.page += 1;
      await loadInvitations(true);
    } finally {
      recordLoading.value = false;
    }
    return;
  }
  if (logs.value.length >= logTotal.value) return;
  recordLoading.value = true;
  try {
    logQuery.page += 1;
    await loadReviewLogs(true);
  } finally {
    recordLoading.value = false;
  }
}

function onContentScroll() {
  const threshold = 80;
  const container = scrollContainer.value;
  if (!container) return;
  if (container === window) {
    if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - threshold) return;
    loadMoreRecords();
    return;
  }
  const element = container as HTMLElement;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - threshold) {
    loadMoreRecords();
  }
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

function fmt(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

watch(
  () => form.countryCode,
  (value, oldValue) => {
    if (!oldValue) return;
    documents.value = buildRequiredDocs(value, documents.value);
  },
);

onMounted(() => {
  load();
  scrollContainer.value = document.querySelector('.mobile-content') as HTMLElement | null;
  const target = scrollContainer.value ?? window;
  scrollContainer.value = target;
  target.addEventListener('scroll', onContentScroll, { passive: true });
});

onUnmounted(() => {
  const target = scrollContainer.value ?? window;
  target.removeEventListener('scroll', onContentScroll);
});
</script>

<style scoped>
.mobile-profile {
  min-height: 100%;
  padding: 12px 12px 96px;
  background: #f2f2f7;
}
.status-card {
  display: grid;
  gap: 8px;
  padding: 18px;
  margin-bottom: 14px;
  border-radius: 18px;
  background: #0f172a;
  color: #fff;
}
.status-card .eyebrow {
  color: rgba(255, 255, 255, .68);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .08em;
}
.status-card strong {
  font-size: 26px;
  line-height: 1.2;
}
.status-card p {
  margin: 0;
  color: rgba(255, 255, 255, .78);
  font-size: 14px;
  line-height: 1.55;
}
.status-action {
  min-height: 42px;
  margin-top: 4px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}
.segmented-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 3px;
  margin: 0 0 12px;
  border-radius: 12px;
  background: #e5e5ea;
}
.segmented-tabs button {
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  font-weight: 650;
}
.segmented-tabs button.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 4px;
}
.section-head span {
  color: #111827;
  font-size: 16px;
  font-weight: 700;
}
.section-head button {
  border: 0;
  background: transparent;
  color: #007aff;
  font-size: 15px;
  font-weight: 650;
}
.primary-action {
  width: 100%;
  height: 48px;
  margin-top: 12px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 650;
}
.secondary-action {
  width: 100%;
  height: 44px;
  margin-top: 10px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-size: 15px;
  font-weight: 650;
}
.profile-view {
  display: grid;
  gap: 12px;
}
.profile-card {
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
}
.profile-card div {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 14px;
  border-bottom: 1px solid #e5e5ea;
}
.profile-card div:last-child {
  border-bottom: 0;
}
.profile-card span {
  color: #6b7280;
  font-size: 14px;
}
.profile-card strong {
  min-width: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}
.form-sheet {
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
.field-card :deep(.el-input__wrapper) {
  min-height: 42px;
  padding: 0;
  box-shadow: none;
  background: transparent;
}
.field-card :deep(.el-input__inner) {
  color: #111827;
  font-size: 16px;
}
.join-card {
  display: grid;
  gap: 9px;
  padding: 14px;
  margin: 14px 0;
  border-radius: 16px;
  background: #fff;
}
.join-card.top-card {
  margin-top: 0;
}
.join-card strong {
  color: #111827;
  font-size: 16px;
}
.join-card span {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
}
.join-card input {
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 15px;
}
.join-card button {
  min-height: 42px;
  border: 0;
  border-radius: 12px;
  background: #007aff;
  color: #fff;
  font-size: 15px;
  font-weight: 650;
}
.join-preview {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f0f9ff;
}
.join-preview strong {
  color: #0f172a;
  font-size: 14px;
}
.join-preview span {
  color: #0369a1;
  font-size: 12px;
}
.join-error {
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff1f2;
  color: #e11d48;
  font-size: 13px;
  line-height: 1.45;
}
.invite-list {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}
.invite-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5e5ea;
}
.invite-item div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.invite-item strong {
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.invite-item span,
.invite-empty {
  color: #8e8e93;
  font-size: 12px;
}
.join-card .revoke-button {
  width: auto;
  min-height: 32px;
  padding: 0 10px;
  background: #fff1f2;
  color: #e11d48;
  white-space: nowrap;
}
.upload-button,
.preview-button {
  width: 100%;
  min-height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  font-size: 15px;
  font-weight: 600;
}
.preview-button {
  margin-top: 2px;
}
.doc-list {
  display: grid;
  gap: 10px;
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
.doc-view-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 0;
  border-radius: 16px;
  background: #fff;
  text-align: left;
}
.doc-view-item span {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.doc-view-item strong {
  color: #111827;
}
.doc-view-item small {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-view-item em {
  color: #007aff;
  font-style: normal;
  white-space: nowrap;
}
.doc-view-item.missing em {
  color: #ef4444;
}
.log-list {
  display: grid;
  gap: 10px;
}
.record-switch {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: #e5e5ea;
}
.record-switch button {
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  font-weight: 650;
}
.record-switch button.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.log-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  background: #fff;
}
.log-item div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.log-item strong {
  color: #111827;
  font-size: 15px;
}
.log-item small {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.log-item time {
  color: #8e8e93;
  font-size: 12px;
  white-space: nowrap;
}
.invite-record {
  align-items: center;
}
.invite-record strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow-wrap: anywhere;
}
.mobile-row-actions {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}
.mobile-row-actions button,
.pager button {
  min-height: 32px;
  border: 0;
  border-radius: 10px;
  background: #eef6ff;
  color: #007aff;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 650;
}
.mobile-row-actions button {
  width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.mobile-row-actions svg {
  width: 16px;
  height: 16px;
}
.mobile-row-actions button.danger {
  background: #fff1f2;
  color: #e11d48;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 2px;
}
.pager span {
  color: #6b7280;
  font-size: 13px;
}
.pager button:disabled {
  opacity: .45;
}
.load-more {
  padding: 10px 0 2px;
  color: #8e8e93;
  font-size: 13px;
  text-align: center;
}
.empty-card {
  padding: 24px 14px;
  border-radius: 16px;
  background: #fff;
  color: #8e8e93;
  font-size: 14px;
  text-align: center;
}
.action-empty {
  display: grid;
  gap: 8px;
  justify-items: stretch;
  text-align: left;
}
.action-empty strong {
  color: #111827;
  font-size: 16px;
}
.action-empty span {
  color: #6b7280;
  line-height: 1.5;
}
.action-empty button {
  min-height: 44px;
  margin-top: 4px;
  border: 0;
  border-radius: 12px;
  background: #007aff;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
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
