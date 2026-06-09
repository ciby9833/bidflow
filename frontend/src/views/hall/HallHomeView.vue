<!--
文件：frontend/src/views/hall/HallHomeView.vue
功能：WEB 端首页，匿名展示公司公开项目。
交互：调用后端 hall.controller.ts 的公开接口；点击项目进入公开项目详情。
作者：吴川
-->
<template>
  <div class="hall-page">
    <section class="portal-overview">
      <div class="portal-intro">
        <div class="hero-kicker">{{ t('hall.procurement_hall') }}</div>
        <h1>{{ profileName }}</h1>
        <p>{{ profileIntro }}</p>
        <div class="hero-actions">
          <el-button v-if="!auth.isLoggedIn" type="primary" size="large" @click="router.push('/register/supplier')">
            <el-icon><OfficeBuilding /></el-icon>{{ t('hall.supplier_entry') }}
          </el-button>
          <el-button v-if="!auth.isLoggedIn" size="large" @click="router.push('/login')">
            <el-icon><User /></el-icon>{{ t('auth.login') }}
          </el-button>
          <el-button v-if="isCompanyUser" type="primary" size="large" @click="router.push('/tenders')">
            <el-icon><Tickets /></el-icon>{{ t('hall.manage_tenders') }}
          </el-button>
          <el-button v-if="isSupplierUser" type="primary" size="large" @click="router.push('/supplier/tenders')">
            <el-icon><Tickets /></el-icon>{{ t('hall.enter_supplier_hall') }}
          </el-button>
        </div>
      </div>

      <div class="summary-panel" :aria-label="t('hall.portal_summary')">
        <div class="summary-panel-head">
          <span>{{ t('hall.portal_summary') }}</span>
          <el-button text :loading="loading" @click="load">
            <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
          </el-button>
        </div>
        <div class="summary-grid">
          <div v-for="item in summaryCards" :key="item.key" class="summary-tile">
            <div>
              <span>{{ item.label }}</span>
              <small>{{ item.caption }}</small>
            </div>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="content-panel">
      <div class="panel-head">
        <div>
          <h2>{{ t('hall.public_tenders') }}</h2>
          <p>{{ t('hall.public_tenders_desc') }}</p>
        </div>
        <div class="panel-actions">
          <el-tag effect="plain" size="large">{{ t('hall.project_count', { count: portalSummary.publicTenderCount }) }}</el-tag>
          <el-tag effect="plain" size="large">{{ t('hall.lot_count', { count: portalSummary.publicLotCount }) }}</el-tag>
        </div>
      </div>

      <el-table v-loading="loading" :data="tenders" :empty-text="t('hall.no_public_tenders')" stripe @row-click="openTender">
        <el-table-column :label="t('hall.project_name')" min-width="260">
          <template #default="{ row }">
            <div class="project-title">{{ row.title }}</div>
            <div class="project-summary">{{ row.hallSummary || row.description || t('hall.public_project_summary') }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="tenderNo" :label="t('hall.project_no')" width="160" />
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ t(`tender.status.${row.status}`, row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" :label="t('common.type')" width="140">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ t(`tender.${row.type}`, row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('hall.lots')" width="100">
          <template #default="{ row }">
            {{ row.lots?.length || 0 }}
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
            <el-button text type="primary">
              {{ t('common.details') }}<el-icon><ArrowRight /></el-icon>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('hall.no_public_tenders')">
            <el-button v-if="isCompanyUser" type="primary" @click="router.push('/tenders/new')">
              <el-icon><Plus /></el-icon>{{ t('route.tenderCreate') }}
            </el-button>
          </el-empty>
        </template>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  ArrowRight, OfficeBuilding, Plus, Refresh, Tickets, User,
} from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const profile = ref<any>({});
const tenders = ref<any[]>([]);
const portalSummary = ref({
  publicTenderCount: 0,
  publicLotCount: 0,
  publicQuoteOpenCount: 0,
  closingSoonCount: 0,
  nextDeadlineAt: null as string | null,
});
const loading = ref(false);
const isSupplierUser = computed(() => Boolean(auth.user?.supplierId));
const isCompanyUser = computed(() => Boolean(auth.user && !auth.user.supplierId));
const profileName = computed(() => {
  return ['BidFlow 采购招标中心', 'BidFlow Procurement Center'].includes(profile.value.name) ? t('hall.default_company_name') : (profile.value.name || t('route.hall'));
});
const profileIntro = computed(() => {
  return ['面向供应商开放的公开招标与协同报价门户。', 'Public tender and collaborative quotation portal for suppliers.'].includes(profile.value.intro) ? t('hall.default_company_intro') : (profile.value.intro || t('hall.intro'));
});
const summaryCards = computed(() => [
  {
    key: 'publicTenderCount',
    label: t('hall.metric_public_projects'),
    value: portalSummary.value.publicTenderCount,
    caption: t('hall.metric_public_projects_desc'),
  },
  {
    key: 'publicLotCount',
    label: t('hall.metric_lots'),
    value: portalSummary.value.publicLotCount,
    caption: t('hall.metric_lots_desc'),
  },
  {
    key: 'publicQuoteOpenCount',
    label: t('hall.metric_quote_open'),
    value: portalSummary.value.publicQuoteOpenCount,
    caption: t('hall.metric_quote_open_desc'),
  },
  {
    key: 'closingSoonCount',
    label: t('hall.metric_closing_soon'),
    value: portalSummary.value.closingSoonCount,
    caption: portalSummary.value.nextDeadlineAt
      ? t('hall.metric_next_deadline', { time: fmt(portalSummary.value.nextDeadlineAt) })
      : t('hall.metric_closing_soon_desc'),
  },
]);

function fmt(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function statusTag(s: string) {
  return { published: '', open: 'success', closed: 'info', awarded: 'warning', cancelled: 'danger' }[s] ?? '';
}

function openTender(row: any) {
  router.push(`/hall/tenders/${row.id}`);
}

async function load() {
  loading.value = true;
  try {
    const [profileRes, summaryRes, tenderRes] = await Promise.all([
      api.get('/api/hall/company-profile'),
      api.get('/api/hall/portal-summary'),
      api.get('/api/hall/tenders'),
    ]);
    profile.value = profileRes.data.data ?? {};
    portalSummary.value = { ...portalSummary.value, ...(summaryRes.data.data ?? {}) };
    tenders.value = tenderRes.data.data ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hall-page { max-width: 100%; min-width: 0; display: grid; gap: 14px; color: #0f172a; overflow-x: hidden; }
.portal-overview {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(420px, .9fr);
  gap: 16px;
}
.portal-intro,
.summary-panel,
.content-panel {
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
}
.portal-intro {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
  border-left: 4px solid #0369a1;
}
.hero-kicker { color: #0369a1; font-size: 13px; font-weight: 700; letter-spacing: 0; margin-bottom: 10px; }
.portal-intro h1 { margin: 0 0 10px; color: #020617; font-size: 28px; line-height: 1.25; }
.portal-intro p { max-width: 720px; margin: 0; color: #475569; line-height: 1.7; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.hero-actions :deep(.el-button) { display: inline-flex; align-items: center; gap: 6px; }
.hero-actions :deep(.el-button .el-icon) { margin-right: 4px; }
.summary-panel { min-width: 0; padding: 14px; }
.summary-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.summary-panel-head span { color: #0f172a; font-size: 14px; font-weight: 700; }
.summary-panel-head :deep(.el-button) { padding: 4px 0; color: #475569; }
.summary-grid { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.summary-tile {
  min-width: 0;
  min-height: 84px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.summary-tile span { display: block; margin-bottom: 5px; color: #475569; font-size: 13px; font-weight: 700; }
.summary-tile strong { flex: 0 0 auto; color: #0f172a; font-size: 28px; line-height: 1; }
.summary-tile small { display: block; color: #64748b; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.content-panel { min-width: 0; padding: 18px; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.panel-head h2 { margin: 0; color: #0f172a; font-size: 18px; }
.panel-head p { margin: 6px 0 0; color: #64748b; line-height: 1.6; }
.panel-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.project-title { color: #111827; font-weight: 700; }
.project-summary { margin-top: 4px; color: #6b7280; font-size: 13px; line-height: 1.5; }
:deep(.el-button) { transition: background-color .18s ease, border-color .18s ease, color .18s ease; }
:deep(.el-button .el-icon) { margin-right: 4px; }
:deep(.el-table__row) { cursor: pointer; }

@media (max-width: 760px) {
  .portal-overview { grid-template-columns: 1fr; }
  .portal-intro { padding: 18px; }
  .portal-intro h1 { font-size: 24px; }
  .summary-grid { grid-template-columns: 1fr; }
  .panel-head { flex-direction: column; }
  .panel-actions { justify-content: flex-start; }
}

@media (min-width: 761px) and (max-width: 1180px) {
  .portal-overview { grid-template-columns: 1fr; }
}
</style>
