<!--
文件：frontend/src/mobile/console/users/MobileCompanyUserFormView.vue
功能：移动端公司用户新增/编辑页，以独立页面承载表单。
交互：新增调用 POST /api/company-users；编辑调用 PATCH /api/company-users/:id。
作者：吴川
-->
<template>
  <main class="user-form" v-loading="loading">
    <section class="group">
      <label>
        <span>姓名</span>
        <input v-model.trim="form.fullName" placeholder="请输入姓名" />
      </label>
      <label>
        <span>账号邮箱</span>
        <input v-model.trim="form.email" :disabled="isEdit" inputmode="email" placeholder="name@company.com" />
      </label>
      <label v-if="!isEdit">
        <span>初始密码</span>
        <input v-model="form.password" type="password" placeholder="至少 6 位" />
      </label>
      <label>
        <span>员工ID</span>
        <input v-model.trim="form.employeeId" placeholder="可选" />
      </label>
      <label>
        <span>公司名称</span>
        <input v-model.trim="form.companyName" placeholder="可选" />
      </label>
      <button class="select-row" type="button" @click="openPicker('role')">
        <span>角色</span>
        <strong>{{ roleLabel }}</strong>
      </button>
      <button v-if="isEdit" class="select-row" type="button" @click="openPicker('status')">
        <span>状态</span>
        <strong>{{ statusLabel }}</strong>
      </button>
    </section>

    <button class="save" type="button" :disabled="saving" @click="save">{{ saving ? '保存中' : '保存' }}</button>

    <div v-if="pickerOpen" class="sheet-mask" @click="closePicker">
      <section class="picker-sheet" @click.stop>
        <button
          v-for="item in pickerOptions"
          :key="item.value"
          class="picker-option"
          type="button"
          @click="choose(item.value)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.value === pickerValue" class="check">✓</span>
        </button>
        <button class="picker-cancel" type="button" @click="closePicker">取消</button>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../../../composables/useApi';
import {
  roleOptions, roleText, statusOptions, statusText,
} from './user-options';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const pickerType = ref<'role' | 'status' | ''>('');
const isEdit = computed(() => route.path.endsWith('/edit'));
const pickerOpen = computed(() => Boolean(pickerType.value));
const pickerOptions = computed(() => (pickerType.value === 'status' ? statusOptions : roleOptions));
const pickerValue = computed(() => (pickerType.value === 'status' ? form.status : form.role));
const roleLabel = computed(() => roleText(form.role));
const statusLabel = computed(() => statusText(form.status));

const form = reactive({
  email: '',
  password: '',
  role: 'purchase_staff',
  fullName: '',
  employeeId: '',
  companyName: '',
  status: 'active',
});

function openPicker(type: 'role' | 'status') {
  pickerType.value = type;
}

function closePicker() {
  pickerType.value = '';
}

function choose(value: string) {
  if (pickerType.value === 'status') form.status = value;
  if (pickerType.value === 'role') form.role = value;
  closePicker();
}

async function load() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const users = (await api.get('/api/company-users')).data.data ?? [];
    const user = users.find((item: any) => item.id === route.params.id);
    if (!user) return;
    form.email = user.email;
    form.role = user.role;
    form.fullName = user.fullName || user.displayName || '';
    form.employeeId = user.employeeId || '';
    form.companyName = user.companyName || '';
    form.status = user.status;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.fullName || !form.email || (!isEdit.value && form.password.length < 6)) {
    ElMessage.error('请填写必填项');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      fullName: form.fullName,
      employeeId: form.employeeId || undefined,
      companyName: form.companyName || undefined,
      role: form.role,
      status: form.status,
    };
    if (isEdit.value) {
      await api.patch(`/api/company-users/${route.params.id}`, payload);
      router.replace(`/m/console/users/${route.params.id}`);
    } else {
      const res = await api.post('/api/company-users', {
        ...payload,
        email: form.email,
        password: form.password,
      });
      router.replace(`/m/console/users/${res.data.data.id}`);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.user-form {
  min-height: 100%;
  padding: 14px 12px 28px;
  background: #f2f2f7;
}
.group {
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
}
label {
  min-height: 52px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid #e5e5ea;
}
label:last-child {
  border-bottom: 0;
}
label span,
.select-row span {
  color: #111827;
  font-size: 15px;
}
input,
select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #111827;
  font-size: 15px;
  text-align: right;
}
input:disabled {
  color: #6b7280;
  -webkit-text-fill-color: #6b7280;
}
.select-row {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid #e5e5ea;
  background: #fff;
  text-align: left;
}
.select-row:last-child {
  border-bottom: 0;
}
.select-row strong {
  position: relative;
  padding-right: 18px;
  color: #111827;
  font-size: 15px;
  font-weight: 400;
  text-align: right;
}
.select-row strong::after {
  position: absolute;
  top: 50%;
  right: 2px;
  width: 7px;
  height: 7px;
  border-right: 1.8px solid #8e8e93;
  border-bottom: 1.8px solid #8e8e93;
  content: '';
  transform: translateY(-60%) rotate(45deg);
}
.save {
  width: 100%;
  height: 48px;
  margin-top: 18px;
  border: 0;
  border-radius: 14px;
  background: #007aff;
  color: #fff;
  font-size: 17px;
  font-weight: 650;
}
.save:disabled {
  opacity: .6;
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
.picker-sheet {
  width: 100%;
  display: grid;
  gap: 8px;
}
.picker-option,
.picker-cancel {
  min-height: 54px;
  border: 0;
  background: rgba(255, 255, 255, .96);
  color: #007aff;
  font-size: 17px;
}
.picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid #e5e5ea;
  text-align: left;
}
.picker-option:first-child {
  border-radius: 14px 14px 0 0;
}
.picker-option:nth-last-child(2) {
  border-bottom: 0;
  border-radius: 0 0 14px 14px;
}
.picker-cancel {
  border-radius: 14px;
  font-weight: 650;
}
.check {
  color: #007aff;
  font-weight: 700;
}
</style>
