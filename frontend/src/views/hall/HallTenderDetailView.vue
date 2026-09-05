<!--
文件：frontend/src/views/hall/HallTenderDetailView.vue
功能：WEB 端侧边栏内的公开项目详情页，展示公开摘要与标包信息。
交互：调用 hall.controller.ts 的公开详情接口；返回首页列表。
作者：吴川
-->
<template>
  <div class="detail-page" v-loading="loading">
    <div class="detail-panel" v-if="tender">
      <el-button text @click="router.push('/hall')">{{ t('hall.back_home') }}</el-button>
      <h1>{{ tender.title }}</h1>
      <div class="meta">
        <el-tag>{{ tender.type }}</el-tag>
        <el-tag type="success">{{ tender.status }}</el-tag>
        <el-tag v-if="tender.branch" type="info">{{ tender.branch.name }}</el-tag>
        <span>{{ t('hall.start_label') }}{{ tender.bidStartAt ? fmt(tender.bidStartAt) : t('hall.start_after_publish') }}</span>
        <span>{{ t('hall.deadline_label') }}{{ tender.bidDeadline ? fmt(tender.bidDeadline) : t('common.not_set') }}</span>
      </div>
      <!--
        跨机构提示：招标属于其他机构时，明确说明为何不能直接参与并给出下一步，
        而不是让用户面对一个点不动的按钮，误以为系统故障。
      -->
      <el-alert
        v-if="crossBranch"
        type="warning"
        show-icon
        :closable="false"
        class="cross-branch"
      >
        <template #title>{{ t('hall.other_branch_title', { name: tender.branch.name }) }}</template>
        <div>
          {{ auth.canSwitchBranch ? t('hall.other_branch_switch') : t('hall.other_branch_no_access') }}
        </div>
      </el-alert>

      <p class="summary">{{ tender.hallSummary || tender.description || t('hall.detail_public_summary') }}</p>
      <TenderDeadlineChanges :tender="tender" :notices="tender.deadlineChanges || []" />
      <el-divider />
      <h3>{{ t('hall.lot_information') }}</h3>
      <ul class="lots">
        <li v-for="lot in tender.lots || []" :key="lot.id">
          <strong>{{ lot.title }}</strong>
          <span>{{ lot.description || t('hall.login_for_quote_info') }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import TenderDeadlineChanges from '../../components/TenderDeadlineChanges.vue';
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
/** 已登录、且该招标不属于当前机构时才提示。未登录访客看到的都是全球公开标，不需要提示。 */
const crossBranch = computed(() => auth.isLoggedIn && tender.value?.branch && !tender.value.belongsToViewerBranch);
const router = useRouter();
const loading = ref(false);
const tender = ref<any>(null);

function fmt(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get(`/api/hall/tenders/${route.params.id}`);
    tender.value = res.data.data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.detail-page { display: grid; gap: 16px; }
.detail-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; }
.detail-panel h1 { margin: 12px 0 16px; color: #111827; font-size: 26px; }
.meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; color: #52606d; margin-bottom: 16px; }
.summary { color: #3e4c59; line-height: 1.8; }
.lots { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.lots li { display: flex; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 14px; background: #f8fafc; }
.cross-branch { margin: 12px 0; }
</style>
