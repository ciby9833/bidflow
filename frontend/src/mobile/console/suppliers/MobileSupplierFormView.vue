<!--
文件：frontend/src/mobile/console/suppliers/MobileSupplierFormView.vue
功能：移动端供应商新增/编辑页，以独立页面承载公司辅助维护供应商资料。
交互：新增调用 POST /api/suppliers；编辑调用 PATCH /api/suppliers/:id。
作者：吴川
-->
<template>
  <main class="supplier-form" v-loading="loading">
    <section class="group">
      <label><span>公司全称</span><input v-model.trim="form.legalName" placeholder="请输入" /></label>
      <label><span>简称</span><input v-model.trim="form.shortName" placeholder="请输入" /></label>
      <label><span>区域</span><input v-model.trim="form.region" placeholder="可选" /></label>
      <label><span>联系人</span><input v-model.trim="form.contactName" placeholder="可选" /></label>
      <label><span>联系邮箱</span><input v-model.trim="form.contactEmail" inputmode="email" placeholder="可选" /></label>
      <label><span>联系电话</span><input v-model.trim="form.contactPhone" inputmode="tel" placeholder="可选" /></label>
      <label><span>税号</span><input v-model.trim="form.taxId" placeholder="可选" /></label>
    </section>

    <button class="save" type="button" :disabled="saving" @click="save">{{ saving ? '保存中' : '保存' }}</button>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../../../composables/useApi';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => route.path.endsWith('/edit'));
const loading = ref(false);
const saving = ref(false);
// 当前供应商主数据只开放印尼，H5 表单不展示国家输入；未来多国家开放时再恢复选择器。
const FIXED_SUPPLIER_COUNTRY_CODE = 'ID';
const form = reactive({
  legalName: '',
  shortName: '',
  countryCode: FIXED_SUPPLIER_COUNTRY_CODE,
  region: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  taxId: '',
});

async function load() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const res = await api.get(`/api/suppliers/${route.params.id}`);
    const supplier = res.data.data;
    form.legalName = supplier.legalName || '';
    form.shortName = supplier.shortName || '';
    form.countryCode = FIXED_SUPPLIER_COUNTRY_CODE;
    form.region = supplier.region || '';
    form.contactName = supplier.contactName || '';
    form.contactEmail = supplier.contactEmail || '';
    form.contactPhone = supplier.contactPhone || '';
    form.taxId = supplier.taxId || '';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.legalName || !form.shortName) {
    ElMessage.error('请填写公司全称和简称');
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.patch(`/api/suppliers/${route.params.id}`, { ...form, countryCode: FIXED_SUPPLIER_COUNTRY_CODE });
      router.replace(`/m/console/suppliers/${route.params.id}/review`);
    } else {
      const res = await api.post('/api/suppliers', { ...form, countryCode: FIXED_SUPPLIER_COUNTRY_CODE });
      router.replace(`/m/console/suppliers/${res.data.data.id}/review`);
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.supplier-form {
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
label span {
  color: #111827;
  font-size: 15px;
}
input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #111827;
  font-size: 15px;
  text-align: right;
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
</style>
