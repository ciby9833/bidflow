<!--
文件：frontend/src/views/user/CompanyUserListView.vue
功能：WEB 端公司内部用户管理页，支持查看、新增、编辑角色和启停公司账号。
交互：调用 backend company-user.controller.ts 的 /api/company-users 接口；依赖 stores/auth.ts 控制按钮权限。
作者：吴川
-->
<template>
  <div class="user-page">
    <div class="page-header">
      <div>
        <h2>{{ t('route.users') }}</h2>
        <p>{{ t('userList.description') }}</p>
      </div>
      <el-button v-if="auth.hasScope('user:create')" type="primary" @click="openCreate">{{ t('route.userCreate') }}</el-button>
    </div>
    <div v-if="auth.hasScope('user:create')" class="mobile-toolbar">
      <button type="button" @click="openCreate">{{ t('common.add') }}</button>
    </div>

    <el-table class="desktop-table" :data="users" v-loading="loading" stripe>
      <el-table-column prop="fullName" :label="t('userList.name')" min-width="140">
        <template #default="{ row }">{{ row.fullName || row.displayName }}</template>
      </el-table-column>
      <el-table-column prop="email" :label="t('userList.accountEmail')" min-width="220" />
      <el-table-column prop="employeeId" :label="t('userList.employeeId')" width="140">
        <template #default="{ row }">{{ row.employeeId || '—' }}</template>
      </el-table-column>
      <el-table-column prop="role" :label="t('userList.role')" width="170">
        <template #default="{ row }">{{ roleText(row.role) }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'warning'">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="t('common.createdAt')" width="180">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column v-if="auth.hasScope('user:edit')" :label="t('common.actions')" width="120" align="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <section class="mobile-cards" v-loading="loading">
      <button
        v-for="row in users"
        :key="row.id"
        class="mobile-card"
        type="button"
        @click="auth.hasScope('user:edit') && openEdit(row)"
      >
        <div class="card-main">
          <span class="avatar">{{ avatarText(row) }}</span>
          <div>
            <strong>{{ row.fullName || row.displayName }}</strong>
            <span>{{ row.email }}</span>
          </div>
        </div>
        <div class="card-meta">
          <span>{{ roleText(row.role) }}</span>
          <span>{{ row.employeeId || t('userList.employeeIdUnset') }}</span>
          <span class="chip" :class="row.status === 'active' ? 'ok' : 'warn'">{{ statusText(row.status) }}</span>
        </div>
      </button>
      <div v-if="!loading && users.length === 0" class="mobile-empty">{{ t('userList.noUsers') }}</div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingUser ? t('route.userEdit') : t('route.userCreate')" width="520px" class="adaptive-dialog">
      <el-form label-width="96px">
        <el-form-item :label="t('userList.name')" required>
          <el-input v-model="form.fullName" :placeholder="t('userList.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('userList.accountEmail')" required>
          <el-input v-model="form.email" :disabled="!!editingUser" placeholder="name@company.com" />
        </el-form-item>
        <el-form-item v-if="!editingUser" :label="t('userList.initialPassword')" required>
          <el-input v-model="form.password" type="password" show-password :placeholder="t('userList.passwordPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('userList.employeeId')">
          <el-input v-model="form.employeeId" :placeholder="t('userList.employeeIdPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('userList.companyName')">
          <el-input v-model="form.companyName" :placeholder="t('common.optional')" />
        </el-form-item>
        <el-form-item :label="t('userList.role')" required>
          <el-select v-model="form.role" class="field">
            <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingUser" :label="t('common.status')" required>
          <el-select v-model="form.status" class="field">
            <el-option :label="t('userList.enabled')" value="active" />
            <el-option :label="t('userList.disabled')" value="suspended" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const users = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editingUser = ref<any | null>(null);

const roleOptions = computed(() => [
  { label: t('userRole.super_admin'), value: 'super_admin' },
  { label: t('userRole.purchase_manager'), value: 'purchase_manager' },
  { label: t('userRole.purchase_staff'), value: 'purchase_staff' },
  { label: t('userRole.evaluator'), value: 'evaluator' },
]);

const form = reactive({
  email: '',
  password: '',
  role: 'purchase_staff',
  fullName: '',
  employeeId: '',
  companyName: '',
  status: 'active',
});

function roleText(role: string) {
  return roleOptions.value.find((item) => item.value === role)?.label ?? role;
}

function statusText(status: string) {
  return status === 'active' ? t('userList.enabled') : t('userList.disabled');
}

function avatarText(row: any) {
  return String(row.fullName || row.displayName || row.email || '?').slice(0, 1).toUpperCase();
}

function fmt(value: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
}

function resetForm() {
  form.email = '';
  form.password = '';
  form.role = 'purchase_staff';
  form.fullName = '';
  form.employeeId = '';
  form.companyName = '';
  form.status = 'active';
}

function openCreate() {
  editingUser.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: any) {
  editingUser.value = row;
  form.email = row.email;
  form.password = '';
  form.role = row.role;
  form.fullName = row.fullName || row.displayName || '';
  form.employeeId = row.employeeId || '';
  form.companyName = row.companyName || '';
  form.status = row.status;
  dialogVisible.value = true;
}

async function load() {
  loading.value = true;
  try {
    users.value = (await api.get('/api/company-users')).data.data ?? [];
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      fullName: form.fullName,
      employeeId: form.employeeId || undefined,
      companyName: form.companyName || undefined,
      role: form.role,
      status: form.status,
    };
    if (editingUser.value) {
      await api.patch(`/api/company-users/${editingUser.value.id}`, payload);
      ElMessage.success(t('userList.updated'));
    } else {
      await api.post('/api/company-users', {
        ...payload,
        email: form.email,
        password: form.password,
      });
      ElMessage.success(t('userList.created'));
    }
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.user-page { display: grid; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-header h2 { margin: 0 0 6px; color: #111827; }
.page-header p { margin: 0; color: #6b7280; }
.field { width: 100%; }
.mobile-toolbar { display: none; }
.mobile-cards { display: none; }

@media (pointer: coarse) {
  .user-page {
    min-height: 100%;
    margin: 0 -16px;
    padding: 0 16px 18px;
    background: #f2f2f7;
  }
  .page-header {
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
    background: #e8f0ff;
    color: #2563eb;
    font-weight: 700;
  }
  .card-main strong,
  .card-main span:not(.avatar),
  .card-meta span {
    display: block;
  }
  .card-main strong {
    color: #111827;
    font-size: 16px;
  }
  .card-main span:not(.avatar),
  .card-meta {
    color: #6b7280;
    font-size: 13px;
  }
  .card-main span:not(.avatar) {
    margin-top: 5px;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
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
  .mobile-empty {
    padding: 40px 0;
    color: #6b7280;
    text-align: center;
  }
  :global(.adaptive-dialog.el-dialog) {
    width: calc(100vw - 24px) !important;
    max-width: none;
    margin: 0 !important;
    border-radius: 16px 16px 0 0;
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
  }
  :global(.adaptive-dialog .el-input__wrapper),
  :global(.adaptive-dialog .el-select__wrapper) {
    min-height: 46px;
    border-radius: 12px;
  }
  :global(.adaptive-dialog .el-dialog__footer) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  :global(.adaptive-dialog .el-dialog__footer .el-button) {
    min-height: 44px;
    margin-left: 0;
    border-radius: 12px;
  }
}
</style>
