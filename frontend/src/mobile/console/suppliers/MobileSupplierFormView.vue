<!--
文件：frontend/src/mobile/console/suppliers/MobileSupplierFormView.vue
功能：移动端供应商新增/编辑页，以独立页面承载公司辅助维护供应商资料。
交互：新增调用 POST /api/suppliers；编辑调用 PATCH /api/suppliers/:id。
作者：吴川
-->
<template>
  <main class="supplier-form" v-loading="loading">
    <el-form label-position="top">
      <TargetBranchSelect v-if="!isEdit" v-model="form.branchId" />
      <SupplierCountrySelect v-model="form.countryCode" :branch-id="form.branchId" :auto-default="!isEdit" />
    </el-form>
    <section class="group">
      <label><span>{{ t('supplier.legal_name') }}</span><input v-model.trim="form.legalName"  /></label>
      <label><span>{{ t('supplier.short_name') }}</span><input v-model.trim="form.shortName"  /></label>
      <label><span>{{ t('common.region') }}</span><input v-model.trim="form.region" :placeholder="t('common.optional')" /></label>
      <label><span>{{ t('common.contact_name') }}</span><input v-model.trim="form.contactName" :placeholder="t('common.optional')" /></label>
      <label><span>{{ t('common.contact_email') }}</span><input v-model.trim="form.contactEmail" inputmode="email" :placeholder="t('common.optional')" /></label>
      <label><span>{{ t('common.contact_phone') }}</span><input v-model.trim="form.contactPhone" inputmode="tel" :placeholder="t('common.optional')" /></label>
      <label><span>{{ form.countryCode === 'BR' ? 'CNPJ' : t('common.tax_id') }}</span><input v-model.trim="form.taxId" :placeholder="t('common.optional')" /></label>
      <p v-if="form.countryCode === 'BR'" class="tax-hint">{{ t('market.cnpjHint') }}</p>
    </section>

    <button class="save" type="button" :disabled="saving" @click="save">{{ saving ? t('supplierProfile.submitting') : t('common.save') }}</button>
  </main>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../../../composables/useApi';
import TargetBranchSelect from '../../../components/TargetBranchSelect.vue';
import SupplierCountrySelect from '../../../components/SupplierCountrySelect.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const isEdit = computed(() => route.path.endsWith('/edit'));
const loading = ref(false);
const saving = ref(false);
const form = reactive({
  branchId: '',
  legalName: '',
  shortName: '',
  countryCode: '',
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
    form.countryCode = supplier.countryCode ?? '';
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
    ElMessage.error(t('supplierCreate.validationNameRequired'));
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.patch(`/api/suppliers/${route.params.id}`, { ...form, countryCode: form.countryCode || undefined });
      router.replace(`/m/console/suppliers/${route.params.id}/review`);
    } else {
      const res = await api.post('/api/suppliers', { ...form, countryCode: form.countryCode || undefined });
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
  outline-offset: 2px;
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
