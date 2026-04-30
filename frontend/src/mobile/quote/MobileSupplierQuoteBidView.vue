<!--
文件：frontend/src/mobile/quote/MobileSupplierQuoteBidView.vue
功能：H5 供应商报价提交页，支持普通标包报价与运力线路报价。
交互：调用 quote mine/submit 接口；提交前刷新后端 ability，展示冷却、改价上限和降幅原因。
作者：吴川
-->
<template>
  <main class="mobile-quote" v-loading="loading">
    <template v-if="lot && tender">
      <section class="hero">
        <div class="meta-line">
          <span>{{ tender.tenderNo }}</span>
          <em>{{ statusLabel(tender.status) }}</em>
        </div>
        <h1>{{ lot.title }}</h1>
        <p>{{ tender.title }}</p>
      </section>

      <section class="rule-grid">
        <div><span>{{ t('hall.deadline_short') }}</span><strong>{{ tender.bidDeadline ? fmt(tender.bidDeadline) : t('common.not_set') }}</strong></div>
        <div><span>{{ t('quote.maxRebid') }}</span><strong>{{ t('quote.times', { count: tender.maxRebidCount }) }}</strong></div>
        <div><span>{{ t('quote.minDecrement') }}</span><strong>{{ Number(tender.minDecrementPct ?? 0).toFixed(1) }}%</strong></div>
        <div><span>{{ t('quote.cooldownSeconds') }}</span><strong>{{ t('quote.seconds', { count: tender.cooldownSeconds }) }}</strong></div>
      </section>

      <section v-if="hasLineQuotes" class="panel">
        <h2>{{ t('quote.lineQuote') }}</h2>
        <article v-for="(line, index) in lot.lines" :key="line.id" class="line-card">
          <template v-if="lineState[line.id]">
            <button class="line-title" type="button" @click="toggleLine(line.id)">
              <span>#{{ index + 1 }}</span>
              <strong>{{ lineTitle(line) }}</strong>
              <em>{{ expandedLines[line.id] ? t('common.collapse') : t('quote.allFields') }}</em>
            </button>
            <div class="line-fields">
              <div v-for="field in primaryLineFields(line)" :key="field.key">
                <span>{{ field.label }}</span>
                <strong>{{ field.value }}</strong>
              </div>
            </div>
            <div v-if="expandedLines[line.id]" class="line-fields line-fields-extra">
              <div v-for="field in secondaryLineFields(line)" :key="field.key">
                <span>{{ field.label }}</span>
                <strong>{{ field.value }}</strong>
              </div>
            </div>
            <label v-for="col in supplierRequiredColumns" :key="col.key" class="field">
              <span>{{ col.label }} *</span>
              <input v-model="lineState[line.id].items[col.key]" :disabled="lineState[line.id].ability?.canSubmit === false" />
            </label>
            <div class="current-line">
              <span>{{ t('quote.myQuote') }}</span>
              <strong>{{ lineState[line.id].quote ? formatMoney(Number(lineState[line.id].quote.totalPrice), lineState[line.id].quote.currency) : t('quote.unquoted') }}</strong>
            </div>
            <label class="field">
              <span>{{ t('quote.thisQuote') }}</span>
              <input v-model.number="lineState[line.id].price" type="number" min="0.01" step="0.01" :disabled="lineState[line.id].ability?.canSubmit === false" />
            </label>
            <p v-if="getLineBlockReason(line.id)" class="warning">{{ getLineBlockReason(line.id) }}</p>
            <button class="primary-action" type="button" :disabled="isLineSubmitDisabled(line.id)" @click="submitLineQuote(line)">
              {{ lineButtonText(line.id) }}
            </button>
          </template>
        </article>
      </section>

      <section v-else class="panel">
        <h2>{{ myQuote ? t('quote.currentQuote') : t('quote.submit') }}</h2>
        <div v-if="myQuote" class="current-quote">
          <strong>{{ formatMoney(Number(myQuote.totalPrice), myQuote.currency) }}</strong>
          <span>{{ t('quote.version', { version: myQuote.version }) }} · {{ fmt(myQuote.submittedAt) }}</span>
        </div>
        <p v-if="quoteBlockReason" class="warning">{{ quoteBlockReason }}</p>
        <div v-if="myQuote && !editing" class="action-row">
          <button class="primary-action" type="button" :disabled="quoteAbility?.canSubmit === false || cooldownSecs > 0" @click="startEdit">
            {{ quoteButtonText }}
          </button>
        </div>
        <form v-if="!myQuote || editing" class="quote-form" @submit.prevent="submitQuote">
          <label class="field">
            <span>{{ t('quote.total_price') }}</span>
            <input v-model.number="form.totalPrice" type="number" min="0.01" step="0.01" />
          </label>
          <label class="field">
            <span>{{ t('quote.currency') }}</span>
            <select v-model="form.currency">
              <option value="IDR">{{ t('currency.idr') }}</option>
              <option value="USD">{{ t('currency.usd') }}</option>
              <option value="CNY">{{ t('currency.cny') }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('quote.remark') }}</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <p v-if="localValidationMessage" class="warning">{{ localValidationMessage }}</p>
          <p v-if="submitError" class="error">{{ submitError }}</p>
          <button class="primary-action" type="submit" :disabled="submitDisabled">
            {{ quoteButtonText }}
          </button>
          <button v-if="editing" class="secondary-action" type="button" @click="cancelEdit">{{ t('common.cancel') }}</button>
        </form>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, reactive, ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../composables/useApi';

