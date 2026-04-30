<!--
文件：frontend/src/views/supplier/SupplierReviewDetailView.vue
功能：公司审核详情页，查看供应商资料、审核记录并执行通过/驳回/补件/冻结操作。
交互：调用 supplier.controller.ts 的 review-detail/approve/reject/request-supplement/suspend/resume 接口。
作者：吴川
-->
<template>
  <div class="review-page" v-loading="loading">
    <div class="page-header" v-if="detail">
      <div>
        <el-button text @click="router.push(backPath)">{{ t('supplierReviewDetail.backList') }}</el-button>
        <h2>{{ detail.supplier.legalName || t('supplierReviewDetail.noLegalName') }}</h2>
        <p class="meta">
          <el-tag>{{ detail.supplier.businessId }}</el-tag>
          <el-tag :type="reviewTag(detail.supplier.reviewStatus)">{{ reviewStatusLabel(detail.supplier.reviewStatus) }}</el-tag>
          <el-tag :type="statusTag(detail.supplier.status)">{{ supplierStatusLabel(detail.supplier.status) }}</el-tag>
        </p>
      </div>
      <div class="actions" v-if="auth.hasScope('supplier:edit')">
        <el-button
          v-for="action in supplierActions"
          :key="action.key"
          :type="action.tone"
          @click="runAction(action.key)"
        >{{ t(`supplierAction.${action.key}`) }}</el-button>
      </div>
    </div>

    <el-row :gutter="20" v-if="detail">
      <el-col :lg="14" :span="24">
        <el-card>
          <h3>{{ t('supplierReviewDetail.basicInfo') }}</h3>
          <div class="kv"><span>{{ t('supplier.legal_name') }}</span><strong>{{ detail.supplier.legalName || '—' }}</strong></div>
          <div class="kv"><span>{{ t('supplier.short_name') }}</span><strong>{{ detail.supplier.shortName || '—' }}</strong></div>
          <div class="kv"><span>{{ t('common.contact_name') }}</span><strong>{{ detail.supplier.contactName || '—' }}</strong></div>
          <div class="kv"><span>{{ t('common.contact_email') }}</span><strong>{{ detail.supplier.contactEmail || '—' }}</strong></div>
          <div class="kv"><span>{{ t('common.contact_phone') }}</span><strong>{{ detail.supplier.contactPhone || '—' }}</strong></div>
          <div class="kv"><span>{{ t('common.tax_id') }}</span><strong>{{ detail.supplier.taxId || '—' }}</strong></div>
          <el-divider />
          <h3>{{ t('supplierReviewDetail.submittedDocs') }}</h3>
          <div v-if="!detail.documents?.length" class="empty">{{ t('supplierReviewDetail.noDocs') }}</div>
          <div v-for="doc in detail.documents || []" :key="doc.id" class="doc-item">
            <div class="doc-head">
              <strong>{{ docLabel(doc) }}</strong>
              <span>{{ doc.docType }}</span>
            </div>
            <p v-if="doc.textValue">{{ doc.textValue }}</p>
            <div v-if="doc.fileUrl" class="doc-actions">
              <span>{{ doc.fileName || doc.fileUrl }}</span>
              <el-button size="small" @click="previewDoc(doc)">{{ t('supplierReviewDetail.preview') }}</el-button>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :lg="10" :span="24">
        <el-card>
          <el-tabs v-model="sideTab">
            <el-tab-pane :label="t('supplierReviewDetail.memberInvitations')" name="invitations">
              <el-button v-if="auth.hasScope('supplier:edit')" class="full-action" type="primary" @click="createInvitation">{{ t('supplierReviewDetail.createInvitation') }}</el-button>
              <div v-if="invitations.length === 0" class="empty">{{ t('supplierReviewDetail.noInvitations') }}</div>
              <div v-for="item in invitations" :key="item.id" class="invite-item">
                <div>
                  <strong>{{ item.token }}</strong>
                  <span>{{ invitationMetaText(item) }}</span>
                  <span v-if="item.acceptedBy">{{ t('supplierReviewDetail.usedBy', { name: item.acceptedBy.displayName || t('userList.namePlaceholder') }) }} · {{ item.acceptedBy.email }}</span>
                </div>
                <div class="row-actions">
                  <el-button v-if="item.status === 'pending'" text @click="copyInvitation(item.token)">{{ t('supplierReviewDetail.copy') }}</el-button>
                  <el-button v-if="item.status === 'pending' && auth.hasScope('supplier:edit')" text type="danger" @click="revokeInvitation(item)">{{ t('supplierReviewDetail.revoke') }}</el-button>
                </div>
              </div>
              <el-pagination
                v-if="inviteTotal > inviteQuery.limit"
                small
                layout="prev, pager, next"
                v-model:current-page="inviteQuery.page"
                :page-size="inviteQuery.limit"
                :total="inviteTotal"
                @current-change="loadInvitations"
              />
            </el-tab-pane>
            <el-tab-pane :label="t('supplierReviewDetail.reviewLogs')" name="reviewLogs">
              <div v-if="!detail.reviewLogs?.length" class="empty">{{ t('supplierReviewDetail.noRecords') }}</div>
              <div v-for="log in detail.reviewLogs || []" :key="log.id" class="log-item">
                <div class="log-top">
                  <strong>{{ logActionText(log.action) }}</strong>
                  <el-tag size="small" :type="reviewTag(log.reviewStatus)">{{ reviewStatusLabel(log.reviewStatus) || '—' }}</el-tag>
                </div>
                <div class="log-comment">{{ log.comment || t('supplierReviewDetail.noComment') }}</div>
                <div class="log-time">{{ fmt(log.createdAt) }}</div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="preview.visible" :title="preview.title" width="82vw">
      <iframe v-if="preview.kind === 'inline'" class="preview-frame" :src="preview.url" :title="t('supplierReviewDetail.docPreview')" />
      <div v-else class="preview-fallback">
        <p>{{ t('supplierReviewDetail.previewUnsupported') }}</p>
        <el-button type="primary" @click="openPreviewFile">{{ t('supplierReviewDetail.openFile') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';
import { getSupplierActions, type SupplierActionKey } from '../../shared/supplier-action-rules';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const loading = ref(false);
const detail = ref<any>(null);
const sideTab = ref('invitations');
const invitations = ref<any[]>([]);
const inviteTotal = ref(0);
const inviteQuery = ref({ page: 1, limit: 5 });
const backPath = computed(() => (route.path.startsWith('/m/') ? '/m/console/suppliers' : '/suppliers'));
const preview = ref({
  visible: false,
  title: '',
  url: '',
  kind: 'inline' as 'inline' | 'download',
});
const supplierActions = computed(() => (detail.value ? getSupplierActions(detail.value.supplier) : []));
function reviewStatusLabel(status?: string) { return status ? t(`supplierReview.${status}`) : ''; }
function supplierStatusLabel(status?: string) { return status ? t(`supplier.status.${status}`) : ''; }
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
function statusTag(status?: string) {
  return {
    active: 'success',
    suspended: 'warning',
    blacklisted: 'danger',
    pending: 'info',
  }[status || 'active'] ?? 'info';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(`/api/suppliers/${route.params.id}/review-detail`);
    detail.value = res.data.data;
    await loadInvitations();
  } finally {
    loading.value = false;
  }
}

async function loadInvitations(page?: number) {
  if (page) inviteQuery.value.page = page;
  const res = await api.get(`/api/suppliers/${route.params.id}/invitations`, { params: inviteQuery.value });
  invitations.value = res.data.data?.items ?? [];
  inviteTotal.value = res.data.data?.total ?? 0;
}

async function createInvitation() {
  const res = await api.post(`/api/suppliers/${route.params.id}/invitations`, {});
  try {
    await ElMessageBox.confirm(res.data.data.token, t('supplierReviewDetail.memberInvitationCode'), {
      confirmButtonText: t('supplierReviewDetail.copyInvitation'),
      cancelButtonText: t('common.close'),
    });
    await copyInvitation(res.data.data.token);
  } catch {
    // 用户关闭弹窗，不需要额外处理。
  }
  inviteQuery.value.page = 1;
  await loadInvitations();
}

async function copyInvitation(token: string) {
  await navigator.clipboard.writeText(token);
  ElMessage.success(t('supplierReviewDetail.invitationCopied'));
}

async function revokeInvitation(item: any) {
  await ElMessageBox.confirm(t('supplierReviewDetail.revokeConfirm'), t('supplierReviewDetail.revokeInvitation'), {
    type: 'warning',
    confirmButtonText: t('supplierReviewDetail.confirmRevoke'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/suppliers/${route.params.id}/invitations/${item.id}/revoke`);
  ElMessage.success(t('supplierReviewDetail.invitationRevoked'));
  await loadInvitations();
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

async function withComment(title: string, apiPath: string) {
  const { value } = await ElMessageBox.prompt(t('supplierReviewDetail.commentPrompt'), title, { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') });
  await api.post(`/api/suppliers/${route.params.id}/${apiPath}`, { comment: value });
  ElMessage.success(t('supplierReviewDetail.operationSuccess'));
  await load();
}

async function doApprove() { await withComment(t('supplierAction.approve'), 'approve'); }
async function doSupplement() { await withComment(t('supplierAction.supplement'), 'request-supplement'); }
async function doReject() { await withComment(t('supplierReviewDetail.rejectApplication'), 'reject'); }
async function doSuspend() {
  const { value } = await ElMessageBox.prompt(t('supplierList.suspendReasonPrompt'), t('supplierList.suspendSupplier'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') });
  await api.post(`/api/suppliers/${route.params.id}/suspend`, { reason: value });
  ElMessage.success(t('supplierList.suspended'));
  await load();
}
async function doResume() {
  await api.post(`/api/suppliers/${route.params.id}/resume`);
  ElMessage.success(t('supplierList.resumed'));
  await load();
}

async function runAction(action: SupplierActionKey) {
  const handlers = {
    approve: doApprove,
    supplement: doSupplement,
    reject: doReject,
    suspend: doSuspend,
    resume: doResume,
  };
  await handlers[action]();
}

function previewDoc(doc: any) {
  preview.value = {
    visible: true,
    title: doc.fileName || docLabel(doc) || t('supplierReviewDetail.docPreview'),
    url: doc.fileUrl,
    kind: doc.mimeType?.startsWith('image/') || doc.mimeType === 'application/pdf' ? 'inline' : 'download',
  };
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

function openPreviewFile() {
  if (preview.value.url) window.open(preview.value.url, '_blank');
}

onMounted(load);
</script>

<style scoped>
.review-page { display: grid; gap: 18px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.page-header h2 { margin: 8px 0; }
.meta { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.kv { display: flex; justify-content: space-between; gap: 18px; padding: 10px 0; border-bottom: 1px solid #f0f2f5; }
.doc-item, .log-item, .invite-item { padding: 12px 0; border-bottom: 1px solid #f0f2f5; }
.doc-head, .log-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 6px; }
.doc-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #606266; }
.invite-item { display: flex; justify-content: space-between; gap: 12px; }
.invite-item > div:first-child { min-width: 0; display: grid; gap: 4px; }
.invite-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.invite-item span { color: #606266; font-size: 12px; }
.row-actions { display: flex; align-items: flex-start; gap: 4px; flex-shrink: 0; }
.full-action { width: 100%; margin-bottom: 8px; }
.doc-actions span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-frame { width: 100%; height: 72vh; border: 0; }
.preview-fallback { display: grid; justify-items: center; gap: 16px; padding: 48px 0; color: #606266; }
.doc-item p, .log-comment { margin: 0 0 6px; color: #606266; line-height: 1.7; }
.log-time { color: #909399; font-size: 12px; }
.empty { color: #909399; padding: 10px 0; }
@media (pointer: coarse) {
  .review-page { gap: 12px; }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .page-header h2 {
    font-size: 22px;
    line-height: 1.25;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .actions :deep(.el-button) {
    min-height: 42px;
    margin-left: 0;
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
  .kv {
    flex-direction: column;
    gap: 5px;
  }
  .doc-head,
  .log-top {
    align-items: flex-start;
  }
}
</style>
