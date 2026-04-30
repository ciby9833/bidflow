<!--
文件：frontend/src/views/supplier/SupplierCreateView.vue
功能：供应商创建页，用于录入主数据、联系人和风控指纹信息。
交互：调用 supplier.controller.ts 的创建接口；创建后返回 SupplierListView.vue。
作者：吴川
-->
<template>
  <div class="supplier-create">
    <div class="page-header">
      <el-button text @click="router.push('/suppliers')">{{ t('common.back') }}</el-button>
      <h2>{{ t('supplier.create') }}</h2>
    </div>

    <el-card class="form-card">
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('supplier.legal_name')" required>
          <el-input v-model="form.legalName" size="large" />
        </el-form-item>
        <el-form-item :label="t('supplier.short_name')" required>
          <el-input v-model="form.shortName" size="large" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="t('common.contact_name')">
              <el-input v-model="form.contactName" size="large" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.contact_phone')">
              <el-input v-model="form.contactPhone" size="large" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="t('common.contact_email')">
              <el-input v-model="form.contactEmail" size="large" type="email" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.tax_id')">
              <el-input v-model="form.taxId" size="large" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="form-actions">
          <el-button @click="router.push('/suppliers')">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" native-type="submit" :loading="loading">{{ t('common.submit') }}</el-button>
        </div>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const error = ref('');
// 当前供应商主数据只开放印尼，创建页不展示国家选择；未来多国家开放时再恢复选择器。
const FIXED_SUPPLIER_COUNTRY_CODE = 'ID';
const form = reactive({ legalName: '', shortName: '', countryCode: FIXED_SUPPLIER_COUNTRY_CODE, region: '', contactName: '', contactEmail: '', contactPhone: '', taxId: '' });

async function submit() {
  if (!form.legalName.trim() || !form.shortName.trim()) {
    error.value = t('supplierCreate.validationNameRequired');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await api.post('/api/suppliers', { ...form, countryCode: FIXED_SUPPLIER_COUNTRY_CODE });
    ElMessage.success(t('supplierCreate.created'));
    router.push('/suppliers');
  } catch (e: any) {
    error.value = e.response?.data?.error?.message_key ? t(e.response.data.error.message_key) : t('supplierCreate.createFailed');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.supplier-create {
  max-width: 760px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.page-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 24px;
  letter-spacing: -.02em;
}
.form-card {
  border-radius: 18px;
  border-color: #e2e8f0;
  box-shadow: 0 12px 30px rgba(15, 23, 42, .05);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
