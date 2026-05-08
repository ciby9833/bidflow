<!--
文件：frontend/src/views/tender/TenderDetailView.vue
功能：公司 WEB 端招标详情页，展示招标信息、标包列表并提供发布、开始报价、关标、导出和报价评审入口。
交互：调用 tender.controller.ts 与 export.controller.ts；通过路由跳转 CompanyQuoteReviewView.vue。
作者：吴川
-->
<template>
  <div v-loading="loading" class="tender-detail">
    <template v-if="tender">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="header-meta">
            <span class="tender-no">{{ tender.tenderNo }}</span>
            <el-tag :type="statusTag(tender.status)" size="small">{{ t(`tender.status.${tender.status}`) }}</el-tag>
            <el-tag :type="tender.participationMode === 'selected' ? 'warning' : 'info'" effect="plain" size="small">
              {{ tender.participationMode === 'selected' ? t('tenderCreate.directedTender') : t('supplierTenderHall.publicTender') }}
            </el-tag>
          </div>
          <h2 class="tender-title">{{ tender.title }}</h2>
          <p v-if="tender.description" class="tender-desc">{{ tender.description }}</p>
        </div>
        <div class="header-actions">
          <el-button :loading="loading" @click="load">
            <el-icon><Refresh /></el-icon>{{ t('common.refresh') }}
          </el-button>
          <el-button
            v-if="tender.status === 'draft' && auth.hasScope('tender:edit')"
            @click="router.push(`/tenders/${tender.id}/edit`)"
          >{{ t('tenderDetail.editDraft') }}</el-button>
          <el-button
            v-if="tender.status === 'draft' && auth.hasScope('tender:publish')"
            type="primary"
            @click="doPublish"
          >{{ t('tender.publish') }}</el-button>
          <el-button
            v-if="['published', 'open'].includes(tender.status) && auth.hasScope('tender:publish')"
            plain
            @click="doWithdraw"
          >{{ t('tenderList.confirmWithdraw') }}</el-button>
          <el-button
            v-if="tender.status === 'published' && auth.hasScope('tender:publish')"
            type="success"
            @click="doOpen"
          >{{ t('tender.open_bidding') }}</el-button>
          <el-button
            v-if="['published', 'open'].includes(tender.status) && auth.hasScope('tender:close')"
            type="danger"
            @click="doClose"
          >{{ t('tender.close_bidding') }}</el-button>
          <el-button
            v-if="['closed', 'open', 'published'].includes(tender.status) && auth.hasScope('tender:edit')"
            @click="startNextRound"
          >{{ t('tenderDetail.nextRound') }}</el-button>
          <el-button v-if="auth.hasScope('export:masked') || auth.hasScope('export:full')" @click="openExportDialog">
            {{ t('export.export') }} <el-icon class="el-icon--right"><arrow-down /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- Info strip -->
      <div class="info-strip">
        <div class="info-item">
          <span class="info-label">{{ t('common.type') }}</span>
          <span class="info-value">{{ t(`tender.${tender.type}`) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('common.currency') }}</span>
          <span class="info-value">{{ tender.baseCurrency }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderCreate.bidStart') }}</span>
          <span class="info-value">{{ tender.bidStartAt ? fmtDate(tender.bidStartAt) : t('tenderDetail.startAfterPublish') }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderCreate.bidDeadline') }}</span>
          <span class="info-value">{{ tender.bidDeadline ? fmtDate(tender.bidDeadline) : '—' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderCreate.openReview') }}</span>
          <span class="info-value">{{ tender.openTime ? fmtDate(tender.openTime) : '—' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('quote.maxRebid') }}</span>
          <span class="info-value">{{ t('quote.times', { count: tender.maxRebidCount }) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderDetail.quoteRound') }}</span>
          <span class="info-value">{{ t('tenderList.roundNo', { round: tender.currentQuoteRound ?? 1 }) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('quote.cooldownSeconds') }}</span>
          <span class="info-value">{{ t('quote.seconds', { count: tender.cooldownSeconds }) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderList.hallVisibility') }}</span>
          <span class="info-value">{{ tender.isHallVisible ? t('tenderDetail.visible') : t('tenderDetail.hidden') }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{{ t('tenderCreate.participants') }}</span>
          <span class="info-value">{{ participantSummary }}</span>
        </div>
      </div>

      <el-card v-if="participants" class="panel">
        <template #header>
          <div class="panel-head">
            <span>{{ t('tenderCreate.participants') }}</span>
            <div class="panel-tools">
              <el-tag :type="participants.participationMode === 'selected' ? 'warning' : 'info'" effect="plain">
                {{ participants.participationMode === 'selected' ? participantSourceLabel(participants.source) : t('tenderCreate.allSuppliers') }}
              </el-tag>
              <el-button text type="primary" @click="participantsExpanded = !participantsExpanded">
                {{ participantsExpanded ? t('common.collapse') : t('common.view') }}
              </el-button>
            </div>
          </div>
        </template>
        <template v-if="participantsExpanded">
          <div v-if="participants.participationMode === 'all'" class="participant-empty">
            {{ t('tenderCreate.publicScopeNote') }}
          </div>
          <el-table v-else :data="participants.suppliers ?? []" stripe>
            <el-table-column prop="businessId" :label="t('supplierList.supplierNo')" width="150">
              <template #default="{ row }">{{ row.businessId || row.supplierId }}</template>
            </el-table-column>
            <el-table-column :label="t('supplier.legal_name')" min-width="220">
              <template #default="{ row }">{{ row.legalName || row.shortName || row.supplierId }}</template>
            </el-table-column>
            <el-table-column prop="contactName" :label="t('common.contact_name')" width="140" />
            <el-table-column prop="contactPhone" :label="t('common.contact_phone')" width="150" />
          </el-table>
        </template>
      </el-card>

      <!-- Lots -->
      <el-card class="panel">
        <template #header>{{ t('hall.lots') }}</template>
        <el-table :data="tender.lots ?? []" stripe>
          <el-table-column type="expand" width="48">
            <template #default="{ row }">
              <div v-if="row.lines?.length" class="line-expand">
                <el-table :data="row.lines" border size="small">
                  <el-table-column label="#" width="58">
                    <template #default="{ $index }">{{ $index + 1 }}</template>
                  </el-table-column>
                  <el-table-column
                    v-for="col in procurementLineColumns(row.uiSchema?.lineColumns)"
                    :key="col.key"
                    :label="col.label"
                    min-width="140"
                    show-overflow-tooltip
                  >
                    <template #default="{ row: line }">{{ line.dataJson?.[col.key] || '—' }}</template>
                  </el-table-column>
                </el-table>
              </div>
              <el-empty v-else :description="t('quote.noLines')" />
            </template>
          </el-table-column>
          <el-table-column prop="lotNo" :label="t('common.number')" width="160" />
          <el-table-column prop="title" :label="t('common.name')" min-width="180" />
          <el-table-column prop="description" :label="t('common.description')" min-width="180" show-overflow-tooltip />
          <el-table-column :label="t('tenderCreate.quantity')" width="130">
            <template #default="{ row }">
              {{ row.quantity ? `${Number(row.quantity).toLocaleString()} ${row.unit || ''}` : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('tenderDetail.budget')" width="180">
            <template #default="{ row }">
              {{ row.budgetAmount ? `${Number(row.budgetAmount).toLocaleString()} ${row.budgetCurrency}` : '—' }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card v-if="quoteReview" ref="reviewPanel" class="panel quote-review-panel">
        <template #header>
          <div class="panel-head">
            <span>{{ t('route.quoteReview') }}</span>
            <div class="panel-tools">
              <el-radio-group v-model="reviewMode" size="small">
                <el-radio-button label="item">{{ t('tenderDetail.byItem') }}</el-radio-button>
                <el-radio-button label="supplier">{{ t('tenderDetail.bySupplier') }}</el-radio-button>
              </el-radio-group>
              <el-select
                v-model="selectedReviewRound"
                size="small"
                class="round-select"
                @change="changeReviewRound"
              >
                <el-option
                  v-for="round in reviewRounds"
                  :key="round"
                  :value="Number(round)"
                  :label="t('tenderList.roundNo', { round })"
                />
              </el-select>
            </div>
          </div>
        </template>

        <div v-if="reviewMode === 'item'" class="review-layout">
          <div class="review-lines">
            <div
              v-for="lot in displayedReviewLots"
              :key="lot.lotId"
              class="review-lot-block"
            >
              <div class="review-lot-title">
                <strong>{{ lot.title }}</strong>
                <span>{{ lot.lines?.length ? t('tenderDetail.lineCount', { count: lot.lines.length }) : t('tenderDetail.supplierQuoteCount', { count: lot.latestQuotes?.length ?? 0 }) }}</span>
              </div>
              <el-table
                v-if="lot.lines?.length"
                :data="lot.lines"
                border
                size="small"
                highlight-current-row
                @row-click="selectReviewLine(lot, $event)"
              >
                <el-table-column label="#" width="58">
                  <template #default="{ $index }">{{ $index + 1 }}</template>
                </el-table-column>
                <el-table-column
                  v-for="col in procurementLineColumns(lot.lineColumns)"
                  :key="col.key"
                  :label="col.label"
                  min-width="120"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">{{ row.dataJson?.[col.key] || '—' }}</template>
                </el-table-column>
                <el-table-column :label="t('tenderDetail.quoted')" width="90" fixed="right">
                  <template #default="{ row }">{{ t('tenderDetail.supplierCount', { count: row.quoteStats?.quotedSupplierCount ?? 0 }) }}</template>
                </el-table-column>
                <el-table-column :label="t('tenderDetail.minPrice')" width="130" fixed="right">
                  <template #default="{ row }">{{ formatReviewPrice(row.quoteStats?.minPrice, firstCurrency(row.latestQuotes)) }}</template>
                </el-table-column>
              </el-table>
              <button v-else type="button" class="lot-review-row" @click="selectLotReview(lot)">
                <span>{{ t('tenderDetail.lotIntegralQuote') }}</span>
                <strong>{{ t('tenderDetail.supplierCount', { count: lot.quoteStats?.quotedSupplierCount ?? 0 }) }}</strong>
              </button>
            </div>
          </div>

          <div class="review-quotes">
            <template v-if="activeReview">
              <div class="active-review-title">
                <strong>{{ activeReview.lotTitle || activeReview.title || t('tenderDetail.currentItem') }}</strong>
                <span>{{ t('tenderDetail.currentItemQuotes') }}</span>
              </div>
              <div class="review-summary">
                <div><span>{{ t('tenderDetail.quoted') }}</span><strong>{{ t('tenderDetail.supplierCount', { count: activeReview.quoteStats?.quotedSupplierCount ?? 0 }) }}</strong></div>
                <div><span>{{ t('tenderDetail.minPrice') }}</span><strong>{{ formatReviewPrice(activeReview.quoteStats?.minPrice, firstCurrency(activeReview.latestQuotes)) }}</strong></div>
                <div><span>{{ t('tenderDetail.maxPrice') }}</span><strong>{{ formatReviewPrice(activeReview.quoteStats?.maxPrice, firstCurrency(activeReview.latestQuotes)) }}</strong></div>
                <div><span>{{ t('tenderDetail.avgPrice') }}</span><strong>{{ formatReviewPrice(activeReview.quoteStats?.avgPrice, firstCurrency(activeReview.latestQuotes)) }}</strong></div>
              </div>

              <div v-if="activeReview.priceGroups?.length" class="price-groups">
                <button
                  v-for="group in activeReview.priceGroups"
                  :key="`${group.currency}-${group.price}`"
                  type="button"
                  class="price-group"
                >
                  <strong>{{ formatReviewPrice(group.price, group.currency) }}</strong>
                  <span>{{ t('tenderDetail.supplierQuoteCount', { count: group.supplierCount }) }}</span>
                </button>
              </div>

              <el-table :data="activeReview.latestQuotes ?? []" stripe class="review-quote-table">
                <el-table-column :label="t('quote.rank')" width="80">
                  <template #default="{ row }">#{{ row.rank }}</template>
                </el-table-column>
                <el-table-column :label="t('nav.suppliers')" min-width="220" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="supplier-cell">
                      <strong>{{ row.supplierName }}</strong>
                      <span>{{ row.supplier?.businessId || row.supplierId }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column :label="t('quote.quoteAmount')" width="150">
                  <template #default="{ row }">{{ formatReviewPrice(row.totalPrice, row.currency) }}</template>
                </el-table-column>
                <el-table-column
                  v-for="col in activeReviewRequiredColumns"
                  :key="col.key"
                  :label="col.label"
                  min-width="140"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">{{ quoteItemValue(row, col) }}</template>
                </el-table-column>
                <el-table-column :label="t('quote.versionColumn')" width="80">
                  <template #default="{ row }">V{{ row.version }}</template>
                </el-table-column>
                <el-table-column :label="t('quote.submitTime')" width="170">
                  <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
                </el-table-column>
                <el-table-column :label="t('common.actions')" width="90" fixed="right">
                  <template #default="{ row }">
                    <el-button text type="primary" @click="openReviewQuote(row)">{{ t('common.details') }}</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </template>
            <el-empty v-else :description="t('tenderDetail.selectLineToViewQuotes')" />
          </div>
        </div>

        <div v-else class="supplier-review-view">
          <el-table :data="supplierReviews" border stripe>
            <el-table-column type="expand" width="48">
              <template #default="{ row }">
                <div class="supplier-lines">
                  <el-table :data="row.quotes" size="small" border class="review-quote-table">
                    <el-table-column prop="lotTitle" :label="t('hall.lots')" min-width="150" show-overflow-tooltip />
                    <el-table-column prop="itemLabel" :label="t('tenderDetail.field.itemLabel')" min-width="220" show-overflow-tooltip />
                    <el-table-column :label="t('quote.quoteAmount')" width="150">
                      <template #default="{ row: quote }">{{ formatReviewPrice(quote.totalPrice, quote.currency) }}</template>
                    </el-table-column>
                    <el-table-column
                      v-for="col in supplierQuoteColumns(row.quotes)"
                      :key="col.key"
                      :label="col.label"
                      min-width="140"
                      show-overflow-tooltip
                    >
                      <template #default="{ row: quote }">{{ quoteItemValue(quote, col) }}</template>
                    </el-table-column>
                    <el-table-column :label="t('quote.rank')" width="80">
                      <template #default="{ row: quote }">#{{ quote.rank }}</template>
                    </el-table-column>
                    <el-table-column :label="t('quote.versionColumn')" width="80">
                      <template #default="{ row: quote }">V{{ quote.version }}</template>
                    </el-table-column>
                    <el-table-column :label="t('quote.submitTime')" width="170">
                      <template #default="{ row: quote }">{{ fmtDate(quote.submittedAt) }}</template>
                    </el-table-column>
                    <el-table-column :label="t('common.actions')" width="90" fixed="right">
                      <template #default="{ row: quote }">
                        <el-button text type="primary" @click="openReviewQuote(quote)">{{ t('common.details') }}</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('nav.suppliers')" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="supplier-cell">
                  <strong>{{ row.supplierName }}</strong>
                  <span>{{ row.supplier?.businessId || row.supplierId }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('tenderDetail.quotedItems')" width="110">
              <template #default="{ row }">{{ t('tenderDetail.itemCount', { count: row.quoteCount }) }}</template>
            </el-table-column>
            <el-table-column :label="t('tenderDetail.totalQuote')" width="180">
              <template #default="{ row }">{{ formatReviewPrice(row.totalAmount, row.currency) }}</template>
            </el-table-column>
            <el-table-column :label="t('tenderDetail.minItem')" width="150">
              <template #default="{ row }">{{ formatReviewPrice(row.minPrice, row.currency) }}</template>
            </el-table-column>
            <el-table-column :label="t('tenderDetail.maxItem')" width="150">
              <template #default="{ row }">{{ formatReviewPrice(row.maxPrice, row.currency) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>

      <!-- Attachments -->
      <el-card v-if="tender.attachments?.length" class="panel">
        <template #header>{{ t('tenderCreate.attachments') }}</template>
        <div class="attachment-list">
          <button
            v-for="file in tender.attachments"
            :key="file.key"
            class="attachment-item"
            type="button"
            @click="previewAttachment(file)"
          >
            <span class="attachment-name">{{ file.name }}</span>
            <span class="attachment-size">{{ formatSize(file.size) }}</span>
          </button>
        </div>
      </el-card>
    </template>

    <el-dialog v-model="preview.visible" :title="preview.title" width="82vw">
      <iframe v-if="preview.kind === 'inline'" class="preview-frame" :src="preview.url" :title="t('tenderCreate.attachmentPreview')" />
      <div v-else class="preview-fallback">
        <p>{{ t('tenderCreate.previewUnsupported') }}</p>
        <el-button type="primary" @click="openPreviewFile">{{ t('tenderCreate.openInNewWindow') }}</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="exportDialogVisible" :title="t('tenderDetail.exportReview')" width="680px">
      <el-form label-width="88px" class="export-form">
        <el-form-item :label="t('tenderDetail.exportMode')">
          <el-radio-group v-model="exportForm.mode">
            <el-radio-button v-if="auth.hasScope('export:masked')" label="masked">{{ t('tenderDetail.masked') }}</el-radio-button>
            <el-radio-button v-if="auth.hasScope('export:full')" label="full">{{ t('tenderDetail.full') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('tenderDetail.exportView')">
          <el-radio-group v-model="exportForm.view">
            <el-radio-button label="item">{{ t('tenderDetail.byItem') }}</el-radio-button>
            <el-radio-button label="supplier">{{ t('tenderDetail.bySupplier') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('tenderDetail.exportRound')">
          <el-select v-model="exportForm.round" style="width:180px">
            <el-option :label="t('tenderDetail.allRounds')" value="all" />
            <el-option
              v-for="round in reviewRounds"
              :key="round"
              :label="t('tenderList.roundNo', { round })"
              :value="String(round)"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenderDetail.exportFields')">
          <el-checkbox-group v-model="exportForm.fields" class="export-fields">
            <el-checkbox
              v-for="field in exportFieldOptions"
              :key="field.value"
              :label="field.value"
            >
              {{ field.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">{{ t('tenderDetail.exportExcel') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="reviewDetailVisible" :title="t('tenderDetail.quoteDetails')" size="560px">
      <template v-if="selectedReviewQuote">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('nav.suppliers')">{{ selectedReviewQuote.supplierName }}</el-descriptions-item>
          <el-descriptions-item :label="t('supplierList.supplierNo')">{{ selectedReviewQuote.supplier?.businessId || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_name')">{{ selectedReviewQuote.supplier?.contactName || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_phone')">{{ selectedReviewQuote.supplier?.contactPhone || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.contact_email')">{{ selectedReviewQuote.supplier?.contactEmail || '—' }}</el-descriptions-item>
          <el-descriptions-item :label="t('tenderDetail.field.quoteNo')">{{ selectedReviewQuote.quoteNo }}</el-descriptions-item>
          <el-descriptions-item :label="t('tenderDetail.quoteAmount')">{{ formatReviewPrice(selectedReviewQuote.totalPrice, selectedReviewQuote.currency) }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.versionColumn')">V{{ selectedReviewQuote.version }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.submitTime')">{{ fmtDate(selectedReviewQuote.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item :label="t('quote.remark')">{{ selectedReviewQuote.remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <section class="detail-section">
          <h3>{{ t('tenderDetail.supplierInputs') }}</h3>
          <el-table v-if="filledQuoteItems(selectedReviewQuote).length" :data="filledQuoteItems(selectedReviewQuote)" stripe size="small">
            <el-table-column prop="label" :label="t('tenderDetail.fieldName')" min-width="160" />
            <el-table-column prop="value" :label="t('tenderDetail.filledValue')" min-width="220" show-overflow-tooltip />
          </el-table>
          <el-empty v-else :description="t('tenderDetail.noSupplierInputs')" />
        </section>

        <section class="detail-section">
          <h3>{{ t('tenderDetail.quoteHistory') }}</h3>
          <el-table v-if="selectedReviewQuote.history?.length" :data="selectedReviewQuote.history" stripe size="small">
            <el-table-column :label="t('quote.versionColumn')" width="80">
              <template #default="{ row }">V{{ row.version }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.quoteAmount')" width="160">
              <template #default="{ row }">{{ formatReviewPrice(row.totalPrice, row.currency) }}</template>
            </el-table-column>
            <el-table-column
              v-for="col in selectedReviewQuote.requiredColumns ?? []"
              :key="col.key"
              :label="col.label"
              min-width="130"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ quoteItemValue(row, col) }}</template>
            </el-table-column>
            <el-table-column :label="t('quote.current')" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isLatest ? 'success' : 'info'" size="small">{{ row.isLatest ? t('common.yes') : t('common.no') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('quote.submitTime')" min-width="160">
              <template #default="{ row }">{{ fmtDate(row.submittedAt) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else :description="t('tenderDetail.noQuoteHistory')" />
        </section>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  computed, nextTick, reactive, ref, onActivated, onMounted, watch,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Refresh } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const tender = ref<any>(null);
const quoteReview = ref<any>(null);
const participants = ref<any>(null);
const participantsExpanded = ref(false);
const activeReview = ref<any>(null);
const reviewPanel = ref<any>(null);
const reviewMode = ref<'item' | 'supplier'>('item');
const selectedReviewRound = ref<number | null>(null);
const reviewDetailVisible = ref(false);
const selectedReviewQuote = ref<any>(null);
const loading = ref(false);
const exporting = ref(false);
const exportDialogVisible = ref(false);
const defaultExportFields = [
  'roundNo',
  'lotNo',
  'lotTitle',
  'itemLabel',
  'rank',
  'quoteNo',
  'supplierBusinessId',
  'supplierName',
  'totalPrice',
  'currency',
  'version',
  'submittedAt',
];
const exportForm = reactive({
  mode: 'masked',
  view: 'item',
  round: 'all',
  fields: [...defaultExportFields],
});
const preview = reactive({
  visible: false,
  title: '',
  url: '',
  kind: 'inline' as 'inline' | 'download',
});

function fmtDate(iso: string) { return dayjs(iso).format('YYYY-MM-DD HH:mm'); }
function statusTag(s: string) {
  return { draft: 'info', published: '', open: 'success', closed: 'danger', cancelled: 'danger', awarded: 'warning' }[s] ?? '';
}

const reviewRounds = computed(() => quoteReview.value?.availableRounds?.length
  ? quoteReview.value.availableRounds.map((round: any) => Number(round))
  : [quoteReview.value?.currentRound ?? 1]);
const displayedReview = computed(() => {
  const round = Number(selectedReviewRound.value ?? quoteReview.value?.currentRound ?? 1);
  return quoteReview.value?.rounds?.find((item: any) => Number(item.roundNo) === round)
    ?? { roundNo: quoteReview.value?.currentRound, lots: quoteReview.value?.lots ?? [] };
});
const displayedReviewLots = computed(() => displayedReview.value?.lots ?? []);
const firstReviewLot = computed(() => displayedReviewLots.value?.[0] ?? null);
const activeReviewRequiredColumns = computed(() => activeReview.value?.requiredColumns ?? []);
const participantSummary = computed(() => {
  if (!participants.value) return tender.value?.participationMode === 'selected' ? t('tenderCreate.selectedSuppliers') : t('tenderCreate.allSuppliers');
  if (participants.value.participationMode === 'all') return t('tenderCreate.allSuppliers');
  return t('tenderCreate.selectedSupplierCount', { count: participants.value.suppliers?.length ?? 0 });
});
const exportFieldOptions = computed(() => {
  const options = [
    { value: 'roundNo', label: t('tenderDetail.field.roundNo') },
    { value: 'lotNo', label: t('tenderDetail.field.lotNo') },
    { value: 'lotTitle', label: t('tenderDetail.field.lotTitle') },
    { value: 'itemLabel', label: t('tenderDetail.field.itemLabel') },
    { value: 'rank', label: t('quote.rank') },
    { value: 'quoteNo', label: t('tenderDetail.field.quoteNo') },
    { value: 'supplierBusinessId', label: t('supplierList.supplierNo') },
    { value: 'supplierName', label: t('nav.suppliers') },
    { value: 'supplierContact', label: t('common.contact_name') },
    { value: 'supplierPhone', label: t('common.contact_phone') },
    { value: 'supplierEmail', label: t('common.contact_email') },
    { value: 'totalPrice', label: t('quote.quoteAmount') },
    { value: 'currency', label: t('common.currency') },
    { value: 'version', label: t('quote.versionColumn') },
    { value: 'submittedAt', label: t('quote.submitTime') },
    { value: 'remark', label: t('quote.remark') },
    { value: 'submitIp', label: 'IP' },
  ];
  const dynamicMap = new Map<string, { value: string; label: string }>();
  for (const lot of tender.value?.lots ?? []) {
    for (const col of lot.uiSchema?.lineColumns ?? []) {
      const prefix = col.required ? 'supplierItem' : 'line';
      const group = col.required ? t('tenderDetail.supplierInput') : t('tenderDetail.lineField');
      const value = `${prefix}:${col.key}`;
      if (!dynamicMap.has(value)) dynamicMap.set(value, { value, label: `${group}: ${col.label}` });
    }
  }
  return [...options, ...dynamicMap.values()];
});
const supplierReviews = computed(() => {
  const supplierMap = new Map<string, any>();
  for (const lot of displayedReviewLots.value ?? []) {
    for (const quote of lot.latestQuotes ?? []) {
      appendSupplierQuote(supplierMap, quote, {
        lotTitle: lot.title,
        itemLabel: t('tenderDetail.lotIntegralQuote'),
        requiredColumns: [],
      });
    }
    for (const line of lot.lines ?? []) {
      for (const quote of line.latestQuotes ?? []) {
        appendSupplierQuote(supplierMap, quote, {
          lotTitle: lot.title,
          itemLabel: lineLabel(line, lot.lineColumns),
          requiredColumns: requiredLineColumns(lot.lineColumns),
        });
      }
    }
  }
  return Array.from(supplierMap.values())
    .map((item) => {
      const prices = item.quotes.map((quote: any) => Number(quote.totalPrice)).filter((price: number) => Number.isFinite(price));
      return {
        ...item,
        quoteCount: item.quotes.length,
        totalAmount: prices.reduce((sum: number, price: number) => sum + price, 0),
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        currency: item.quotes[0]?.currency || tender.value?.baseCurrency || 'IDR',
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
});

async function load() {
  loading.value = true;
  try {
    const [tenderRes, reviewRes, participantsRes] = await Promise.all([
      api.get(`/api/tenders/${route.params.id}`),
      api.get(`/api/tenders/${route.params.id}/quote-review`).catch(() => ({ data: { data: null } })),
      api.get(`/api/tenders/${route.params.id}/participants`).catch(() => ({ data: { data: null } })),
    ]);
    tender.value = tenderRes.data.data;
    quoteReview.value = reviewRes.data.data;
    participants.value = participantsRes.data.data;
    selectedReviewRound.value = Number(selectedReviewRound.value ?? quoteReview.value?.currentRound ?? reviewRounds.value[0] ?? 1);
    if (!activeReview.value && firstReviewLot.value) {
      activeReview.value = firstReviewLot.value.lines?.[0]
        ? { ...firstReviewLot.value.lines[0], lotTitle: firstReviewLot.value.title, requiredColumns: requiredLineColumns(firstReviewLot.value.lineColumns) }
        : firstReviewLot.value;
    }
  } finally { loading.value = false; }
}

function participantSourceLabel(source?: string) {
  if (source === 'previous_round' || source === 'previous_all') return t('tenderCreate.previousRoundAll');
  if (source === 'previous_select') return t('tenderCreate.previousRoundSelect');
  return t('tenderCreate.selectedSuppliers');
}

watch(displayedReview, () => resetActiveReviewForRound(), { flush: 'post' });

async function doPublish() {
  await api.post(`/api/tenders/${tender.value.id}/publish`);
  ElMessage.success(t('tenderDetail.published'));
  load();
}

async function doWithdraw() {
  await api.post(`/api/tenders/${tender.value.id}/withdraw`);
  ElMessage.success(t('tenderDetail.withdrawn'));
  load();
}

async function doOpen() {
  await ElMessageBox.confirm(t('tenderDetail.openConfirmMessage'), t('tenderDetail.openConfirmTitle'), {
    type: 'warning',
    confirmButtonText: t('tenderDetail.confirmOpen'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/tenders/${tender.value.id}/open`);
  ElMessage.success(t('tenderDetail.opened'));
  load();
}

async function doClose() {
  await ElMessageBox.confirm(t('tenderDetail.closeConfirmMessage'), t('tenderDetail.closeConfirmTitle'), {
    type: 'warning',
    confirmButtonText: t('tenderDetail.confirmClose'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/tenders/${tender.value.id}/close`);
  ElMessage.success(t('tenderDetail.closed'));
  load();
}

async function startNextRound() {
  await ElMessageBox.confirm(t('tenderDetail.nextRoundConfirmMessage'), t('tenderDetail.nextRoundConfirmTitle'), {
    type: 'warning',
    confirmButtonText: t('tenderDetail.confirmNextRound'),
    cancelButtonText: t('common.cancel'),
  });
  await api.post(`/api/tenders/${tender.value.id}/rounds/next`);
  ElMessage.success(t('tenderDetail.nextRoundCreated'));
  router.push(`/tenders/${tender.value.id}/edit`);
}

function openExportDialog() {
  exportForm.mode = auth.hasScope('export:full') ? 'full' : 'masked';
  exportForm.view = reviewMode.value;
  exportForm.round = selectedReviewRound.value ? String(selectedReviewRound.value) : 'all';
  exportDialogVisible.value = true;
}

async function doExport() {
  if (!exportForm.fields.length) {
    ElMessage.warning(t('tenderDetail.selectExportField'));
    return;
  }
  exporting.value = true;
  try {
    const res = await api.get(`/api/export/tenders/${tender.value.id}/quotes`, {
      params: {
        mode: exportForm.mode,
        view: exportForm.view,
        round: exportForm.round,
        fields: exportForm.fields.join(','),
      },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${tender.value.tenderNo}-${exportForm.mode}-${exportForm.view}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    exportDialogVisible.value = false;
  } finally {
    exporting.value = false;
  }
}

function previewAttachment(file: any) {
  preview.title = file.name || t('tenderCreate.attachmentPreview');
  preview.url = file.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(file.key)}`;
  preview.kind = file.mimeType?.startsWith('image/') || file.mimeType === 'application/pdf' ? 'inline' : 'download';
  preview.visible = true;
}

function openPreviewFile() {
  if (preview.url) window.open(preview.url, '_blank');
}

function formatSize(size?: number) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function firstCurrency(quotes?: any[]) {
  return quotes?.[0]?.currency || tender.value?.baseCurrency || 'IDR';
}

function formatReviewPrice(value?: number | string | null, currency = 'IDR') {
  if (value === null || value === undefined || value === '') return '—';
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function selectReviewLine(lot: any, line: any) {
  activeReview.value = { ...line, lotTitle: lot.title, requiredColumns: requiredLineColumns(lot.lineColumns) };
}

function selectLotReview(lot: any) {
  activeReview.value = lot;
}

function changeReviewRound(value: number | string) {
  selectedReviewRound.value = Number(value);
  resetActiveReviewForRound();
}

function resetActiveReviewForRound() {
  const previous = activeReview.value;
  let next: any = null;
  if (previous?.lineId) {
    for (const lot of displayedReviewLots.value ?? []) {
      const line = lot.lines?.find((item: any) => item.lineId === previous.lineId);
      if (line) {
        next = { ...line, lotTitle: lot.title, requiredColumns: requiredLineColumns(lot.lineColumns) };
        break;
      }
    }
  }
  if (!next && previous?.lotId) {
    next = displayedReviewLots.value?.find((item: any) => item.lotId === previous.lotId) ?? null;
  }
  activeReview.value = next ?? firstReviewLot.value?.lines?.[0] ?? firstReviewLot.value ?? null;
}

async function focusLotReview(lot: any) {
  const reviewLot = displayedReviewLots.value?.find((item: any) => item.lotId === lot.id);
  if (reviewLot) {
    activeReview.value = reviewLot.lines?.[0]
      ? { ...reviewLot.lines[0], lotTitle: reviewLot.title, requiredColumns: requiredLineColumns(reviewLot.lineColumns) }
      : reviewLot;
  }
  await nextTick();
  reviewPanel.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function openReviewQuote(row: any) {
  selectedReviewQuote.value = {
    ...row,
    requiredColumns: row.requiredColumns ?? activeReviewRequiredColumns.value ?? [],
  };
  reviewDetailVisible.value = true;
}

function appendSupplierQuote(map: Map<string, any>, quote: any, context: { lotTitle: string; itemLabel: string; requiredColumns: any[] }) {
  if (!map.has(quote.supplierId)) {
    map.set(quote.supplierId, {
      supplierId: quote.supplierId,
      supplierName: quote.supplierName,
      supplier: quote.supplier,
      quotes: [],
    });
  }
  map.get(quote.supplierId).quotes.push({
    ...quote,
    lotTitle: context.lotTitle,
    itemLabel: context.itemLabel,
    requiredColumns: context.requiredColumns,
  });
}

function requiredLineColumns(columns?: any[]) {
  return (columns ?? []).filter((col) => Boolean(col.required));
}

function procurementLineColumns(columns?: any[]) {
  return (columns ?? []).filter((col) => !col.required);
}

function quoteItemValue(quote: any, col: any) {
  const value = quote?.items?.[col.key];
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function filledQuoteItems(quote: any) {
  return (quote?.requiredColumns ?? [])
    .map((col: any) => ({ key: col.key, label: col.label, value: quoteItemValue(quote, col) }))
    .filter((item: any) => item.value !== '—');
}

function supplierQuoteColumns(quotes: any[]) {
  const map = new Map<string, any>();
  for (const quote of quotes ?? []) {
    for (const col of quote.requiredColumns ?? []) {
      if (col?.key && !map.has(col.key)) map.set(col.key, col);
    }
  }
  return Array.from(map.values());
}

function lineLabel(line: any, columns?: any[]) {
  const cols = procurementLineColumns(columns);
  const values = cols
    .slice(0, 3)
    .map((col) => line.dataJson?.[col.key])
    .filter((value) => value !== undefined && value !== null && String(value).trim());
  if (values.length) return values.join(' / ');
  return line.lineNo || t('tenderDetail.rowNo', { row: line.rowNo ?? '' });
}

onMounted(load);
onActivated(load);
</script>

<style scoped>
.tender-detail { display: grid; gap: 16px; }

/* ── Header ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.header-left { flex: 1; min-width: 0; }
.header-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.tender-no { font-size: 13px; color: #64748b; font-family: monospace; }
.tender-title { margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #0f172a; }
.tender-desc { margin: 0; font-size: 14px; color: #64748b; line-height: 1.6; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }

/* ── Info strip ── */
.info-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px;
  flex: 1;
  min-width: 120px;
  border-right: 1px solid #e5e7eb;
}
.info-item:last-child { border-right: none; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: .04em; }
.info-value { font-size: 14px; font-weight: 600; color: #0f172a; }

/* ── Panel ── */
.panel { border-radius: 10px; border-color: #e5e7eb; box-shadow: none; }
.panel :deep(.el-card__header) { font-weight: 600; color: #0f172a; padding: 14px 20px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.panel-tools { display: flex; align-items: center; gap: 10px; }
.round-select { width: 104px; }
.line-expand { padding: 8px 18px 12px; background: #f8fafc; }
.quote-review-panel :deep(.el-card__body) { padding: 0; }
.review-layout {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 1.2fr);
  min-height: 420px;
}
.review-lines {
  min-width: 0;
  padding: 16px;
  border-right: 1px solid #e5e7eb;
  background: #f8fafc;
}
.review-quotes {
  min-width: 0;
  padding: 16px;
  background: #fff;
}
.review-quote-table {
  width: 100%;
}
.review-lot-block {
  display: grid;
  gap: 10px;
}
.review-lot-block + .review-lot-block { margin-top: 18px; }
.review-lot-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.review-lot-title strong { color: #0f172a; font-size: 14px; }
.review-lot-title span { color: #64748b; font-size: 12px; }
.lot-review-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  cursor: pointer;
}
.lot-review-row:hover { border-color: #93c5fd; background: #eff6ff; }
.lot-review-row span { color: #334155; }
.lot-review-row strong { color: #1e40af; }
.active-review-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.active-review-title strong { color: #0f172a; font-size: 15px; }
.active-review-title span { color: #64748b; font-size: 12px; }
.review-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.review-summary div {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}
.review-summary span { display: block; color: #64748b; font-size: 12px; margin-bottom: 4px; }
.review-summary strong { color: #0f172a; font-size: 14px; }
.price-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.price-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1e40af;
  font: inherit;
}
.price-group strong { font-size: 13px; }
.price-group span { font-size: 12px; color: #475569; }
.supplier-cell { display: grid; gap: 2px; }
.supplier-cell strong { color: #0f172a; font-weight: 700; }
.supplier-cell span { color: #64748b; font-size: 12px; }
.supplier-review-view { padding: 16px; }
.supplier-lines { padding: 8px 18px 12px; background: #f8fafc; }
.detail-section { margin-top: 20px; }
.detail-section h3 { margin: 0 0 10px; color: #0f172a; font-size: 15px; }
.participant-empty {
  padding: 14px;
  border-radius: 8px;
  background: #f0f9ff;
  color: #075985;
  font-size: 13px;
}

/* ── Attachments ── */
.attachment-list { display: flex; flex-wrap: wrap; gap: 8px; }
.attachment-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font: inherit;
  transition: border-color .15s;
}
.attachment-item:hover { border-color: #2563eb; }
.attachment-name { font-size: 14px; color: #0f172a; }
.attachment-size { font-size: 12px; color: #94a3b8; }

/* ── Preview ── */
.preview-frame { width: 100%; height: 72vh; border: 0; }
.export-form {
  max-height: 62vh;
  overflow: auto;
  padding-right: 8px;
}
.export-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  width: 100%;
}
.export-fields :deep(.el-checkbox) {
  margin-right: 0;
}
.preview-fallback { display: grid; justify-items: center; gap: 16px; padding: 48px 0; color: #606266; }

@media (max-width: 768px) {
  .page-header { flex-direction: column; }
  .info-strip { flex-direction: column; }
  .info-item { border-right: none; border-bottom: 1px solid #e5e7eb; }
  .info-item:last-child { border-bottom: none; }
  .review-layout { grid-template-columns: 1fr; }
  .review-lines { border-right: 0; border-bottom: 1px solid #e5e7eb; }
  .review-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .panel-head, .panel-tools, .active-review-title { align-items: flex-start; flex-direction: column; }
}
</style>
