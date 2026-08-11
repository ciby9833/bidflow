<!--
文件：frontend/src/views/organization/BranchManageView.vue
功能：总部的机构与成员管理界面——新建国家机构、启停机构、分配成员与角色。
交互：调用后端 /api/organization/*，该组接口由 HqOnlyGuard 限定仅总部身份可访问。
作者：吴川

页面仅在以总部身份操作时可用。若当前激活的是国家机构，后端会返回 403，
此处据此给出明确引导，而不是把错误直接抛给用户。
-->
<template>
  <section class="branch-manage">
    <header class="page-head">
      <div>
        <h2>{{ t('org.title') }}</h2>
        <p class="page-desc">{{ t('org.desc') }}</p>
      </div>
      <el-button v-if="!forbidden" type="primary" @click="openCreate">
        {{ t('org.create_branch') }}
      </el-button>
    </header>

    <el-alert
      v-if="forbidden"
      :title="t('org.hq_only_hint')"
      type="info"
      show-icon
      :closable="false"
    />

    <template v-else>
      <el-table :data="branches" v-loading="loading" class="branch-table">
        <el-table-column prop="code" :label="t('org.code')" width="100" />
        <el-table-column prop="name" :label="t('org.name')" min-width="180" />
        <el-table-column :label="t('org.type')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.type === 'HQ' ? 'warning' : 'success'" size="small">
              {{ row.type === 'HQ' ? t('org.type_hq') : t('org.type_branch') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="countryCode" :label="t('org.country')" width="90" />
        <el-table-column :label="t('org.currency')" width="100">
          <template #default="{ row }">{{ row.settings?.currency ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="memberCount" :label="t('org.members')" width="90" />
        <el-table-column :label="t('org.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? t('org.active') : t('org.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('org.actions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openMembers(row)">{{ t('org.manage_members') }}</el-button>
            <!-- 总部不可停用：停用后无人能再管理组织结构 -->
            <el-button
              v-if="row.type !== 'HQ'"
              link
              :type="row.status === 'active' ? 'danger' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'active' ? t('org.disable') : t('org.enable') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 新建机构 -->
      <el-dialog v-model="createVisible" :title="t('org.create_branch')" width="480px">
        <el-form :model="form" label-width="110px">
          <el-form-item :label="t('org.code')" required>
            <el-input v-model.trim="form.code" maxlength="20" :placeholder="t('org.code_placeholder')" />
          </el-form-item>
          <el-form-item :label="t('org.name')" required>
            <el-input v-model.trim="form.name" maxlength="200" />
          </el-form-item>
          <el-form-item :label="t('org.country')" required>
            <el-input v-model.trim="form.countryCode" maxlength="2" :placeholder="t('org.country_placeholder')" />
          </el-form-item>
          <el-form-item :label="t('org.currency')">
            <el-input v-model.trim="form.currency" maxlength="3" placeholder="VND" />
          </el-form-item>
          <el-form-item :label="t('org.timezone')">
            <el-input v-model.trim="form.timezone" placeholder="Asia/Ho_Chi_Minh" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="submitCreate">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <!-- 成员管理 -->
      <el-dialog v-model="membersVisible" :title="membersTitle" width="640px">
        <div class="member-add">
          <el-select v-model="newMember.userId" filterable :placeholder="t('org.select_user')" class="member-user">
            <el-option
              v-for="u in assignableUsers"
              :key="u.id"
              :label="`${u.fullName || u.displayName} (${u.email})`"
              :value="u.id"
            />
          </el-select>
          <el-select v-model="newMember.role" :placeholder="t('org.role')" class="member-role">
            <el-option v-for="r in roleOptions" :key="r" :label="t(`org.role_${r}`)" :value="r" />
          </el-select>
          <el-button type="primary" :disabled="!newMember.userId || !newMember.role" @click="addMember">
            {{ t('org.add_member') }}
          </el-button>
        </div>

        <el-table :data="members" v-loading="membersLoading" size="small">
          <el-table-column prop="email" :label="t('org.user')" min-width="180" />
          <el-table-column :label="t('org.role')" width="150">
            <template #default="{ row }">{{ t(`org.role_${row.role}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('org.actions')" width="100">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeMember(row)">{{ t('org.remove') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p class="member-hint">{{ t('org.revoke_hint') }}</p>
      </el-dialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../composables/useApi';

interface Branch {
  id: string; code: string; name: string; type: 'HQ' | 'BRANCH';
  countryCode?: string; status: string; memberCount: number;
  settings?: { currency?: string; timezone?: string };
}
interface Member { id: string; userId: string; email: string; displayName: string; role: string; status: string; }

const { t } = useI18n();
const branches = ref<Branch[]>([]);
const loading = ref(false);
const forbidden = ref(false);
const saving = ref(false);

const createVisible = ref(false);
const form = reactive({ code: '', name: '', countryCode: '', currency: '', timezone: '' });

const membersVisible = ref(false);
const membersLoading = ref(false);
const members = ref<Member[]>([]);
const currentBranch = ref<Branch | null>(null);
const allUsers = ref<{ id: string; email: string; displayName: string; fullName?: string }[]>([]);
const newMember = reactive({ userId: '', role: '' });

const membersTitle = computed(() => `${t('org.manage_members')} — ${currentBranch.value?.name ?? ''}`);
// 总部只能有总部角色，国家机构只能有业务角色 —— 与后端 assertRoleFitsBranch 保持一致
const roleOptions = computed(() => (currentBranch.value?.type === 'HQ'
  ? ['hq_admin']
  : ['super_admin', 'purchase_manager', 'purchase_staff', 'evaluator']));
/** 已在本机构的用户不再出现在候选中，避免提交后才报"已是成员" */
const assignableUsers = computed(() => {
  const existing = new Set(members.value.map((m) => m.userId));
  return allUsers.value.filter((u) => !existing.has(u.id));
});

