<!--
文件：frontend/src/mobile/mine/MobileMineView.vue
功能：H5 我的页面，展示当前账号状态和供应商认证入口。
交互：读取 auth store；根据账号类型跳转认证资料或审核进度。
作者：吴川
-->
<template>
  <section class="mine-page">
    <section class="profile-card">
      <div class="avatar" aria-hidden="true">{{ avatarText }}</div>
      <div class="profile-main">
        <strong>{{ displayName }}</strong>
        <span>{{ auth.user?.email || t('auth.login_first') }}</span>
      </div>
    </section>

    <section v-if="auth.isLoggedIn" class="supplier-card">
      <div>
        <span>{{ t('route.supplierProfile') }}</span>
        <strong>{{ supplierName }}</strong>
      </div>
      <em>{{ supplierStatusLabel }}</em>
    </section>

    <section class="settings-list">
      <button class="row" type="button" @click="languageOpen = true">
        <span>{{ t('language.label') }}</span>
        <strong>{{ currentLanguageLabel }}</strong>
      </button>

      <button v-if="!auth.isLoggedIn" class="row" type="button" @click="router.push('/m/login')">
        <span>{{ t('auth.login') }}</span>
        <strong>{{ t('auth.open_account') }}</strong>
      </button>
      <button v-if="!auth.isLoggedIn" class="row" type="button" @click="router.push('/m/register/supplier')">
        <span>{{ t('auth.register_supplier') }}</span>
        <strong>{{ t('auth.create_account') }}</strong>
      </button>
      <button v-else-if="auth.user?.supplierId" class="row" type="button" @click="goSupplierStatus">
        <span>{{ t('route.supplierProfile') }}</span>
        <strong>{{ supplierStatusLabel }}</strong>
      </button>
      <button v-else-if="auth.user?.accountType === 'supplier_account'" class="row" type="button" @click="router.push('/m/supplier/profile')">
        <span>{{ t('route.supplierProfile') }}</span>
        <strong>{{ t('auth.fill_details') }}</strong>
      </button>
      <button v-else class="row" type="button" @click="router.push('/tenders')">
        <span>{{ t('auth.admin_console') }}</span>
        <strong>{{ t('common.open') }}</strong>
      </button>
    </section>

    <section v-if="auth.isLoggedIn" class="settings-list danger-list">
      <button class="row danger" type="button" @click="auth.logout('/m/mine')">
        <span>{{ t('auth.logout') }}</span>
        <strong>{{ t('auth.current_account') }}</strong>
      </button>
    </section>

    <Teleport to="body">
      <div v-if="languageOpen" class="sheet-mask" @click="languageOpen = false">
        <section class="language-sheet" @click.stop>
          <button
            v-for="item in languageOptions"
            :key="item.value"
            class="sheet-option"
            :class="{ active: locale === item.value }"
            type="button"
            @click="selectLocale(item.value)"
          >
            <span>{{ item.label }}</span>
            <strong v-if="locale === item.value">✓</strong>
          </button>
          <button class="sheet-cancel" type="button" @click="languageOpen = false">
            {{ t('common.cancel') }}
          </button>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { setAppLocale, type SupportedLocale } from '../../i18n';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t, locale } = useI18n();
const languageOpen = ref(false);

const languageOptions: Array<{ value: SupportedLocale; label: string }> = [
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
];

const displayName = computed(() => auth.user?.displayName || auth.user?.fullName || auth.user?.email || t('auth.not_logged_in'));
const avatarText = computed(() => String(displayName.value || 'B').trim().slice(0, 1).toUpperCase());
const supplierName = computed(() => auth.user?.supplierName || t('auth.not_certified'));
const supplierStatusLabel = computed(() => {
  const status = auth.user?.supplierReviewStatus;
  return status ? t(`supplierReview.${status}`) : t('auth.not_certified');
});
const currentLanguageLabel = computed(() => languageOptions.find((item) => item.value === locale.value)?.label ?? String(locale.value));

onMounted(async () => {
  if (auth.isLoggedIn) await auth.loadMe();
});

async function goSupplierStatus() {
  await auth.loadMe();
  if (auth.user?.supplierReviewStatus === 'pending_review') {
    router.push('/m/supplier/review-pending');
    return;
  }
  router.push('/m/supplier/profile');
}

function selectLocale(value: SupportedLocale) {
  setAppLocale(value);
  languageOpen.value = false;
}
</script>

<style scoped>
.mine-page {
  min-height: 100%;
  padding: 16px 16px 32px;
  background: #f4f5f8;
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}
.avatar {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 20px;
  background: #e8f0ff;
  color: #2563eb;
  font-size: 24px;
  font-weight: 800;
}
.profile-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.profile-main strong {
  font-size: 22px;
  line-height: 1.25;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-main span {
  color: #6b7280;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.supplier-card {
  margin-top: 12px;
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: 24px;
  background: #111827;
  color: #fff;
}
.supplier-card div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.supplier-card span {
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
  font-weight: 700;
}
.supplier-card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 20px;
  line-height: 1.25;
}
.supplier-card em {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}
.settings-list {
  margin-top: 12px;
  overflow: hidden;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}
.row {
  width: 100%;
  min-height: 58px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  color: #111827;
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  touch-action: manipulation;
}
.row:last-child {
  border-bottom: 0;
}
.row span {
  min-width: 0;
  color: #111827;
  font-size: 16px;
  font-weight: 700;
}
.row strong {
  max-width: 58%;
  overflow: hidden;
  color: #6b7280;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.danger {
  color: #dc2626;
}
.row.danger span {
  color: #dc2626;
}
.danger-list {
  margin-top: 18px;
}
</style>

<style>
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
}
.language-sheet {
  width: 100%;
  max-width: 520px;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: #f4f5f8;
}
.sheet-option,
.sheet-cancel {
  width: 100%;
  min-height: 56px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  color: #111827;
  font-size: 17px;
  font-weight: 700;
}
.sheet-option:first-child {
  border-radius: 16px 16px 0 0;
}
.sheet-option:nth-last-child(2) {
  border-bottom: 0;
  border-radius: 0 0 16px 16px;
}
.sheet-option.active {
  color: #0b7cff;
}
.sheet-cancel {
  justify-content: center;
  margin-top: 10px;
  border-bottom: 0;
  border-radius: 16px;
  color: #0b7cff;
}
@media (pointer: coarse) {
  .sheet-option,
  .sheet-cancel {
    min-height: 60px;
  }
}
</style>
