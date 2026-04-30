<!--
文件：frontend/src/mobile/console/suppliers/MobileSupplierDetailView.vue
功能：移动端供应商审核详情页，展示资料、附件、审核记录并执行审核动作。
交互：调用 /api/suppliers/:id/review-detail 读取；调用审核、补件、驳回、冻结和恢复接口处理状态。
作者：吴川
-->
<template>
  <main class="supplier-detail" v-loading="loading">
    <template v-if="detail">
      <section class="profile">
        <span class="avatar">{{ supplierInitial(detail.supplier) }}</span>
        <h1>{{ detail.supplier.legalName || detail.supplier.shortName || '未提交名称' }}</h1>
        <p>{{ detail.supplier.businessId }}</p>
        <div class="chips">
          <span :class="['chip', statusTone(detail.supplier.status)]">{{ statusText(detail.supplier.status) }}</span>
          <span :class="['chip', reviewTone(detail.supplier.reviewStatus)]">{{ reviewText(detail.supplier.reviewStatus) }}</span>
        </div>
      </section>

      <section class="group">
        <div class="row"><span>简称</span><strong>{{ detail.supplier.shortName || '未设置' }}</strong></div>
        <div class="row"><span>联系人</span><strong>{{ detail.supplier.contactName || '未设置' }}</strong></div>
        <div class="row"><span>联系邮箱</span><strong>{{ detail.supplier.contactEmail || '未设置' }}</strong></div>
        <div class="row"><span>联系电话</span><strong>{{ detail.supplier.contactPhone || '未设置' }}</strong></div>
        <div class="row"><span>国家/地区</span><strong>{{ detail.supplier.countryCode || '未设置' }}</strong></div>
        <div class="row"><span>税号</span><strong>{{ detail.supplier.taxId || '未设置' }}</strong></div>
      </section>

      <section class="section">
        <h2>提交资料</h2>
        <div class="group">
          <a
            v-for="doc in detail.documents || []"
            :key="doc.id"
            class="doc-row"
            :href="doc.fileUrl || undefined"
            target="_blank"
            rel="noreferrer"
          >
            <span>
              <strong>{{ doc.docLabel || doc.docType }}</strong>
              <small>{{ doc.textValue || doc.fileName || doc.fileUrl || '无补充说明' }}</small>
            </span>
            <em v-if="doc.fileUrl" class="preview-link" @click.prevent="previewDoc(doc)">预览</em>
          </a>
          <div v-if="!detail.documents?.length" class="empty-row">暂无资料</div>
        </div>
      </section>

      <section class="section">
        <h2>成员邀请</h2>
        <div class="group">
          <button v-if="canEdit" class="invite-create" type="button" @click="createInvitation">生成邀请码</button>
          <div v-for="item in invitations" :key="item.id" class="invite-row">
            <span>
              <strong>{{ item.token }}</strong>
              <small>{{ invitationMetaText(item) }}</small>
              <small v-if="item.acceptedBy">使用人：{{ item.acceptedBy.displayName || '未设置姓名' }} · {{ item.acceptedBy.email }}</small>
            </span>
            <em v-if="item.status === 'pending'" @click="copyInvitation(item.token)">复制</em>
            <em v-if="item.status === 'pending' && canEdit" class="danger-link" @click="revokeInvitation(item)">作废</em>
          </div>
          <div v-if="!invitations.length" class="empty-row">暂无邀请码</div>
        </div>
      </section>

      <section class="section">
        <h2>审核记录</h2>
        <div class="group">
          <div v-for="log in detail.reviewLogs || []" :key="log.id" class="log-row">
            <strong>{{ log.action }}</strong>
            <small>{{ log.comment || '无备注' }}</small>
            <em>{{ fmt(log.createdAt) }}</em>
          </div>
          <div v-if="!detail.reviewLogs?.length" class="empty-row">暂无记录</div>
        </div>
      </section>

      <section v-if="canEdit" class="actions">
        <button
          v-for="item in supplierActions"
          :key="item.key"
          :class="{ primary: item.key === 'approve', danger: item.key === 'reject' }"
          type="button"
          @click="runAction(item.key)"
        >{{ item.label }}</button>
      </section>
    </template>

    <div v-if="actionOpen" class="sheet-mask" @click="closeAction">
      <section class="action-sheet" @click.stop>
        <h3>{{ actionTitle }}</h3>
        <textarea v-model.trim="comment" :placeholder="actionPlaceholder" />
        <button class="confirm" type="button" @click="submitAction">确认</button>
        <button class="cancel" type="button" @click="closeAction">取消</button>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute } from 'vue-router';