const route = useRoute();
const { t } = useI18n();
const lotId = route.params.lotId as string;
const loading = ref(false);
const submitting = ref(false);
const lot = ref<any>(null);
const tender = ref<any>(null);
const myQuote = ref<any>(null);
const quoteAbility = ref<any>(null);
const submitError = ref('');
const editing = ref(false);
const cooldownSecs = ref(0);
let cooldownTimer: ReturnType<typeof setInterval> | undefined;
const lineTimers: Record<string, ReturnType<typeof setInterval> | undefined> = {};

const form = reactive({ totalPrice: 0, currency: 'IDR', remark: '' });
const lineState = reactive<Record<string, any>>({});
const expandedLines = reactive<Record<string, boolean>>({});
const hasLineQuotes = computed(() => Boolean(lot.value?.lines?.length));
const lineColumns = computed(() => lot.value?.uiSchema?.lineColumns ?? []);
const supplierRequiredColumns = computed(() => lineColumns.value.filter((col: any) => Boolean(col.required)));
const procurementLineColumns = computed(() => lineColumns.value.filter((col: any) => !col.required));

function fmt(value: string) { return dayjs(value).format('YYYY-MM-DD HH:mm'); }
function formatMoney(value: number, currency: string) { return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`; }
function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}
function lineTitle(line: any) {
  const first = procurementLineColumns.value.find((col: any) => line.dataJson?.[col.key]);
  return first ? `${first.label}: ${line.dataJson[first.key]}` : t('quote.lineDetails');
}
function lineFields(line: any) {
  return procurementLineColumns.value.map((col: any) => ({
    key: col.key,
    label: col.label,
    value: line.dataJson?.[col.key] || '—',
  }));
}
function primaryLineFields(line: any) {
  return lineFields(line).slice(0, 3);
}
function secondaryLineFields(line: any) {
  return lineFields(line).slice(3);
}
function toggleLine(lineId: string) {
  expandedLines[lineId] = !expandedLines[lineId];
}

const nextMaxPrice = computed(() => {
  if (quoteAbility.value?.nextMaxPrice !== undefined && quoteAbility.value?.nextMaxPrice !== null) return Number(quoteAbility.value.nextMaxPrice);
  if (!myQuote.value || !tender.value) return null;
  return Math.floor(Number(myQuote.value.totalPrice) * (1 - Number(tender.value.minDecrementPct ?? 0) / 100) * 100) / 100;
});
const localValidationMessage = computed(() => {
  if (!myQuote.value || !nextMaxPrice.value) return '';
  return Number(form.totalPrice) > nextMaxPrice.value ? t('quote.priceMustNotExceed', { amount: formatMoney(nextMaxPrice.value, form.currency) }) : '';
});
const quoteBlockReason = computed(() => {
  if (cooldownSecs.value > 0 || quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownWait', { seconds: cooldownSecs.value });
  return quoteAbility.value?.canSubmit === false ? quoteAbility.value?.reasonMessage ?? '' : '';
});
const quoteButtonText = computed(() => {
  if (quoteAbility.value?.reasonCode === 'REBID_LIMIT_REACHED') return t('quote.upperLimitReached');
  if (cooldownSecs.value > 0 || quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownShort', { seconds: cooldownSecs.value });
  return myQuote.value ? t('quote.rebid') : t('quote.submit');
});
const submitDisabled = computed(() => submitting.value || tender.value?.status !== 'open' || quoteAbility.value?.canSubmit === false || cooldownSecs.value > 0 || Boolean(localValidationMessage.value));

function startCooldown(seconds: number) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownSecs.value = Math.max(0, Math.ceil(seconds));
  cooldownTimer = setInterval(() => {
    cooldownSecs.value = Math.max(0, cooldownSecs.value - 1);
    if (cooldownSecs.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = undefined;
      refreshQuoteState(true).catch(() => undefined);
    }
  }, 1000);
}
function stopCooldown() {
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = undefined;
  cooldownSecs.value = 0;
}
function ensureLineState(line: any) {
  if (!lineState[line.id]) {
    lineState[line.id] = { price: 0, currency: 'IDR', items: {}, quote: null, ability: null, submitting: false, cooldownSecs: 0 };
  }
  return lineState[line.id];
}
function startLineCooldown(line: any, seconds: number) {
  const state = ensureLineState(line);
  if (lineTimers[line.id]) clearInterval(lineTimers[line.id]);
  state.cooldownSecs = Math.max(0, Math.ceil(seconds));
  lineTimers[line.id] = setInterval(() => {
    state.cooldownSecs = Math.max(0, state.cooldownSecs - 1);
    if (state.cooldownSecs <= 0 && lineTimers[line.id]) {
      clearInterval(lineTimers[line.id]);
      lineTimers[line.id] = undefined;
      refreshLineState(line, true).catch(() => undefined);
    }
  }, 1000);
}
function stopLineCooldown(lineId: string) {
  if (lineTimers[lineId]) clearInterval(lineTimers[lineId]);
  lineTimers[lineId] = undefined;
  if (lineState[lineId]) lineState[lineId].cooldownSecs = 0;
}

function applyQuoteState(data: any, preserve = false) {
  myQuote.value = data?.quote ?? null;
  quoteAbility.value = data?.ability ?? null;
  if (quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE' && quoteAbility.value?.retryAfterSeconds) startCooldown(Number(quoteAbility.value.retryAfterSeconds));
  else stopCooldown();
  if (myQuote.value && !preserve) {
    form.totalPrice = Number(myQuote.value.totalPrice);
    form.currency = myQuote.value.currency;
    form.remark = myQuote.value.remark ?? '';
    editing.value = false;
  }
}
async function refreshQuoteState(preserve = true) {
  const res = await api.get(`/api/quotes/lots/${lotId}/mine`);
  applyQuoteState(res.data.data, preserve);
}
async function refreshLineState(line: any, preserve = true) {
  const state = ensureLineState(line);
  const res = await api.get(`/api/quotes/lines/${line.id}/mine`);
  const data = res.data.data;
  state.quote = data?.quote ?? null;
  state.ability = data?.ability ?? null;
  state.currency = state.quote?.currency || lot.value?.budgetCurrency || tender.value?.baseCurrency || 'IDR';
  if (!preserve || !state.price) state.price = state.quote ? Number(state.quote.totalPrice) : state.price;
  if (!preserve) state.items = { ...(state.quote?.items ?? state.items ?? {}) };
  if (state.ability?.reasonCode === 'COOLDOWN_ACTIVE' && state.ability?.retryAfterSeconds) startLineCooldown(line, Number(state.ability.retryAfterSeconds));
  else stopLineCooldown(line.id);
}

function lineNextMax(lineId: string) {
  const state = lineState[lineId];
  if (state?.ability?.nextMaxPrice !== undefined && state?.ability?.nextMaxPrice !== null) return Number(state.ability.nextMaxPrice);
  if (!state?.quote || !tender.value) return null;
  return Math.floor(Number(state.quote.totalPrice) * (1 - Number(tender.value.minDecrementPct ?? 0) / 100) * 100) / 100;
}
function lineValidation(lineId: string) {
  const state = lineState[lineId];
  const max = lineNextMax(lineId);
  if (!state?.quote || max === null) return '';
  return Number(state.price) > max ? t('quote.priceMustNotExceed', { amount: formatMoney(max, state.currency) }) : '';
}
function getLineBlockReason(lineId: string) {
  const state = lineState[lineId];
  if (!state) return '';
  if (state.cooldownSecs > 0 || state.ability?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownWait', { seconds: state.cooldownSecs });
  if (state.ability?.reasonMessage) return state.ability.reasonMessage;
  return lineValidation(lineId);
}
function isLineSubmitDisabled(lineId: string) {
  const state = lineState[lineId];
  return !state || state.submitting || tender.value?.status !== 'open' || !state.price || state.cooldownSecs > 0 || state.ability?.canSubmit === false || Boolean(lineValidation(lineId));
}
function lineButtonText(lineId: string) {
  const state = lineState[lineId];
  if (state?.ability?.reasonCode === 'REBID_LIMIT_REACHED') return t('quote.upperLimitReached');
  if (state?.cooldownSecs > 0 || state?.ability?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownShort', { seconds: state.cooldownSecs });
  return state?.quote ? t('quote.rebid') : t('quote.submitShort');
}

function formatQuoteError(e: any) {
  const err = e.response?.data?.error ?? e.response?.data;
  if (err?.code === 'REBID_LIMIT_REACHED') return t('quote.cannotRebid');
  if (err?.code === 'COOLDOWN_ACTIVE') return t('quote.cooldownWait', { seconds: err.detail?.retry_after_seconds ?? 60 });
  if (err?.code === 'MIN_DECREMENT_FAIL') return t('error.quote.min_decrement_fail');
  return e.response?.data?.message || t('quote.submitFailed');
}

async function load() {
  loading.value = true;
  try {
    const lotRes = await api.get(`/api/tenders/lots/${lotId}`);
    lot.value = lotRes.data.data;
    tender.value = lot.value.tender;
    form.currency = lot.value?.budgetCurrency || tender.value?.baseCurrency || 'IDR';
    if (hasLineQuotes.value) {
      lot.value.lines.forEach(ensureLineState);
      await Promise.all(lot.value.lines.map((line: any) => refreshLineState(line, false)));
      return;
    }
    await refreshQuoteState(false);
  } finally {
    loading.value = false;
  }
}

async function startEdit() {
  await refreshQuoteState(true);
  if (quoteAbility.value?.canSubmit === false) {
    ElMessage.warning(quoteBlockReason.value || t('quote.cannotContinueRebid'));
    return;
  }
  form.totalPrice = nextMaxPrice.value ?? Number(myQuote.value.totalPrice);
  form.currency = myQuote.value.currency;
  form.remark = '';
  editing.value = true;
}
function cancelEdit() {
  if (myQuote.value) {
    form.totalPrice = Number(myQuote.value.totalPrice);
    form.currency = myQuote.value.currency;
    form.remark = myQuote.value.remark ?? '';
  }
  submitError.value = '';
  editing.value = false;
}
async function submitQuote() {
  await refreshQuoteState(true);
  if (submitDisabled.value) {
    submitError.value = quoteBlockReason.value || localValidationMessage.value || t('quote.cannotSubmitNow');
    return;
  }
  await ElMessageBox.confirm(t('quote.confirmLineQuoteMessage', { amount: formatMoney(Number(form.totalPrice), form.currency) }), t('quote.confirmQuote'), { confirmButtonText: t('quote.confirmSubmit'), cancelButtonText: t('common.cancel') });
  submitting.value = true;
  submitError.value = '';
  try {
    const res = await api.post('/api/quotes', { lotId, totalPrice: form.totalPrice, currency: form.currency, remark: form.remark });
    myQuote.value = res.data.data.quote;
    ElMessage.success(t('quote.submitted'));
    await refreshQuoteState(false);
  } catch (e: any) {
    submitError.value = formatQuoteError(e);
    await refreshQuoteState(true).catch(() => undefined);
  } finally {
    submitting.value = false;
  }
}
async function submitLineQuote(line: any) {
  await refreshLineState(line, true);
  const state = lineState[line.id];
  const reason = getLineBlockReason(line.id);
  if (reason) {
    ElMessage.warning(reason);
    return;
  }
  const missing = supplierRequiredColumns.value.find((col: any) => !String(state.items?.[col.key] ?? '').trim());
  if (missing) {
    ElMessage.warning(t('quote.fillRequired', { label: missing.label }));
    return;
  }
  await ElMessageBox.confirm(t('quote.confirmLineQuoteMessage', { amount: formatMoney(Number(state.price), state.currency) }), t('quote.confirmLineQuote'), { confirmButtonText: t('quote.confirmSubmit'), cancelButtonText: t('common.cancel') });
  state.submitting = true;
  try {
    await api.post(`/api/quotes/lines/${line.id}`, { totalPrice: state.price, currency: state.currency, items: state.items });
    ElMessage.success(t('quote.lineSubmitted'));
    await refreshLineState(line, false);
  } catch (e: any) {
    ElMessage.error(formatQuoteError(e));
    await refreshLineState(line, true).catch(() => undefined);
  } finally {
    state.submitting = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  Object.values(lineTimers).forEach((timer) => timer && clearInterval(timer));
});
</script>

<style scoped>
.mobile-quote { min-height: 100%; padding: 12px 16px 28px; }
.hero, .panel, .rule-grid > div, .line-card { border: 1px solid #e5e7eb; background: #fff; }
.hero { padding: 18px; border-radius: 12px; }
.meta-line { display: flex; justify-content: space-between; gap: 12px; color: #64748b; font-size: 12px; }
.meta-line em { font-style: normal; color: #16a34a; }
h1 { margin: 10px 0 8px; color: #0f172a; font-size: 22px; line-height: 1.25; }
.hero p { margin: 0; color: #475569; }
.rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
.rule-grid > div { padding: 12px; border-radius: 10px; }
.rule-grid span, .field span, .current-line span { display: block; margin-bottom: 5px; color: #94a3b8; font-size: 12px; }
.rule-grid strong, .current-line strong { color: #0f172a; font-size: 13px; }
.panel { padding: 14px; border-radius: 12px; }
h2 { margin: 0 0 12px; font-size: 16px; }
.current-quote { display: grid; gap: 6px; margin-bottom: 12px; }
.current-quote strong { color: #0f172a; font-size: 26px; }
.current-quote span { color: #64748b; font-size: 12px; }
.quote-form, .line-card { display: grid; gap: 12px; }
.line-card { margin-top: 12px; padding: 13px; border-radius: 12px; }
.line-title {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: #0f172a;
  text-align: left;
}
.line-title span { color: #64748b; }
.line-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line-title em { color: #0369a1; font-size: 12px; font-style: normal; }
.line-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.line-fields-extra { padding-top: 10px; border-top: 1px dashed #cbd5e1; }
.line-fields div { padding: 9px; border-radius: 8px; background: #f8fafc; }
.line-fields span { display: block; color: #94a3b8; font-size: 12px; }
.line-fields strong { color: #334155; font-size: 13px; font-weight: 500; word-break: break-word; }
.field input, .field select, .field textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 11px;
  background: #fff;
  color: #0f172a;
  font: inherit;
}
.field input:disabled { background: #f1f5f9; color: #94a3b8; }
.primary-action, .secondary-action { width: 100%; border: 0; border-radius: 9px; padding: 12px; font-weight: 600; }
.primary-action { background: #0369a1; color: #fff; }
.primary-action:disabled { background: #cbd5e1; color: #64748b; }
.secondary-action { background: #f1f5f9; color: #334155; }
.warning, .error { margin: 0; border-radius: 8px; padding: 10px; font-size: 13px; line-height: 1.5; }
.warning { background: #fffbeb; color: #92400e; }
.error { background: #fef2f2; color: #b91c1c; }
</style>
