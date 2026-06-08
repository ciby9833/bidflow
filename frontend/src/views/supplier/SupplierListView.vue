<!--
文件：frontend/src/views/supplier/SupplierListView.vue
功能：供应商列表页，提供查看、挂起与恢复操作入口。
交互：调用 supplier.controller.ts 列表/挂起/恢复接口；依赖 stores/auth.ts 控制按钮权限。
作者：吴川
-->
<template>
  <div class="supplier-page">
    <div class="page-header">
      <div>
        <h2>{{ t('nav.suppliers') }}</h2>
      </div>
      <div class="header-actions">
        <el-button v-if="auth.hasScope('supplier:view')" :loading="exporting" @click="exportSuppliers">
          {{ t('supplierList.export') }}
        </el-button>
        <el-button v-if="auth.hasScope('supplier:create')" @click="downloadCreateTemplate">
          {{ t('supplierList.downloadImportTemplate') }}
        </el-button>
        <el-button
          v-if="auth.hasScope('supplier:create')"
          :loading="bulkImporting"
          @click="createImportFileInput?.click()"
        >
          {{ t('supplierList.bulkImport') }}
        </el-button>
        <input ref="createImportFileInput" hidden type="file" accept=".xlsx,.xls" @change="bulkCreateSuppliers" />
        <el-button v-if="auth.hasScope('supplier:create')" @click="downloadAccountTemplate">
          {{ t('supplierList.downloadAccountTemplate') }}
        </el-button>
        <el-button
          v-if="auth.hasScope('supplier:create')"
          :loading="accountImporting"
          @click="accountImportFileInput?.click()"
        >
          {{ t('supplierList.accountBulkImport') }}
        </el-button>
        <input ref="accountImportFileInput" hidden type="file" accept=".xlsx,.xls" @change="bulkImportAccounts" />
        <el-button v-if="auth.hasScope('supplier:create')" type="primary" @click="router.push('/suppliers/new')">{{ t('route.supplierCreate') }}</el-button>
      </div>
    </div>

    <!-- 批量新增结果 -->
    <el-dialog v-model="bulkResultVisible" :title="t('supplierList.bulkResultTitle')" width="580px">
      <div v-if="bulkResult" class="bulk-result">
        <div class="bulk-stat">
          <span class="bulk-stat-ok">{{ t('supplierList.bulkCreated', { count: bulkResult.created.length }) }}</span>
          <span v-if="bulkResult.errors.length" class="bulk-stat-fail">
            {{ t('supplierList.bulkFailed', { count: bulkResult.errors.length }) }}
          </span>
        </div>
        <el-table
          v-if="bulkResult.errors.length"
          :data="bulkResult.errors"
          border
          size="small"
          max-height="320"
        >
          <el-table-column :label="t('tenderCreate.importRow')" width="70">
            <template #default="{ row }">{{ row.row }}</template>
          </el-table-column>
          <el-table-column :label="t('supplier.legal_name')" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.value || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('tenderCreate.importReason')" show-overflow-tooltip>
            <template #default="{ row }">{{ row.reason }}</template>
          </el-table-column>
        </el-table>
        <p v-else class="bulk-all-ok">{{ t('supplierList.bulkAllOk') }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="bulkResultVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 账号批量导入结果 -->
    <el-dialog v-model="accountResultVisible" :title="t('supplierList.accountResultTitle')" width="640px">
      <div v-if="accountResult" class="bulk-result">
        <div class="bulk-stat">
          <span class="bulk-stat-ok">{{ t('supplierList.accountCreated', { count: accountResult.created.length }) }}</span>
          <span v-if="accountResult.errors.length" class="bulk-stat-fail">
            {{ t('supplierList.bulkFailed', { count: accountResult.errors.length }) }}
          </span>
        </div>
        <el-table
          v-if="accountResult.errors.length"
          :data="accountResult.errors"
          border
          size="small"
          max-height="320"
        >
          <el-table-column :label="t('tenderCreate.importRow')" width="70">
            <template #default="{ row }">{{ row.row }}</template>
          </el-table-column>
          <el-table-column :label="t('supplierList.accountIdentifier')" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.value || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('tenderCreate.importReason')" show-overflow-tooltip>
            <template #default="{ row }">{{ row.reason }}</template>
          </el-table-column>
        </el-table>
        <p v-else class="bulk-all-ok">{{ t('supplierList.accountAllOk') }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="accountResultVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <section class="filter-panel">
      <div class="filter-main">
        <el-input
          v-model="filters.search"
          clearable
          size="large"
          :placeholder="t('supplierList.searchPlaceholder')"
        />
        <el-button v-if="hasActiveFilters" size="large" @click="resetFilters">{{ t('common.reset') }}</el-button>
      </div>
      <div class="filter-chips" :aria-label="t('supplierList.supplierFilters')">
        <button
          v-for="item in statusOptions"
          :key="item.value || 'all-status'"
          :class="{ active: filters.status === item.value }"
          type="button"
          @click="setStatus(item.value)"
        >{{ item.label }}</button>
      </div>
      <div class="filter-chips" :aria-label="t('supplierList.reviewFilters')">
        <button
          v-for="item in reviewOptions"
          :key="item.value || 'all-review'"
          :class="{ active: filters.reviewStatus === item.value }"
          type="button"
          @click="setReviewStatus(item.value)"
        >{{ item.label }}</button>
      </div>
    </section>
    <el-table class="desktop-table" :data="suppliers" v-loading="loading" stripe>
      <el-table-column prop="businessId" :label="t('supplierList.supplierNo')" width="140" />
      <el-table-column prop="legalName" :label="t('supplier.legal_name')" min-width="200">
        <template #default="{ row }">{{ row.legalName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="shortName" :label="t('supplier.short_name')" width="140">
        <template #default="{ row }">{{ row.shortName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="sTag(row.status)">{{ t(`supplier.status.${row.status}`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reviewStatus" :label="t('supplierList.reviewStatus')" width="120">
        <template #default="{ row }">
          <el-tag :type="reviewTag(row.reviewStatus)">{{ reviewText(row.reviewStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="countryCode" :label="t('common.country')" width="80" />
      <el-table-column :label="t('common.actions')" min-width="280">
        <template #default="{ row }">
          <el-button size="small" @click="router.push(`/suppliers/${row.id}/review`)">{{ t('common.details') }}</el-button>
          <el-button size="small" v-if="auth.hasScope('supplier:edit')" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
          <template v-if="auth.hasScope('supplier:edit')">
            <el-button
              v-for="action in supplierActions(row)"
              :key="action.key"
              size="small"
              :type="action.tone"
              @click="runAction(row, action.key)"
            >{{ t(`supplierAction.${action.key}`) }}</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      class="pager"
      background
      layout="total, prev, pager, next"
      :total="total"
      :page-size="filters.limit"
      v-model:current-page="filters.page"
      @current-change="load"
    />

    <section class="mobile-cards" v-loading="loading">
      <button
        v-for="row in suppliers"
        :key="row.id"
        class="mobile-card"
        type="button"
        @click="router.push(`/suppliers/${row.id}/review`)"
      >
        <div class="card-main">
          <span class="avatar">{{ supplierInitial(row) }}</span>
          <div>
            <strong>{{ row.legalName || row.shortName || row.businessId }}</strong>
            <span>{{ row.businessId }} · {{ row.countryCode || '—' }}</span>
          </div>
        </div>
        <div class="card-meta">
          <span class="chip" :class="statusChip(row.status)">{{ t(`supplier.status.${row.status}`) }}</span>
          <span class="chip" :class="reviewChip(row.reviewStatus)">{{ reviewText(row.reviewStatus) }}</span>
        </div>
      </button>
      <div v-if="!loading && suppliers.length === 0" class="mobile-empty">{{ t('supplierList.noSuppliers') }}</div>
    </section>

    <el-dialog v-model="editVisible" :title="t('supplierList.editSupplier')" width="560px">
      <el-form label-width="96px">
        <el-form-item :label="t('supplier.legal_name')"><el-input v-model="editForm.legalName" /></el-form-item>
        <el-form-item :label="t('supplier.short_name')"><el-input v-model="editForm.shortName" /></el-form-item>
        <el-form-item :label="t('common.country')"><el-input v-model="editForm.countryCode" maxlength="2" /></el-form-item>
        <el-form-item :label="t('common.contact_name')"><el-input v-model="editForm.contactName" /></el-form-item>
        <el-form-item :label="t('common.contact_email')"><el-input v-model="editForm.contactEmail" /></el-form-item>
        <el-form-item :label="t('common.contact_phone')"><el-input v-model="editForm.contactPhone" /></el-form-item>
        <el-form-item :label="t('common.tax_id')"><el-input v-model="editForm.taxId" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';
import { getSupplierActions, type SupplierActionKey } from '../../shared/supplier-action-rules';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const suppliers = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const exporting = ref(false);
const bulkImporting = ref(false);
const bulkResultVisible = ref(false);
const bulkResult = ref<{ created: any[]; errors: Array<{ row: number; value: string; reason: string }>; total: number } | null>(null);
const createImportFileInput = ref<HTMLInputElement | null>(null);
const accountImporting = ref(false);
const accountResultVisible = ref(false);
const accountResult = ref<{ created: any[]; errors: Array<{ row: number; value: string; reason: string }>; total: number } | null>(null);
const accountImportFileInput = ref<HTMLInputElement | null>(null);
const total = ref(0);
const editVisible = ref(false);
const editingId = ref('');
const filters = reactive({ search: '', status: '', reviewStatus: '', page: 1, limit: 20 });
const statusOptions = computed(() => [
  { label: t('supplierList.allStatuses'), value: '' },
  { label: t('supplier.status.active'), value: 'active' },
  { label: t('supplier.status.suspended'), value: 'suspended' },
]);
const reviewOptions = computed(() => [
  { label: t('supplierList.allReviews'), value: '' },
  { label: t('supplierReview.not_submitted'), value: 'not_submitted' },
  { label: t('supplierReview.pending_review'), value: 'pending_review' },
  { label: t('supplierReview.supplement_required'), value: 'supplement_required' },
  { label: t('supplierReview.approved'), value: 'approved' },
  { label: t('supplierReview.rejected'), value: 'rejected' },
]);
const hasActiveFilters = computed(() => Boolean(filters.search || filters.status || filters.reviewStatus));
let searchTimer: number | undefined;
const editForm = reactive({
  legalName: '',
  shortName: '',
  countryCode: 'CN',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  taxId: '',
});

function sTag(s: string) {
  return { active: 'success', suspended: 'warning' }[s] ?? 'info';
}
function reviewTag(s: string) {
  return { not_submitted: 'info', pending_review: 'warning', supplement_required: 'info', approved: 'success', rejected: 'danger' }[s] ?? 'info';
}

function reviewText(status?: string) {
  return {
    not_submitted: t('supplierReview.not_submitted'),
    pending_review: t('supplierReview.pending_review'),
    supplement_required: t('supplierReview.supplement_required'),
    approved: t('supplierReview.approved'),
    rejected: t('supplierReview.rejected'),
  }[status || 'not_submitted'] ?? status ?? t('supplierReview.not_submitted');
}

function statusChip(status?: string) {
  return status === 'active' ? 'ok' : status === 'suspended' ? 'warn' : 'neutral';
}

function reviewChip(status?: string) {
  return status === 'approved' ? 'ok' : status === 'pending_review' ? 'warn' : status === 'rejected' ? 'danger' : 'neutral';
}

function supplierInitial(row: any) {
  return String(row.legalName || row.shortName || row.businessId || '?').slice(0, 1).toUpperCase();
}

function supplierActions(row: any) {
  return getSupplierActions(row);
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/api/suppliers', {
      params: {
        search: filters.search || undefined,
        status: filters.status || undefined,
        reviewStatus: filters.reviewStatus || undefined,
        page: filters.page,
        limit: filters.limit,
      },
    });
    suppliers.value = res.data.data ?? [];
    total.value = Number(res.data.meta?.total ?? suppliers.value.length);
  }
  finally { loading.value = false; }
}

async function exportSuppliers() {
  exporting.value = true;
  try {
    const res = await api.get('/api/suppliers/export', {
      params: {
        search: filters.search || undefined,
        status: filters.status || undefined,
        reviewStatus: filters.reviewStatus || undefined,
      },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('supplierList.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

async function downloadCreateTemplate() {
  const res = await api.get('/api/suppliers/import-template', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'supplier-import-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadAccountTemplate() {
  const res = await api.get('/api/suppliers/accounts/import-template', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'supplier-account-import-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

async function bulkImportAccounts(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  accountImporting.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/suppliers/accounts/import', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    accountResult.value = res.data.data;
    accountResultVisible.value = true;
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('supplierList.bulkImportFailed'));
  } finally {
    accountImporting.value = false;
    input.value = '';
  }
}

async function bulkCreateSuppliers(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  bulkImporting.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/suppliers/import', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    bulkResult.value = res.data.data;
    bulkResultVisible.value = true;
    if (bulkResult.value && bulkResult.value.created.length) {
      reload();
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('supplierList.bulkImportFailed'));
  } finally {
    bulkImporting.value = false;
    input.value = '';
  }
}

function reload() {
  filters.page = 1;
  load();
}

function scheduleReload(delay = 300) {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => reload(), delay);
}

function setStatus(value: string) {
  filters.status = value;
}

function setReviewStatus(value: string) {
  filters.reviewStatus = value;
}

function resetFilters() {
  filters.search = '';
  filters.status = '';
  filters.reviewStatus = '';
}

function openEdit(row: any) {
  editingId.value = row.id;
  editForm.legalName = row.legalName || '';
  editForm.shortName = row.shortName || '';
  editForm.countryCode = row.countryCode || 'CN';
  editForm.contactName = row.contactName || '';
  editForm.contactEmail = row.contactEmail || '';
  editForm.contactPhone = row.contactPhone || '';
  editForm.taxId = row.taxId || '';
  editVisible.value = true;
}

async function saveEdit() {
  saving.value = true;
  try {
    await api.patch(`/api/suppliers/${editingId.value}`, { ...editForm });
    ElMessage.success(t('supplierList.updated'));
    editVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function doSuspend(row: any) {
  const { value: reason } = await ElMessageBox.prompt(t('supplierList.suspendReasonPrompt'), t('supplierList.suspendSupplier'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') });
  await api.post(`/api/suppliers/${row.id}/suspend`, { reason });
  ElMessage.success(t('supplierList.suspended')); load();
}

async function doResume(row: any) {
  await api.post(`/api/suppliers/${row.id}/resume`);
  ElMessage.success(t('supplierList.resumed')); load();
}

async function runAction(row: any, action: SupplierActionKey) {
  const handlers = {
    approve: doApprove,
    supplement: doSupplement,
    reject: doReject,
    suspend: doSuspend,
    resume: doResume,
  };
  await handlers[action](row);
}

async function doApprove(row: any) {
  await api.post(`/api/suppliers/${row.id}/approve`, {});
  ElMessage.success(t('supplierList.approved'));
  load();
}

async function doReject(row: any) {
  const { value: comment } = await ElMessageBox.prompt(t('supplierList.rejectReasonPrompt'), t('supplierList.rejectSupplier'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') });
  await api.post(`/api/suppliers/${row.id}/reject`, { comment });
  ElMessage.success(t('supplierList.rejected'));
  load();
}

async function doSupplement(row: any) {
  const { value: comment } = await ElMessageBox.prompt(t('supplierList.supplementPrompt'), t('supplierAction.supplement'), { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') });
  await api.post(`/api/suppliers/${row.id}/request-supplement`, { comment });
  ElMessage.success(t('supplierList.supplementRequested'));
  load();
}

watch(
  () => filters.search,
  () => scheduleReload(),
);

watch(
  () => [filters.status, filters.reviewStatus],
  () => scheduleReload(0),
);

onMounted(load);
onBeforeUnmount(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
});
</script>

<style scoped>
.supplier-page { display: block; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; color: #0f172a; font-size: 24px; letter-spacing: -.02em; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bulk-result { display: flex; flex-direction: column; gap: 12px; }
.bulk-stat { display: flex; gap: 16px; font-size: 14px; }
.bulk-stat-ok { color: #15803d; font-weight: 600; }
.bulk-stat-fail { color: #b91c1c; font-weight: 600; }
.bulk-all-ok { color: #15803d; margin: 0; font-size: 13px; }
.filter-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  margin-bottom: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  box-shadow: 0 12px 30px rgba(15, 23, 42, .05);
}
.filter-main {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-chips button {
  min-height: 34px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  padding: 0 14px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
}
.filter-chips button:hover,
.filter-chips button:focus-visible {
  border-color: #93c5fd;
  color: #0369a1;
  outline: none;
}
.filter-chips button.active {
  border-color: #0369a1;
  background: #0369a1;
  color: #fff;
  box-shadow: 0 8px 18px rgba(3, 105, 161, .20);
}
.pager { justify-content: flex-end; margin-top: 14px; }
.mobile-toolbar { display: none; }
.mobile-cards { display: none; }

@media (pointer: coarse) {
  .supplier-page {
    min-height: 100%;
    margin: 0 -16px;
    padding: 0 16px 18px;
    background: #f2f2f7;
  }
  .page-header {
    display: none;
  }
  .filter-panel {
    display: none;
  }
  .mobile-toolbar {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 2px 0 10px;
  }
  .mobile-toolbar button {
    min-width: 64px;
    height: 34px;
    border: 0;
    border-radius: 999px;
    background: #007aff;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
  }
  .desktop-table { display: none; }
  .mobile-cards {
    display: grid;
    overflow: hidden;
    gap: 0;
    border-radius: 16px;
    background: #fff;
  }
  .mobile-card {
    position: relative;
    width: 100%;
    padding: 12px 34px 12px 12px;
    border: 0;
    border-bottom: 1px solid #e5e5ea;
    background: #fff;
    text-align: left;
  }
  .mobile-card::after {
    position: absolute;
    top: 50%;
    right: 14px;
    width: 8px;
    height: 8px;
    border-top: 2px solid #c7c7cc;
    border-right: 2px solid #c7c7cc;
    content: '';
    transform: translateY(-50%) rotate(45deg);
  }
  .mobile-card:last-of-type {
    border-bottom: 0;
  }
  .card-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .avatar {
    width: 40px;
    height: 40px;
    display: inline-flex;
    flex: 0 0 40px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #eef7ed;
    color: #16833a;
    font-weight: 700;
  }
  .card-main strong,
  .card-main span:not(.avatar) {
    display: block;
  }
  .card-main strong {
    color: #111827;
    font-size: 16px;
  }
  .card-main span:not(.avatar) {
    margin-top: 5px;
    color: #6b7280;
    font-size: 13px;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0 0 52px;
  }
  .chip {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1.4;
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
    background: #f2f2f7;
    color: #6b7280;
  }
  .mobile-empty {
    padding: 40px 0;
    color: #6b7280;
    text-align: center;
  }
}
</style>
