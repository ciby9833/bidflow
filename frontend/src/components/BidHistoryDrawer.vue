<!--
文件：frontend/src/components/BidHistoryDrawer.vue
功能：供应商投标历史价格抽屉，支持标包报价与线路报价历史。
交互：由“我的投标”列表打开；调用本人历史报价接口，只展示当前供应商自己的价格版本。
作者：吴川
-->
<template>
  <el-drawer
    v-model="visible"
    class="bid-history-drawer"
    :size="drawerSize"
    :title="t('bidRecords.historyPrice')"
    destroy-on-close
  >
    <div v-if="record" class="history-shell">
      <section class="history-summary">
        <span class="mono">{{ record.tenderNo }}</span>
        <strong>{{ record.tenderTitle }}</strong>
        <small>{{ record.lotNo }} · {{ record.lotTitle }}</small>
      </section>

      <el-alert
        v-if="loadError"
        :title="loadError"
        type="error"
        show-icon
        :closable="false"
      />

      <template v-if="record.kind === 'line'">
        <el-collapse v-loading="loading" model-value="0" class="history-groups">
          <el-collapse-item
            v-for="(group, index) in lineGroups"
            :key="group.lineId"
            :name="String(index)"
          >
            <template #title>
              <span class="line-title">{{ group.title }}</span>
            </template>
            <HistoryTable :items="group.items" />
          </el-collapse-item>
        </el-collapse>
        <el-empty v-if="!loading && lineGroups.length === 0" :description="t('quote.noQuoteHistory')" />
      </template>

      <template v-else>
        <HistoryTable v-loading="loading" :items="lotHistory" />
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import {
  computed, defineComponent, h, ref, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { ElEmpty, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { api } from '../composables/useApi';

interface BidLineSummary {
  lineId: string;
  lineNo?: string;
  rowNo?: number;
  title?: string;
}

interface BidRecord {
  kind: 'lot' | 'line';
  tenderNo: string;
  tenderTitle: string;
  lotId: string;
  lotNo: string;
  lotTitle: string;
  lineSummaries?: BidLineSummary[];
}

interface QuoteHistoryItem {
  id: string;
  version: number;
  totalPrice: number | string;
  currency: string;
  isLatest: boolean;
  remark?: string;
  submittedAt?: string;
}

const props = defineProps<{
  modelValue: boolean;
  record?: BidRecord | null;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const { t, locale } = useI18n();
const loading = ref(false);
const loadError = ref('');
const lotHistory = ref<QuoteHistoryItem[]>([]);
const lineGroups = ref<Array<{ lineId: string; title: string; items: QuoteHistoryItem[] }>>([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const record = computed(() => props.record ?? null);
const drawerSize = computed(() => (record.value?.kind === 'line' ? '720px' : '560px'));

function formatMoney(value: number | string, currency?: string) {
  const amount = Number(value ?? 0).toLocaleString(locale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${amount} ${currency}` : amount;
}

function fmtDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : t('common.not_set');
}

function lineTitle(line: BidLineSummary, index: number) {
  const prefix = line.lineNo || (line.rowNo ? t('review.rowNo', { row: line.rowNo }) : `#${index + 1}`);
  return line.title ? `${prefix} · ${line.title}` : prefix;
}

async function loadHistory() {
  if (!visible.value || !record.value) return;
  loading.value = true;
  loadError.value = '';
  lotHistory.value = [];
  lineGroups.value = [];
  try {
    if (record.value.kind === 'line') {
      const lines = record.value.lineSummaries ?? [];
      const responses = await Promise.all(lines.map((line) => api.get(`/api/quotes/lines/${line.lineId}/mine/history`)));
      lineGroups.value = lines.map((line, index) => ({
        lineId: line.lineId,
        title: lineTitle(line, index),
        items: responses[index]?.data?.data ?? [],
      }));
      return;
    }
    const res = await api.get(`/api/quotes/lots/${record.value.lotId}/mine/history`);
    lotHistory.value = res.data.data ?? [];
  } catch {
    loadError.value = t('bidRecords.historyLoadFailed');
  } finally {
    loading.value = false;
  }
}

watch([visible, record], loadHistory, { immediate: true });

const HistoryTable = defineComponent({
  name: 'HistoryTable',
  props: {
    items: { type: Array<QuoteHistoryItem>, required: true },
  },
  setup(tableProps) {
    return () => {
      if (!tableProps.items.length) {
        return h(ElEmpty, { description: t('quote.noQuoteHistory') });
      }
      return h(ElTable, { data: tableProps.items, stripe: true, size: 'small' }, () => [
        h(ElTableColumn, {
          prop: 'version',
          label: t('quote.versionColumn'),
          width: 90,
          formatter: (row: QuoteHistoryItem) => `V${row.version}`,
        }),
        h(ElTableColumn, {
          label: t('quote.quoteAmount'),
          minWidth: 160,
          align: 'right',
        }, {
          default: ({ row }: { row: QuoteHistoryItem }) => h('span', { class: 'history-price' }, formatMoney(row.totalPrice, row.currency)),
        }),
        h(ElTableColumn, {
          label: t('common.status'),
          width: 100,
        }, {
          default: ({ row }: { row: QuoteHistoryItem }) => h(ElTag, {
            type: row.isLatest ? 'success' : 'info',
            size: 'small',
          }, () => (row.isLatest ? t('quote.current') : t('quote.history'))),
        }),
        h(ElTableColumn, {
          prop: 'remark',
          label: t('quote.remark'),
          minWidth: 160,
          showOverflowTooltip: true,
        }),
        h(ElTableColumn, {
          label: t('quote.submitTime'),
          width: 170,
        }, {
          default: ({ row }: { row: QuoteHistoryItem }) => fmtDate(row.submittedAt),
        }),
      ]);
    };
  },
});
</script>

<style scoped>
.history-shell {
  display: grid;
  gap: 14px;
}
.history-summary {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  line-height: 1.35;
}
.history-summary strong {
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}
.history-summary small {
  color: #64748b;
}
.mono {
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.history-groups {
  border-top: 0;
}
.line-title {
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-price {
  color: #0f172a;
  font-weight: 700;
}
@media (max-width: 640px) {
  :global(.bid-history-drawer) {
    width: 100% !important;
  }
}
</style>