async function load() {
  loading.value = true;
  try {
    branches.value = (await api.get('/api/organization/branches')).data.data;
    forbidden.value = false;
  } catch (e: any) {
    // 当前不是总部身份，给出引导而非报错
    if (e.response?.status === 403) forbidden.value = true;
    else ElMessage.error(t('org.load_failed'));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { code: '', name: '', countryCode: '', currency: '', timezone: '' });
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.code || !form.name || !form.countryCode) {
    ElMessage.warning(t('org.required_fields'));
    return;
  }
  saving.value = true;
  try {
    const settings: Record<string, string> = {};
    if (form.currency) settings.currency = form.currency.toUpperCase();
    if (form.timezone) settings.timezone = form.timezone;
    await api.post('/api/organization/branches', {
      code: form.code, name: form.name, countryCode: form.countryCode.toUpperCase(), settings,
    });
    ElMessage.success(t('org.created'));
    createVisible.value = false;
    await load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('org.create_failed'));
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: Branch) {
  const disabling = row.status === 'active';
  try {
    await ElMessageBox.confirm(
      disabling ? t('org.disable_confirm', { name: row.name }) : t('org.enable_confirm', { name: row.name }),
      t('org.confirm_title'),
      { type: 'warning' },
    );
  } catch { return; }
  try {
    await api.patch(`/api/organization/branches/${row.id}`, { status: disabling ? 'inactive' : 'active' });
    ElMessage.success(t('org.updated'));
    await load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('org.update_failed'));
  }
}

async function openMembers(row: Branch) {
  currentBranch.value = row;
  membersVisible.value = true;
  Object.assign(newMember, { userId: '', role: '' });
  membersLoading.value = true;
  try {
    const [m, u] = await Promise.all([
      api.get(`/api/organization/branches/${row.id}/members`),
      api.get('/api/company-users'),
    ]);
    members.value = m.data.data;
    allUsers.value = u.data.data;
  } catch {
    ElMessage.error(t('org.load_failed'));
  } finally {
    membersLoading.value = false;
  }
}

async function addMember() {
  try {
    await api.post(`/api/organization/branches/${currentBranch.value!.id}/members`, { ...newMember });
    ElMessage.success(t('org.member_added'));
    Object.assign(newMember, { userId: '', role: '' });
    await openMembers(currentBranch.value!);
    await load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('org.add_failed'));
  }
}

async function removeMember(row: Member) {
  try {
    await ElMessageBox.confirm(t('org.remove_confirm', { email: row.email }), t('org.confirm_title'), { type: 'warning' });
  } catch { return; }
  try {
    await api.delete(`/api/organization/branches/${currentBranch.value!.id}/members/${row.id}`);
    ElMessage.success(t('org.member_removed'));
    await openMembers(currentBranch.value!);
    await load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error?.message ?? t('org.remove_failed'));
  }
}

onMounted(load);
</script>

<style scoped>
.branch-manage { padding: 20px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-head h2 { margin: 0 0 4px; font-size: 20px; color: #111827; }
.page-desc { margin: 0; font-size: 13px; color: #6b7280; }
.branch-table { margin-top: 8px; }
.member-add { display: flex; gap: 8px; margin-bottom: 12px; }
.member-user { flex: 1; }
.member-role { width: 170px; }
.member-hint { margin: 10px 0 0; font-size: 12px; color: #9ca3af; }
</style>