import { api } from '../../../composables/useApi';
import { useAuthStore } from '../../../stores/auth';
import { getSupplierActions, type SupplierActionKey } from '../../../shared/supplier-action-rules';
import {
  reviewText, reviewTone, statusText, statusTone, supplierInitial,
} from './supplier-options';

const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const detail = ref<any>(null);
const invitations = ref<any[]>([]);
const action = ref<'approve' | 'supplement' | 'reject' | 'suspend' | ''>('');
const comment = ref('');
const actionOpen = computed(() => Boolean(action.value));
const canEdit = computed(() => auth.hasScope('supplier:edit'));
const supplierActions = computed(() => (detail.value ? getSupplierActions(detail.value.supplier) : []));

const actionTitleMap: Record<'approve' | 'supplement' | 'reject' | 'suspend', string> = {
  approve: '审核通过',
  supplement: '要求补件',
  reject: '驳回申请',
  suspend: '冻结供应商',
};
const actionTitle = computed(() => (action.value ? actionTitleMap[action.value] : '处理'));

const actionPlaceholder = computed(() => (action.value === 'suspend' ? '请输入冻结原因' : '请输入备注说明'));

function fmt(value: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
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

async function loadInvitations() {
  const res = await api.get(`/api/suppliers/${route.params.id}/invitations`, { params: { page: 1, limit: 10 } });
  invitations.value = res.data.data?.items ?? [];
}

async function createInvitation() {
  const res = await api.post(`/api/suppliers/${route.params.id}/invitations`, {});
  try {
    await ElMessageBox.confirm(res.data.data.token, '成员邀请码', {
      confirmButtonText: '复制邀请码',
      cancelButtonText: '关闭',
    });
    await copyInvitation(res.data.data.token);
  } catch {
    // 用户关闭弹窗，不需要额外处理。
  }
  await loadInvitations();
}

async function copyInvitation(token: string) {
  await navigator.clipboard.writeText(token);
  ElMessage.success('邀请码已复制');
}

async function revokeInvitation(item: any) {
  await ElMessageBox.confirm('确认作废该邀请码？作废后对方无法再使用。', '作废邀请码', {
    confirmButtonText: '确认作废',
    cancelButtonText: '取消',
  });
  await api.post(`/api/suppliers/${route.params.id}/invitations/${item.id}/revoke`);
  ElMessage.success('邀请码已作废');
  await loadInvitations();
}

function invitationStatusText(status?: string) {
  return {
    pending: '待使用',
    accepted: '已使用',
    revoked: '已作废',
    expired: '已过期',
  }[status ?? ''] ?? status ?? '未知';
}

function invitationMetaText(item: any) {
  const status = invitationStatusText(item?.status);
  if (item?.status === 'pending') return `邀请码${status} · ${fmt(item.expiresAt)} 过期`;
  return `邀请码${status}`;
}

function openAction(type: 'approve' | 'supplement' | 'reject' | 'suspend') {
  action.value = type;
  comment.value = '';
}

function closeAction() {
  action.value = '';
  comment.value = '';
}

function runAction(type: SupplierActionKey) {
  if (type === 'resume') {
    doResume();
    return;
  }
  openAction(type);
}

async function submitAction() {
  const map = {
    approve: 'approve',
    supplement: 'request-supplement',
    reject: 'reject',
    suspend: 'suspend',
  };
  const apiPath = map[action.value as keyof typeof map];
  if (!apiPath) return;
  const body = action.value === 'suspend' ? { reason: comment.value } : { comment: comment.value };
  await api.post(`/api/suppliers/${route.params.id}/${apiPath}`, body);
  ElMessage.success('操作成功');
  closeAction();
  await load();
}

async function doResume() {
  await api.post(`/api/suppliers/${route.params.id}/resume`);
  ElMessage.success('已解冻');
  await load();
}

function previewDoc(doc: any) {
  if (doc.fileUrl) window.open(doc.fileUrl, '_blank');
}

onMounted(load);
</script>

<style scoped>
.supplier-detail {
  min-height: 100%;
  padding: 16px 12px 28px;
  background: #f2f2f7;
}
.profile {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 14px 0 20px;
}
.avatar {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eef7ed;
  color: #16833a;
  font-size: 28px;
  font-weight: 700;
}
h1 {
  margin: 4px 0 0;
  color: #111827;
  font-size: 22px;
  text-align: center;
}
p {
  margin: 0;
  color: #6b7280;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
}
.chip.ok {
  background: #e9f8ee;
  color: #16833a;
}
.chip.warn {
  background: #fff4df;
  color: #9a5a00;
}
.chip.danger {
  background: #ffecec;
  color: #c81e1e;
}
.chip.neutral {
  background: #fff;
  color: #6b7280;
}
.group {
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
}
.row:last-child,
.doc-row:last-child,
.log-row:last-child,
.invite-row:last-child {
  border-bottom: 0;
}
.row span {
  color: #6b7280;
}
.row strong {
  min-width: 0;
  color: #111827;
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}
.section {
  margin-top: 18px;
}
.section h2 {
  margin: 0 0 8px 16px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
}
.doc-row,
.log-row,
.invite-row {
  display: block;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
  color: inherit;
  text-decoration: none;
}
.doc-row strong,
.doc-row small,
.log-row strong,
.log-row small,
.log-row em,
.invite-row strong,
.invite-row small {
  display: block;
}
.doc-row strong,
.log-row strong,
.invite-row strong {
  color: #111827;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-row small,
.log-row small,
.log-row em,
.invite-row small {
  margin-top: 5px;
  color: #6b7280;
  font-size: 13px;
  font-style: normal;
  line-height: 1.45;
}
.preview-link {
  margin-top: 8px;
  color: #007aff;
  font-size: 13px;
  font-style: normal;
}
.invite-create {
  width: calc(100% - 24px);
  height: 42px;
  margin: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: #007aff;
  color: #fff;
  font-size: 15px;
  font-weight: 650;
}
.invite-row em {
  display: inline-block;
  margin-top: 8px;
  margin-right: 14px;
  color: #007aff;
  font-size: 13px;
  font-style: normal;
}
.invite-row .danger-link {
  color: #ff3b30;
}
.empty-row {
  padding: 16px;
  color: #6b7280;
  text-align: center;
}
.actions {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}
.actions button,
.confirm,
.cancel {
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  color: #007aff;
  font-size: 16px;
  font-weight: 600;
}
.actions .primary,
.confirm {
  background: #007aff;
  color: #fff;
}
.actions .danger {
  color: #ff3b30;
}
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  padding: 0 10px calc(env(safe-area-inset-bottom) + 10px);
  background: rgba(0, 0, 0, .28);
}
.action-sheet {
  width: 100%;
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: #f2f2f7;
}
.action-sheet h3 {
  margin: 2px 0 0;
  color: #111827;
  font-size: 17px;
  text-align: center;
}
textarea {
  width: 100%;
  min-height: 96px;
  box-sizing: border-box;
  padding: 12px;
  border: 0;
  border-radius: 14px;
  outline: none;
  background: #fff;
  color: #111827;
  font-size: 15px;
  resize: none;
}
</style>
