<!--
文件：frontend/src/views/quote/SupplierQuoteBidView.vue
功能：供应商 WEB 端报价提交页，只处理本供应商报价、改价、冷却与个人排名。
交互：调用 quote.controller.ts 的 submit/mine/my-rank 接口；通过 useWs.ts 订阅实时排名。
作者：吴川
-->
<template>
  <div v-loading="loading" class="supplier-quote-page">
    <header v-if="lot && tender" class="quote-head">
      <div>
        <div class="meta-line">
          <span>{{ tender.tenderNo }}</span>
          <el-tag :type="tender.status === 'open' ? 'success' : 'info'" size="small">{{ statusLabel(tender.status) }}</el-tag>
        </div>
        <h2>{{ lot.title }}</h2>
        <p>{{ tender.title }}</p>
      </div>
      <el-button :loading="loading" @click="load">
        <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
      </el-button>
    </header>

    <section v-if="tender" class="rule-grid">
      <div><span>{{ t('tenderCreate.bidDeadline') }}</span><strong>{{ tender.bidDeadline ? fmtDate(tender.bidDeadline) : t('common.not_set') }}</strong></div>
      <div><span>{{ t('quote.maxRebid') }}</span><strong>{{ t('quote.times', { count: tender.maxRebidCount }) }}</strong></div>
      <div><span>{{ t('quote.minDecrement') }}</span><strong>{{ Number(tender.minDecrementPct).toFixed(1) }}%</strong></div>
      <div><span>{{ t('quote.cooldownSeconds') }}</span><strong>{{ t('quote.seconds', { count: tender.cooldownSeconds }) }}</strong></div>
    </section>

    <section v-if="lot && tender" class="attachment-panel">
      <div class="attachment-head">
        <div>
          <h3>{{ t('quote.attachments') }}</h3>
          <p>{{ t('quote.attachmentsDesc') }}</p>
        </div>
        <el-button
          :loading="attachmentUploading"
          :disabled="attachments.length >= 5"
          @click="attachmentInput?.click()"
        >
          {{ t('quote.uploadAttachment') }}
        </el-button>
      </div>
      <input ref="attachmentInput" hidden type="file" accept=".pdf,image/*" @change="uploadAttachment" />
      <div v-if="attachments.length" class="attachment-list">
        <div v-for="(file, idx) in attachments" :key="file.key" class="attachment-row">
          <button type="button" class="attachment-link" @click="previewAttachment(file)">
            <span class="attachment-name">{{ file.name }}</span>
            <span class="attachment-size">{{ formatSize(file.size) }}</span>
          </button>
          <el-button text type="danger" size="small" @click="removeAttachment(idx)">
            {{ t('quote.removeAttachment') }}
          </el-button>
        </div>
      </div>
      <p v-else class="attachment-empty">{{ t('quote.attachmentEmpty') }}</p>
    </section>

    <section v-if="hasLineQuotes" class="line-quote-panel">
      <div class="line-panel-head">
        <div>
          <h3>{{ t('quote.lineQuote') }}</h3>
          <p>{{ t('quote.lineQuoteDesc', { round: tender?.currentQuoteRound ?? 1 }) }}</p>
        </div>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
        </el-button>
      </div>
      <el-table :data="lot.lines" border stripe class="line-quote-table">
        <el-table-column label="#" width="58" fixed>
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column
          v-for="col in procurementLineColumns"
          :key="col.key"
          :label="col.label"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.dataJson?.[col.key] || '—' }}</template>
        </el-table-column>
        <el-table-column
          v-if="supplierRequiredColumns.length"
          :label="t('quote.requiredFields')"
          min-width="280"
          fixed="right"
        >
          <template #default="{ row }">
            <div v-if="lineState[row.id]" class="supplier-required-fields">
              <el-input
                v-for="col in supplierRequiredColumns"
                :key="col.key"
                v-model="lineState[row.id].items[col.key]"
                size="small"
                clearable
                :placeholder="`${col.label} *`"
                :disabled="tender?.status !== 'open'"
              />
            </div>
            <span v-else class="muted">{{ t('quote.loading') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('quote.myQuote')" width="190" fixed="right">
          <template #default="{ row }">
            <strong v-if="lineState[row.id]?.quote">{{ formatMoney(Number(lineState[row.id].quote.totalPrice), lineState[row.id].quote.currency) }}</strong>
            <span v-else class="muted">{{ t('quote.unquoted') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('quote.rank')" width="120" fixed="right">
          <template #default="{ row }">
            <span v-if="lineState[row.id]?.rank?.hasQuote">
              {{ lineState[row.id].rank.isLeading ? t('quote.leading') : `#${lineState[row.id].rank.myRank} / ${lineState[row.id].rank.total}` }}
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('quote.thisQuote')" width="300" fixed="right">
          <template #default="{ row }">
            <div v-if="lineState[row.id]" class="line-submit">
              <el-input-number
                v-model="lineState[row.id].price"
                :min="0.01"
                :precision="2"
                controls-position="right"
                :disabled="tender?.status !== 'open' || lineState[row.id].ability?.canSubmit === false || lineState[row.id].refreshing"
              />
              <el-button
                type="primary"
                :loading="lineState[row.id].submitting || lineState[row.id].refreshing"
                :disabled="isLineSubmitDisabled(row.id)"
                @click="submitLineQuote(row)"
              >
                {{ getLineSubmitButtonText(row.id) }}
              </el-button>
              <small v-if="getLineBlockReason(row.id)" class="line-submit-reason">{{ getLineBlockReason(row.id) }}</small>
            </div>
            <span v-else class="muted">{{ t('quote.loading') }}</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-if="myQuote && !hasLineQuotes" class="rebid-guide">
      <div>
        <span>{{ t('quote.currentQuote') }}</span>
        <strong>{{ formatMoney(Number(myQuote.totalPrice), myQuote.currency) }}</strong>
      </div>
      <div>
        <span>{{ t('quote.nextMaxPrice') }}</span>
        <strong>{{ nextMaxPrice ? formatMoney(nextMaxPrice, form.currency) : '—' }}</strong>
      </div>
      <div>
        <span>{{ t('quote.rebidRequirement') }}</span>
        <strong>{{ t('quote.mustLowerBy', { pct: Number(tender?.minDecrementPct ?? 0).toFixed(1) }) }}</strong>
      </div>
      <div>
        <span>{{ t('quote.quoteStatus') }}</span>
        <strong :class="{ blocked: quoteAbility?.canSubmit === false }">
          {{ quoteBlockReason || t('quote.remainingRebids', { count: quoteAbility?.remainingRebidCount ?? tender?.maxRebidCount ?? 0 }) }}
        </strong>
      </div>
    </section>

    <el-card v-if="auth.user?.supplierId && !hasLineQuotes" class="rank-card">
      <div class="rank-status">
        <div>
          <span class="rank-label">{{ t('quote.my_rank') }}</span>
          <strong class="rank-value" :class="{ leading: isLeading }">
            <template v-if="myRank !== null">
              {{ isLeading ? t('quote.rank_leading') : `#${myRank} / ${total}` }}
            </template>
            <template v-else>{{ t('quote.noQuote') }}</template>
          </strong>
        </div>
        <el-tag :type="connected ? 'success' : 'warning'" size="small">
          {{ connected ? t('quote.realtime') : t('quote.polling') }}
        </el-tag>
      </div>
    </el-card>

    <el-card v-if="myQuote && !editing && !hasLineQuotes" class="quote-card">
      <template #header>
        <div class="card-head">
          <span>{{ t('quote.currentQuote') }}</span>
          <el-button
            v-if="tender?.status === 'open'"
            type="primary"
            :loading="statusRefreshing"
            :disabled="cooldownSecs > 0 || quoteAbility?.canSubmit === false || statusRefreshing"
            @click="startEdit"
          >
            {{ currentQuoteActionText }}
          </el-button>
        </div>
      </template>
      <div class="current-quote">
        <strong>{{ formatMoney(Number(myQuote.totalPrice), myQuote.currency) }}</strong>
        <span>{{ t('quote.version', { version: myQuote.version }) }} · {{ fmtDate(myQuote.submittedAt) }}</span>
        <p v-if="myQuote.remark">{{ myQuote.remark }}</p>
        <el-alert
          v-if="quoteBlockReason"
          :title="quoteBlockReason"
          type="warning"
          show-icon
          :closable="false"
        />
      </div>
    </el-card>

    <el-card v-if="(!myQuote || editing) && !hasLineQuotes" class="quote-card">
      <template #header>
        <div class="card-head">
          <span>{{ isRebid ? t('quote.changeQuote') : t('quote.submit') }}</span>
          <el-button v-if="isRebid" text @click="cancelEdit">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
      <el-alert
        v-if="tender && tender.status !== 'open'"
        :title="t('quote.cannotSubmitNotOpen')"
        type="info"
        show-icon
        :closable="false"
        class="form-alert"
      />
      <el-form :model="form" label-position="top" @submit.prevent="submitQuote">
        <div class="form-grid">
          <el-form-item :label="t('quote.total_price')" required>
            <el-input-number v-model="form.totalPrice" :min="0.01" :precision="2" style="width:100%" controls-position="right" />
          </el-form-item>
          <el-form-item :label="t('quote.currency')" required>
            <el-select v-model="form.currency" style="width:100%">
              <el-option value="IDR" :label="t('currency.idr')" />
              <el-option value="USD" :label="t('currency.usd')" />
              <el-option value="CNY" :label="t('currency.cny')" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('quote.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="3" />
        </el-form-item>
        <el-alert
          v-if="localValidationMessage"
          :title="localValidationMessage"
          type="warning"
          show-icon
          :closable="false"
          class="form-alert"
        />
        <el-alert
          v-if="quoteBlockReason"
          :title="quoteBlockReason"
          type="warning"
          show-icon
          :closable="false"
          class="form-alert"
        />
        <el-alert
          v-if="cooldownSecs > 0"
          :title="t('quote.cooldownWait', { seconds: cooldownSecs })"
          type="warning"
          show-icon
          :closable="false"
          class="form-alert"
        />
        <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false" class="form-alert" />
        <el-button
          type="primary"
          native-type="submit"
          size="large"
          :loading="submitting || statusRefreshing"
          :disabled="submitDisabled || statusRefreshing"
        >
          {{ submitButtonText }}
        </el-button>
      </el-form>
    </el-card>

    <el-card v-if="!hasLineQuotes" class="quote-card">
      <template #header>{{ t('quote.myQuoteHistory') }}</template>
      <el-table :data="quoteHistory" stripe>
        <el-table-column prop="version" :label="t('quote.versionColumn')" width="90">
          <template #default="{ row }">V{{ row.version }}</template>
        </el-table-column>
        <el-table-column :label="t('quote.quoteAmount')" width="180">
          <template #default="{ row }">{{ formatMoney(Number(row.totalPrice), row.currency) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isLatest ? 'success' : 'info'" size="small">{{ row.isLatest ? t('quote.current') : t('quote.history') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" :label="t('quote.remark')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="t('quote.submitTime')" width="180">
          <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onActivated, onBeforeUnmount, onMounted, reactive, ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';
import { useWs } from '../../composables/useWs';

const { t } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const lotId = route.params.lotId as string;

const lot = ref<any>(null);
const tender = ref<any>(null);
const myQuote = ref<any | null>(null);
const quoteAbility = ref<any | null>(null);
const quoteHistory = ref<any[]>([]);
const loading = ref(false);
const submitting = ref(false);
const statusRefreshing = ref(false);
const submitError = ref('');
const cooldownSecs = ref(0);
const idempotencyKey = ref<string | null>(null);
const editing = ref(false);
const isRebid = computed(() => !!myQuote.value);
let cooldownTimer: ReturnType<typeof setInterval> | undefined;

// ── 标包级投标附件 ──
const attachmentInput = ref<HTMLInputElement | null>(null);
const attachments = ref<Array<{ key: string; name: string; size: number; mimeType?: string; fileUrl?: string }>>([]);
const attachmentUploading = ref(false);

const form = reactive({ totalPrice: 0, currency: 'IDR', remark: '' });
const lineState = reactive<Record<string, {
  price: number;
  currency: string;
  items: Record<string, unknown>;
  quote: any | null;
  ability: any | null;
  rank: any | null;
  submitting: boolean;
  refreshing: boolean;
  cooldownSecs: number;
}>>({});
const lineCooldownTimers: Record<string, ReturnType<typeof setInterval> | undefined> = {};
const supplierId = auth.user?.supplierId ?? '';
const { myRank, total, isLeading, connected } = useWs(lotId, supplierId);
const hasLineQuotes = computed(() => Boolean(lot.value?.lines?.length));
const lineColumns = computed(() => lot.value?.uiSchema?.lineColumns ?? []);
const supplierRequiredColumns = computed(() => lineColumns.value.filter((col: any) => Boolean(col.required)));
const procurementLineColumns = computed(() => lineColumns.value.filter((col: any) => !col.required));

const quoteErrorKeys: Record<string, string> = {
  COOLDOWN_ACTIVE: 'error.quote.cooldown_active',
  REBID_LIMIT_REACHED: 'error.quote.rebid_limit_reached',
  MIN_DECREMENT_FAIL: 'error.quote.min_decrement_fail',
  LINE_REQUIRED_FIELD_MISSING: 'quote.fillRequired',
  error_quote_cooldown_active: 'error.quote.cooldown_active',
  error_quote_rebid_limit_reached: 'error.quote.rebid_limit_reached',
  error_quote_min_decrement_fail: 'error.quote.min_decrement_fail',
  error_quote_deadline_passed: 'error.quote.deadline_passed',
  error_quote_tender_not_open: 'error.quote.tender_not_open',
  error_quote_concurrent_submit: 'error.quote.concurrent_submit',
};

function fmtDate(iso: string) { return dayjs(iso).format('YYYY-MM-DD HH:mm'); }

function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function loadAttachments() {
  try {
    const res = await api.get(`/api/quotes/lots/${lotId}/attachments/mine`);
    attachments.value = res.data.data?.attachments ?? [];
  } catch {
    attachments.value = [];
  }
}

async function persistAttachments() {
  await api.put(`/api/quotes/lots/${lotId}/attachments`, { attachments: attachments.value });
}

async function uploadAttachment(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (attachments.value.length >= 5) {
    ElMessage.warning(t('quote.attachmentMax'));
    input.value = '';
    return;
  }
  attachmentUploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/uploads/quote-attachments', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const up = res.data.data;
    attachments.value.push({
      key: up.objectKey, name: up.fileName, size: up.fileSize, mimeType: up.mimeType, fileUrl: up.fileUrl,
    });
    await persistAttachments();
    ElMessage.success(t('quote.attachmentSaved'));
  } finally {
    attachmentUploading.value = false;
    input.value = '';
  }
}

async function removeAttachment(index: number) {
  const file = attachments.value[index];
  await ElMessageBox.confirm(
    t('quote.confirmRemoveAttachment', { name: file?.name ?? '' }),
    t('quote.removeAttachment'),
    { type: 'warning', confirmButtonText: t('quote.removeAttachment'), cancelButtonText: t('common.cancel') },
  );
  attachments.value.splice(index, 1);
  await persistAttachments();
  ElMessage.success(t('quote.attachmentSaved'));
}

function previewAttachment(file: any) {
  const url = file.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(file.key)}`;
  window.open(url, '_blank');
}
function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}
function statusLabel(status: string) {
  return status ? t(`tender.status.${status}`) : '';
}

const nextMaxPrice = computed(() => {
  if (quoteAbility.value?.nextMaxPrice !== undefined && quoteAbility.value?.nextMaxPrice !== null) {
    return Number(quoteAbility.value.nextMaxPrice);
  }
  if (!myQuote.value || !tender.value) return null;
  const lastPrice = Number(myQuote.value.totalPrice);
  const minPct = Number(tender.value.minDecrementPct ?? 0);
  return Math.floor(lastPrice * (1 - minPct / 100) * 100) / 100;
});

const rebidLimitReached = computed(() => {
  return quoteAbility.value?.reasonCode === 'REBID_LIMIT_REACHED';
});

const localValidationMessage = computed(() => {
  if (rebidLimitReached.value) return '';
  if (!isRebid.value || !nextMaxPrice.value) return '';
  if (Number(form.totalPrice) > nextMaxPrice.value) return t('quote.priceMustNotExceed', { amount: formatMoney(nextMaxPrice.value, form.currency) });
  return '';
});

const submitDisabled = computed(() => {
  return !tender.value
    || tender.value.status !== 'open'
    || cooldownSecs.value > 0
    || quoteAbility.value?.canSubmit === false
    || rebidLimitReached.value
    || Boolean(localValidationMessage.value);
});

const currentQuoteActionText = computed(() => {
  if (quoteAbility.value?.reasonCode === 'REBID_LIMIT_REACHED') return t('quote.upperLimitReached');
  if (cooldownSecs.value > 0 || quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownShort', { seconds: cooldownSecs.value });
  return t('quote.rebid');
});

const submitButtonText = computed(() => {
  if (quoteAbility.value?.reasonCode === 'REBID_LIMIT_REACHED') return t('quote.upperLimitReached');
  if (cooldownSecs.value > 0 || quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownShort', { seconds: cooldownSecs.value });
  return isRebid.value ? t('quote.rebid') : t('quote.submit');
});

const quoteBlockReason = computed(() => {
  if (cooldownSecs.value > 0 || quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE') {
    return t('quote.cooldownWait', { seconds: cooldownSecs.value });
  }
  return quoteAbility.value?.canSubmit === false ? quoteAbility.value?.reasonMessage ?? '' : '';
});

function extractQuoteError(e: any) {
  const data = e.response?.data;
  if (!data) return null;
  if (data.code || data.message_key || data.detail) return data;
  return data.error ?? (typeof data.message === 'object' ? data.message : null);
}

function readableMessageKey(key?: string) {
  if (!key) return '';
  const normalized = key.replace(/\./g, '_');
  if (quoteErrorKeys[normalized]) return t(quoteErrorKeys[normalized]);
  return key.startsWith('error.') ? t(key) : key;
}

function formatQuoteError(e: any, fallback = t('quote.submitFailed')) {
  const err = extractQuoteError(e);
  if (err?.code && quoteErrorKeys[err.code]) return t(quoteErrorKeys[err.code], { label: t('quote.requiredFields') });
  if (err?.message_key) return readableMessageKey(err.message_key);
  const message = e.response?.data?.message;
  if (typeof message === 'string') return readableMessageKey(message);
  const error = e.response?.data?.error;
  if (typeof error === 'string' && quoteErrorKeys[error]) return t(quoteErrorKeys[error], { label: t('quote.requiredFields') });
  return fallback;
}

function getLineNextMaxPrice(lineId: string) {
  const state = lineState[lineId];
  if (state?.ability?.nextMaxPrice !== undefined && state?.ability?.nextMaxPrice !== null) {
    return Number(state.ability.nextMaxPrice);
  }
  if (!state?.quote || !tender.value) return null;
  const lastPrice = Number(state.quote.totalPrice);
  const minPct = Number(tender.value.minDecrementPct ?? 0);
  return Math.floor(lastPrice * (1 - minPct / 100) * 100) / 100;
}

function isLineRebidLimitReached(lineId: string) {
  return lineState[lineId]?.ability?.reasonCode === 'REBID_LIMIT_REACHED';
}

function getLineQuoteValidationMessage(lineId: string) {
  if (isLineRebidLimitReached(lineId)) return '';
  const state = lineState[lineId];
  const nextMax = getLineNextMaxPrice(lineId);
  if (!state?.quote || nextMax === null) return '';
  if (Number(state.price) > nextMax) {
    return t('quote.minDecrementNotMetMax', { amount: formatMoney(nextMax, state.currency) });
  }
  return '';
}

function getLineBlockReason(lineId: string) {
  const state = lineState[lineId];
  if (!state) return '';
  if (state.cooldownSecs > 0 || state.ability?.reasonCode === 'COOLDOWN_ACTIVE') {
    return t('quote.cooldownWait', { seconds: state.cooldownSecs });
  }
  if (state.ability?.reasonMessage) return state.ability.reasonMessage;
  if (tender.value?.status !== 'open') return t('quote.notOpenShort');
  if (!state.price) return t('quote.enterThisQuote');
  if (isLineRebidLimitReached(lineId)) return t('quote.cannotRebid');
  return getLineQuoteValidationMessage(lineId);
}

function isLineSubmitDisabled(lineId: string) {
  const state = lineState[lineId];
  return !state
    || state.submitting
    || state.refreshing
    || tender.value?.status !== 'open'
    || !state.price
    || state.cooldownSecs > 0
    || state.ability?.canSubmit === false
    || isLineRebidLimitReached(lineId)
    || Boolean(getLineQuoteValidationMessage(lineId));
}

function getLineSubmitButtonText(lineId: string) {
  if (isLineRebidLimitReached(lineId)) return t('quote.upperLimitReached');
  const state = lineState[lineId];
  if (state?.cooldownSecs > 0 || state?.ability?.reasonCode === 'COOLDOWN_ACTIVE') return t('quote.cooldownShort', { seconds: state.cooldownSecs });
  return lineState[lineId]?.quote ? t('quote.rebid') : t('quote.submitShort');
}

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
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = undefined;
  }
  cooldownSecs.value = 0;
}

function startLineCooldown(line: any, seconds: number) {
  const state = ensureLineState(line);
  if (lineCooldownTimers[line.id]) clearInterval(lineCooldownTimers[line.id]);
  state.cooldownSecs = Math.max(0, Math.ceil(seconds));
  lineCooldownTimers[line.id] = setInterval(() => {
    state.cooldownSecs = Math.max(0, state.cooldownSecs - 1);
    if (state.cooldownSecs <= 0 && lineCooldownTimers[line.id]) {
      clearInterval(lineCooldownTimers[line.id]);
      lineCooldownTimers[line.id] = undefined;
      refreshLineQuoteState(line, true).catch(() => undefined);
    }
  }, 1000);
}

function stopLineCooldown(lineId: string) {
  if (lineCooldownTimers[lineId]) {
    clearInterval(lineCooldownTimers[lineId]);
    lineCooldownTimers[lineId] = undefined;
  }
  if (lineState[lineId]) lineState[lineId].cooldownSecs = 0;
}

function applyQuoteState(data: any, preserveForm = false) {
  myQuote.value = data?.quote !== undefined ? data.quote : data;
  quoteAbility.value = data?.ability ?? null;
  if (quoteAbility.value?.reasonCode === 'COOLDOWN_ACTIVE' && quoteAbility.value?.retryAfterSeconds) {
    startCooldown(Number(quoteAbility.value.retryAfterSeconds));
  } else if (quoteAbility.value?.reasonCode !== 'COOLDOWN_ACTIVE') {
    stopCooldown();
  }
  if (myQuote.value && !preserveForm) {
    form.totalPrice = Number(myQuote.value.totalPrice);
    form.currency = myQuote.value.currency;
    form.remark = myQuote.value.remark ?? '';
    editing.value = false;
  }
}

async function refreshQuoteState(preserveForm = true, includeHistory = false) {
  const mineReq = api.get(`/api/quotes/lots/${lotId}/mine`);
  if (includeHistory) {
    const [mineRes, historyRes] = await Promise.all([
      mineReq,
      api.get(`/api/quotes/lots/${lotId}/mine/history`),
    ]);
    applyQuoteState(mineRes.data.data, preserveForm);
    quoteHistory.value = historyRes.data.data ?? [];
    return;
  }
  const mineRes = await mineReq;
  applyQuoteState(mineRes.data.data, preserveForm);
}

function ensureLineState(line: any) {
  if (!lineState[line.id]) {
    lineState[line.id] = {
      price: 0,
      currency: lot.value?.budgetCurrency || tender.value?.baseCurrency || 'IDR',
      items: {},
      quote: null,
      ability: null,
      rank: null,
      submitting: false,
      refreshing: false,
      cooldownSecs: 0,
    };
  }
  return lineState[line.id];
}

async function refreshLineQuoteState(line: any, preserveDraft = true) {
  const state = ensureLineState(line);
  state.refreshing = true;
  try {
    const [quoteRes, rankRes] = await Promise.all([
      api.get(`/api/quotes/lines/${line.id}/mine`),
      api.get(`/api/quotes/lines/${line.id}/my-rank`),
    ]);
    const quoteData = quoteRes.data.data;
    const quote = quoteData?.quote !== undefined ? quoteData.quote : quoteData;
    state.quote = quote;
    state.ability = quoteData?.ability ?? null;
    if (state.ability?.reasonCode === 'COOLDOWN_ACTIVE' && state.ability?.retryAfterSeconds) {
      startLineCooldown(line, Number(state.ability.retryAfterSeconds));
    } else if (state.ability?.reasonCode !== 'COOLDOWN_ACTIVE') {
      stopLineCooldown(line.id);
    }
    state.rank = rankRes.data.data;
    state.currency = quote?.currency || lot.value?.budgetCurrency || tender.value?.baseCurrency || 'IDR';
    if (!preserveDraft || !state.price) {
      state.price = quote ? Number(quote.totalPrice) : state.price;
    }
    if (!preserveDraft) {
      state.items = { ...(quote?.items ?? state.items ?? {}) };
    }
  } finally {
    state.refreshing = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const lotRes = await api.get(`/api/tenders/lots/${lotId}`);
    lot.value = lotRes.data.data;
    tender.value = lotRes.data.data.tender;
    form.currency = lot.value?.budgetCurrency || tender.value?.baseCurrency || 'IDR';

    await loadAttachments();

    if (lot.value?.lines?.length) {
      await loadLineQuoteState();
      return;
    }

    await refreshQuoteState(false, true);
  } finally {
    loading.value = false;
  }
}

async function loadLineQuoteState() {
  const lines = lot.value?.lines ?? [];
  await Promise.all(lines.map(async (line: any) => {
    await refreshLineQuoteState(line, false);
  }));
}

async function submitLineQuote(line: any) {
  await refreshLineQuoteState(line, true);
  const state = lineState[line.id];
  const blockReason = getLineBlockReason(line.id);
  if (blockReason) {
    ElMessage.warning(blockReason);
    return;
  }
  if (!state) return;
  const missingColumn = supplierRequiredColumns.value.find((col: any) => !String(state.items?.[col.key] ?? '').trim());
  if (missingColumn) {
    ElMessage.warning(t('quote.fillRequired', { label: missingColumn.label }));
    return;
  }
  const validationMessage = getLineQuoteValidationMessage(line.id);
  if (validationMessage) {
    ElMessage.warning(validationMessage);
    return;
  }
  await ElMessageBox.confirm(
    t('quote.confirmLineQuoteMessage', { amount: formatMoney(Number(state.price), state.currency) }),
    t('quote.confirmLineQuote'),
    {
      type: 'warning',
      confirmButtonText: t('quote.confirmSubmit'),
      cancelButtonText: t('common.cancel'),
    },
  );
  state.submitting = true;
  try {
    const res = await api.post(`/api/quotes/lines/${line.id}`, {
      totalPrice: state.price,
      currency: state.currency,
      items: state.items,
    });
    state.quote = res.data.data.quote;
    ElMessage.success(t('quote.lineSubmitted'));
    await loadLineQuoteState();
  } catch (e: any) {
    const err = extractQuoteError(e);
    if (err?.code === 'COOLDOWN_ACTIVE') {
      ElMessage.error(t('quote.cooldownWait', { seconds: err.detail?.retry_after_seconds ?? 60 }));
      await refreshLineQuoteState(line, true);
      return;
    }
    if (err?.code === 'MIN_DECREMENT_FAIL') {
      const required = Number(err.detail?.required_price);
      ElMessage.error(Number.isFinite(required)
        ? t('quote.minDecrementNotMetMax', { amount: formatMoney(required, state.currency) })
        : t('error.quote.min_decrement_fail'));
      await refreshLineQuoteState(line, true);
      return;
    }
    if (err?.code === 'REBID_LIMIT_REACHED') {
      ElMessage.error(t('quote.cannotRebid'));
      await loadLineQuoteState();
      return;
    }
    if (err?.code === 'LINE_REQUIRED_FIELD_MISSING') {
      ElMessage.error(t('quote.fillRequired', { label: err.detail?.label ?? t('quote.requiredFields') }));
      return;
    }
    ElMessage.error(formatQuoteError(e));
  } finally {
    state.submitting = false;
  }
}

function startEdit() {
  statusRefreshing.value = true;
  refreshQuoteState(true)
    .then(() => {
      if (!myQuote.value) return;
      if (quoteAbility.value?.canSubmit === false) {
        ElMessage.warning(quoteBlockReason.value || t('quote.cannotContinueRebid'));
        return;
      }
      form.totalPrice = nextMaxPrice.value ?? Number(myQuote.value.totalPrice);
      form.currency = myQuote.value.currency;
      form.remark = '';
      submitError.value = '';
      editing.value = true;
    })
    .catch((e: any) => {
      ElMessage.error(formatQuoteError(e, t('quote.refreshQuoteFailed')));
    })
    .finally(() => {
      statusRefreshing.value = false;
    });
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
  statusRefreshing.value = true;
  try {
    await refreshQuoteState(true);
  } finally {
    statusRefreshing.value = false;
  }
  if (submitDisabled.value) {
    submitError.value = quoteBlockReason.value
      || localValidationMessage.value
      || (cooldownSecs.value > 0 ? t('quote.cooldownWait', { seconds: cooldownSecs.value }) : '');
    return;
  }
  await ElMessageBox.confirm(
    t('quote.confirmQuoteMessage', { action: isRebid.value ? t('quote.changeQuote') : t('quote.submit'), amount: formatMoney(Number(form.totalPrice), form.currency) }),
    isRebid.value ? t('quote.confirmRebid') : t('quote.confirmQuote'),
    {
      type: 'warning',
      confirmButtonText: t('quote.confirmSubmit'),
      cancelButtonText: t('common.cancel'),
    },
  );
  submitting.value = true;
  submitError.value = '';
  try {
    const payload: any = {
      lotId,
      totalPrice: form.totalPrice,
      currency: form.currency,
      remark: form.remark,
    };
    if (idempotencyKey.value) payload.idempotencyKey = idempotencyKey.value;

    const res = await api.post('/api/quotes', payload);
    idempotencyKey.value = res.data.data.idempotencyKey;
    myQuote.value = res.data.data.quote;
    ElMessage.success(t('quote.submitted'));
    editing.value = false;
    await load();
  } catch (e: any) {
    const err = extractQuoteError(e);
    if (err?.code === 'COOLDOWN_ACTIVE') {
      startCooldown(err.detail?.retry_after_seconds ?? 60);
      submitError.value = t('quote.cooldownWait', { seconds: cooldownSecs.value });
      await refreshQuoteState(true, true);
      return;
    }
    if (err?.code === 'MIN_DECREMENT_FAIL') {
      const required = Number(err.detail?.required_price);
      submitError.value = Number.isFinite(required)
        ? t('quote.minDecrementNotMetMax', { amount: formatMoney(required, form.currency) })
        : t('error.quote.min_decrement_fail');
      await refreshQuoteState(true, true);
      return;
    }
    if (err?.code === 'REBID_LIMIT_REACHED') {
      submitError.value = t('quote.cannotRebid');
      await load();
      return;
    }
    submitError.value = formatQuoteError(e);
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
onActivated(load);
onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  Object.values(lineCooldownTimers).forEach((timer) => {
    if (timer) clearInterval(timer);
  });
});
</script>

<style scoped>
.supplier-quote-page { display: grid; gap: 16px; }
.quote-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
}
.meta-line { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; color: #64748b; font-size: 13px; }
.quote-head h2 { margin: 0; color: #0f172a; font-size: 24px; }
.quote-head p { margin: 8px 0 0; color: #64748b; }
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.rule-grid div {
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}
.rule-grid span, .rank-label { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 6px; }
.rule-grid strong { color: #0f172a; }
.rebid-guide {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  padding: 16px;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  background: #eff6ff;
}
.rebid-guide span { display: block; color: #64748b; font-size: 12px; margin-bottom: 6px; }
.rebid-guide strong { color: #0f172a; }
.line-quote-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.attachment-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 16px 20px;
}
.attachment-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.attachment-head h3 { margin: 0; font-size: 16px; color: #0f172a; }
.attachment-head p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
.attachment-list { display: grid; gap: 8px; margin-top: 12px; }
.attachment-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.attachment-link {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.attachment-link:hover .attachment-name { color: #2563eb; }
.attachment-name { flex: 1; font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.attachment-size { font-size: 12px; color: #94a3b8; flex-shrink: 0; }
.attachment-empty { margin: 12px 0 0; font-size: 13px; color: #94a3b8; }
.line-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.line-panel-head h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}
.line-panel-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}
.line-quote-table { width: 100%; }
.line-submit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.line-submit-reason {
  grid-column: 1 / -1;
  color: #b45309;
  line-height: 1.4;
}
.supplier-required-fields {
  display: grid;
  gap: 8px;
}
.muted { color: #94a3b8; }
.rank-card, .quote-card { border-radius: 14px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.current-quote { display: grid; gap: 8px; }
.current-quote strong { color: #0f172a; font-size: 28px; line-height: 1; }
.current-quote span { color: #64748b; }
.current-quote p { margin: 0; color: #475569; }
.rank-status { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.rank-value { display: block; color: #0f172a; font-size: 22px; }
.rank-value.leading { color: #16a34a; }
.form-grid { display: grid; grid-template-columns: 1fr 220px; gap: 16px; }
.form-alert { margin-bottom: 12px; }
@media (max-width: 768px) {
  .quote-head { flex-direction: column; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
