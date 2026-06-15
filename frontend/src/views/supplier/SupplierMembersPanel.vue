<!--
文件：frontend/src/views/supplier/SupplierMembersPanel.vue
功能：展示并维护供应商成员账号，供公司管理端和供应商端复用。
交互：调用供应商成员列表、关系调整与密码重置接口。
作者：吴川
-->
<template>
  <section class="member-panel">
    <div class="panel-toolbar">
      <div>
        <strong>{{ t('supplierMembers.title') }}</strong>
        <span>{{ t('supplierMembers.total', { count: total }) }}</span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <el-table :data="members" v-loading="loading" stripe>
      <el-table-column :label="t('auth.account')" min-width="220">
        <template #default="{ row }">
          <div class="account-cell">
            <strong>{{ row.displayName || row.relationDisplayName || t('userList.namePlaceholder') }}</strong>
            <span>{{ row.email }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('supplierMembers.role')" width="130">
        <template #default="{ row }">
          <el-select
            v-if="canManage"
            v-model="row.relationRole"
            size="small"
            @change="updateMember(row, { relationRole: row.relationRole })"
          >
            <el-option :label="t('supplierMembers.roles.owner')" value="owner" />
            <el-option :label="t('supplierMembers.roles.admin')" value="admin" />
            <el-option :label="t('supplierMembers.roles.operator')" value="operator" />
          </el-select>
          <el-tag v-else>{{ roleText(row.relationRole) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('supplierMembers.primary')" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.isPrimary" type="success">{{ t('common.yes') }}</el-tag>
          <el-button v-else-if="canManage && row.status === 'active'" size="small" text @click="updateMember(row, { isPrimary: true })">
            {{ t('supplierMembers.setPrimary') }}
          </el-button>
          <span v-else>{{ t('common.no') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="130">
        <template #default="{ row }">
          <el-switch
            v-if="canManage && !row.isPrimary"
            v-model="row.status"
            active-value="active"
            inactive-value="suspended"
            :active-text="t('userList.enabled')"
            :inactive-text="t('userList.disabled')"
            inline-prompt
            @change="updateMember(row, { status: row.status })"
          />
          <el-tag v-else :type="row.status === 'active' ? 'success' : 'warning'">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="phone" :label="t('common.contact_phone')" width="150">
        <template #default="{ row }">{{ row.phone || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('supplierMembers.source')" width="150">
        <template #default="{ row }">{{ sourceText(row.registerSource) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.createdAt')" width="150">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column v-if="canManage" :label="t('common.actions')" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="Key" @click="openReset(row)">{{ t('supplierMembers.resetPassword') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > query.limit"
      class="pager"
      small
      layout="total, prev, pager, next"
      v-model:current-page="query.page"
      :page-size="query.limit"
      :total="total"
      @current-change="load"
    />

    <el-dialog v-model="resetDialog.visible" :title="t('supplierMembers.resetPassword')" width="420px">
      <el-form label-position="top">
        <el-form-item :label="t('auth.account')">
          <el-input :model-value="resetDialog.member?.email || ''" disabled />
        </el-form-item>
        <el-form-item :label="t('userList.initialPassword')" required>
          <el-input v-model="resetDialog.password" show-password :placeholder="t('userList.passwordPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialog.visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="resetting" @click="submitReset">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import {
  onMounted, reactive, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { Key, Refresh } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const props = defineProps<{
  apiBase: string;
  canManage?: boolean;
}>();

const { t } = useI18n();
const loading = ref(false);
const resetting = ref(false);
const members = ref<any[]>([]);
const total = ref(0);
const query = reactive({ page: 1, limit: 10 });
const resetDialog = reactive({
  visible: false,
  member: null as any,
  password: '',
});

function fmt(value: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
}

function roleText(role?: string) {
  return t(`supplierMembers.roles.${role || 'operator'}`);
}

function statusText(status?: string) {
  return status === 'active' ? t('userList.enabled') : t('userList.disabled');
}

function sourceText(source?: string) {
  return t(`supplierMembers.sources.${source || 'unknown'}`, source || t('supplierMembers.sources.unknown'));
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(props.apiBase, { params: query });
    members.value = res.data.data?.items ?? [];
    total.value = Number(res.data.data?.total ?? 0);
  } finally {
    loading.value = false;
  }
}

async function updateMember(row: any, patch: Record<string, unknown>) {
  const previous = { ...row };
  try {
    await api.patch(`${props.apiBase}/${row.id}`, patch);
    ElMessage.success(t('supplierMembers.updated'));
    await load();
  } catch (err) {
    Object.assign(row, previous);
    throw err;
  }
}

function openReset(row: any) {
  resetDialog.member = row;
  resetDialog.password = '';
  resetDialog.visible = true;
}

async function submitReset() {
  if (!resetDialog.member) return;
  if (resetDialog.password.length < 6) {
    ElMessage.warning(t('supplierMembers.passwordWeak'));
    return;
  }
  resetting.value = true;
  try {
    await api.post(`${props.apiBase}/${resetDialog.member.id}/reset-password`, { password: resetDialog.password });
    ElMessage.success(t('supplierMembers.passwordReset'));
    resetDialog.visible = false;
  } finally {
    resetting.value = false;
  }
}

watch(() => props.apiBase, () => {
  query.page = 1;
  load();
});

onMounted(load);
</script>

<style scoped>
.member-panel { display: grid; gap: 12px; }
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.panel-toolbar > div { display: grid; gap: 2px; }
.panel-toolbar strong { font-size: 15px; }
.panel-toolbar span { color: #909399; font-size: 12px; }
.account-cell { display: grid; gap: 3px; min-width: 0; }
.account-cell strong,
.account-cell span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-cell span { color: #606266; font-size: 12px; }
.pager { justify-self: end; }
@media (max-width: 768px) {
  .panel-toolbar { align-items: stretch; }
  .panel-toolbar > div { min-width: 0; }
}
</style>
