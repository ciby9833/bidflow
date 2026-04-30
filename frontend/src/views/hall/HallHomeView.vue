<!--
文件：frontend/src/views/hall/HallHomeView.vue
功能：WEB 端首页，匿名展示公司公开项目。
交互：调用后端 hall.controller.ts 的公开接口；点击项目进入公开项目详情。
作者：吴川
-->
<template>
  <div class="hall-page">
    <header class="page-head">
      <div>
        <h1>{{ profileName }}</h1>
        <p>{{ profileIntro }}</p>
      </div>
    </header>

    <section class="content-panel">
      <div class="panel-head">
        <h2>{{ t('hall.public_tenders') }}</h2>
        <span>{{ t('hall.project_count', { count: tenders.length }) }}</span>
      </div>
      <el-table :data="tenders" :empty-text="t('hall.no_public_tenders')" @row-click="openTender">
        <el-table-column :label="t('hall.project_name')" min-width="260">
          <template #default="{ row }">
            <div class="project-title">{{ row.title }}</div>
            <div class="project-summary">{{ row.hallSummary || row.description || t('hall.public_project_summary') }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="tenderNo" :label="t('hall.project_no')" width="160" />
        <el-table-column prop="type" :label="t('common.type')" width="140">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('hall.start_time')" width="180">
          <template #default="{ row }">
            {{ row.bidStartAt ? fmt(row.bidStartAt) : t('hall.start_after_publish') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('hall.deadline')" width="180">
          <template #default="{ row }">
            {{ row.bidDeadline ? fmt(row.bidDeadline) : t('hall.long_term_valid') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="100" align="right">
          <template #default>
            <el-button text type="primary">{{ t('common.details') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../../composables/useApi';

const { t } = useI18n();
const router = useRouter();
const profile = ref<any>({});
const tenders = ref<any[]>([]);
const profileName = computed(() => {
  return ['BidFlow 采购招标中心', 'BidFlow Procurement Center'].includes(profile.value.name) ? t('hall.default_company_name') : (profile.value.name || t('route.hall'));
});
const profileIntro = computed(() => {
  return ['面向供应商开放的公开招标与协同报价门户。', 'Public tender and collaborative quotation portal for suppliers.'].includes(profile.value.intro) ? t('hall.default_company_intro') : (profile.value.intro || t('hall.intro'));
});

function fmt(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function openTender(row: any) {
  router.push(`/hall/tenders/${row.id}`);
}

async function load() {
  const [profileRes, tenderRes] = await Promise.all([
    api.get('/api/hall/company-profile'),
    api.get('/api/hall/tenders'),
  ]);
  profile.value = profileRes.data.data ?? {};
  tenders.value = tenderRes.data.data ?? [];
}

onMounted(load);
</script>

<style scoped>
.hall-page { display: grid; gap: 16px; }
.page-head { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 22px; }
.page-head h1 { margin: 0 0 8px; color: #111827; font-size: 24px; }
.page-head p { margin: 0; color: #6b7280; line-height: 1.7; }
.content-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head h2 { margin: 0; color: #111827; font-size: 18px; }
.panel-head span { color: #6b7280; }
.project-title { color: #111827; font-weight: 700; }
.project-summary { margin-top: 4px; color: #6b7280; font-size: 13px; line-height: 1.5; }
:deep(.el-table__row) { cursor: pointer; }
</style>
