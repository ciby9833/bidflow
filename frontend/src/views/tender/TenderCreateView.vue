<!--
文件：frontend/src/views/tender/TenderCreateView.vue
功能：招标创建/草稿编辑页，分 4 步向导：基础信息 → 报价规则 → 标包配置 → 附件确认。
交互：调用 tender.controller.ts 的创建/草稿编辑接口；提交或取消后返回招标列表。
作者：吴川
-->
<template>
  <div class="wizard" v-loading="loading">
    <!-- 顶部：标题 + 步骤 -->
    <header class="wizard-head">
      <div class="head-title">
        <h2>{{ isEdit ? t('tenderCreate.editDraft') : t('route.tenderCreate') }}</h2>
        <el-button text @click="cancel">
          <el-icon><Close /></el-icon>{{ t('common.close') }}
        </el-button>
      </div>

      <ol class="step-bar">
        <li
          v-for="(s, i) in steps"
          :key="s.key"
          :class="['step', {
            active: current === i,
            done: current > i,
            clickable: canJumpTo(i),
          }]"
          @click="jumpTo(i)"
        >
          <span class="step-circle">
            <el-icon v-if="current > i"><Check /></el-icon>
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="step-text">
            <strong>{{ s.label }}</strong>
            <small>{{ s.desc }}</small>
          </span>
        </li>
      </ol>
    </header>

    <!-- 步骤内容 -->
    <section class="wizard-body">

      <!-- Step 1: 基础信息 -->
      <div v-show="current === 0" class="step-pane">
        <div class="pane-heading">
          <div>
            <h3>{{ t('tenderCreate.basicInfo') }}</h3>
            <p>{{ t('tenderCreate.basicDesc') }}</p>
          </div>
        </div>
        <div class="form-grid">
          <el-form-item class="col-full" :label="t('hall.project_name')" required>
            <el-input v-model.trim="form.title" size="large" :placeholder="t('tenderCreate.projectNamePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('tender.title')">
            <el-select v-model="form.type" size="large" style="width:100%">
              <el-option value="transport" :label="t('tender.transport')" />
              <el-option value="engineering" :label="t('tender.engineering')" />
              <el-option value="routine" :label="t('tender.routine')" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('tenderCreate.baseCurrency')">
            <el-select v-model="form.baseCurrency" size="large" @change="syncLotCurrency" style="width:100%">
              <el-option value="IDR" :label="t('currency.idr')" />
              <el-option value="USD" :label="t('currency.usd')" />
              <el-option value="CNY" :label="t('currency.cny')" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('tenderCreate.bidStartAt')">
            <el-date-picker v-model="form.bidStartAt" type="datetime" size="large" style="width:100%" :placeholder="t('tenderCreate.startImmediately')" />
          </el-form-item>
          <el-form-item :label="t('tender.deadline')" required>
            <el-date-picker v-model="form.bidDeadline" type="datetime" size="large" style="width:100%" :placeholder="t('tenderCreate.deadlinePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('tenderCreate.openReviewTime')">
            <el-date-picker v-model="form.openTime" type="datetime" size="large" style="width:100%" :placeholder="t('tenderCreate.reviewTimePlaceholder')" />
          </el-form-item>
          <el-form-item class="col-full" :label="t('tenderCreate.projectDescription')">
            <el-input v-model="form.description" type="textarea" :rows="3" :placeholder="t('tenderCreate.descriptionPlaceholder')" />
          </el-form-item>
        </div>
      </div>

      <!-- Step 2: 报价规则 -->
      <div v-show="current === 1" class="step-pane">
        <div class="pane-heading">
          <div>
            <h3>{{ t('tenderCreate.quoteRules') }}</h3>
            <p>{{ t('tenderCreate.quoteRulesDesc') }}</p>
          </div>
        </div>
        <h3 class="pane-section-title">{{ t('tenderCreate.rankingDisplay') }}</h3>
        <div class="rank-options">
          <label
            v-for="item in rankingOptions"
            :key="item.value"
            :class="['rank-card', { selected: form.rankingMode === item.value }]"
          >
            <input v-model="form.rankingMode" type="radio" :value="item.value" class="rank-radio" />
            <div class="rank-body">
              <strong>{{ item.label }}</strong>
              <span>{{ item.desc }}</span>
            </div>
          </label>
        </div>

        <h3 class="pane-section-title">{{ t('tenderCreate.rebidLimits') }}</h3>
        <div class="form-grid three">
          <el-form-item :label="t('tenderCreate.maxRebidCount')">
            <el-input-number v-model="form.maxRebidCount" :min="1" :max="10" size="large" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('tenderCreate.minDecrement')">
            <el-input-number v-model="form.minDecrementPct" :min="0.1" :max="50" :step="0.5" :precision="1" size="large" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('tenderCreate.cooldownSeconds')">
            <el-input-number v-model="form.cooldownSeconds" :min="10" :max="3600" :step="10" size="large" style="width:100%" />
          </el-form-item>
        </div>
      </div>

      <!-- Step 3: 标包 -->
      <div v-show="current === 2" class="step-pane lot-step-pane">
        <div class="pane-heading">
          <div>
            <h3>{{ t('tenderCreate.lotConfig') }}</h3>
            <p>{{ t('tenderCreate.lotConfigDesc') }}</p>
          </div>
        </div>
        <div v-if="isTransportTender" class="lot-mode-tip">
          <strong>{{ t('tenderCreate.transportLineQuote') }}</strong>
          <span>{{ lockLotEditing ? t('tenderCreate.lotLockedTip') : t('tenderCreate.transportLineQuoteTip') }}</span>
        </div>
        <div v-else class="lot-mode-tip">
          <strong>{{ t('tenderCreate.typeLotConfig', { type: t(`tender.${form.type}`) }) }}</strong>
          <span>{{ t('tenderCreate.generalLotTip') }}</span>
        </div>
        <div class="lot-stack">
          <div v-for="(lot, i) in form.lots" :key="i" class="lot-card">
            <div class="lot-header">
              <span class="lot-index">{{ i + 1 }}</span>
              <el-input v-model.trim="lot.title" size="large" :placeholder="t('tenderCreate.lotNamePlaceholder', { index: i + 1 })" class="lot-title-input" />
              <el-button
                text type="danger"
                :disabled="form.lots.length === 1 || lockLotEditing"
                @click="removeLot(i)"
              ><el-icon><Delete /></el-icon></el-button>
            </div>
            <el-input
              v-model="lot.description"
              type="textarea"
              :rows="2"
              :placeholder="isTransportTender ? t('tenderCreate.transportLotPlaceholder') : t('tenderCreate.lotDescriptionPlaceholder')"
            />
            <div v-if="!isTransportTender" class="lot-meta">
              <el-form-item :label="t('tenderCreate.quantity')">
                <el-input-number v-model="lot.quantity" :min="0" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item :label="t('tenderCreate.unit')">
                <el-input v-model.trim="lot.unit" :placeholder="t('tenderCreate.unitPlaceholder')" />
              </el-form-item>
              <el-form-item :label="t('tenderCreate.pricingMode')">
                <el-select v-model="lot.pricingMode" style="width:100%">
                  <el-option value="total_price" :label="t('tenderCreate.totalPrice')" />
                  <el-option value="unit_price" :label="t('tenderCreate.unitPrice')" />
                  <el-option value="rate_card" :label="t('tenderCreate.rateCard')" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('tenderCreate.budgetAmount')">
                <el-input-number v-model="lot.budgetAmount" :min="0" controls-position="right" style="width:100%">
                  <template #append>{{ form.baseCurrency }}</template>
                </el-input-number>
              </el-form-item>
            </div>
            <div v-if="isTransportTender" class="line-config">
              <div class="line-config-head">
                <div>
                  <strong>{{ t('tenderCreate.lineConfig') }}</strong>
                  <span>{{ lot.lines.length ? t('tenderCreate.lineFieldCount', { lines: lot.lines.length, fields: lot.lineColumns.length }) : t('tenderCreate.excelHeaderTip') }}</span>
                </div>
                <div class="line-actions">
                  <input hidden type="file" accept=".xlsx,.xls,.csv" @change="importLotLines($event, i)" />
                  <el-button size="small" :loading="importingLotIndex === i" :disabled="lockLotEditing" @click="openLotImport($event)">
                    <el-icon><UploadFilled /></el-icon>{{ t('tenderCreate.importExcel') }}
                  </el-button>
                  <el-button size="small" :disabled="lockLotEditing" @click="addLineColumn(i)">{{ t('tenderCreate.addColumn') }}</el-button>
                  <el-button size="small" :disabled="lockLotEditing" @click="addLineRow(i)">{{ t('tenderCreate.addRow') }}</el-button>
                  <el-button size="small" @click="clearLotLines(i)" :disabled="!lot.lines.length || lockLotEditing">{{ t('common.clear') }}</el-button>
                </div>
              </div>
              <el-table
                v-if="lot.lines.length"
                :data="lot.lines"
                border
                stripe
                size="small"
                class="line-table"
                max-height="360"
              >
                <el-table-column label="#" width="58" fixed>
                  <template #default="{ $index }">{{ $index + 1 }}</template>
                </el-table-column>
                <el-table-column
                  v-for="col in lot.lineColumns"
                  :key="col.key"
                  :label="col.label"
                  min-width="140"
                  show-overflow-tooltip
                >
                  <template #header>
                    <div class="line-col-head">
                      <div class="line-col-title">
                        <button type="button" :disabled="lockLotEditing" @click.stop="renameLineColumn(i, col)">{{ col.label }}</button>
                        <el-checkbox
                          v-model="col.required"
                          size="small"
                          :disabled="lockLotEditing"
                          @click.stop
                        >
                          {{ t('tenderCreate.supplierRequired') }}
                        </el-checkbox>
                      </div>
                      <el-button text type="danger" size="small" :disabled="lockLotEditing" @click.stop="removeLineColumn(i, col.key)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </template>
                  <template #default="{ row }">
                    <el-input v-model="row.dataJson[col.key]" size="small" :disabled="lockLotEditing" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('common.actions')" width="88" fixed="right">
                  <template #default="{ $index }">
                    <el-button text type="danger" size="small" :disabled="lockLotEditing" @click="removeLineRow(i, $index)">
                      {{ t('common.delete') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="line-empty">
                <span>{{ t('tenderCreate.importLineTip') }}</span>
              </div>
            </div>
          </div>
        </div>
        <button class="add-lot-btn" type="button" :disabled="lockLotEditing" @click="addLot">
          <el-icon><Plus /></el-icon> {{ t('tenderCreate.addLot') }}
        </button>
      </div>

      <!-- Step 4: 附件与确认 -->
      <div v-show="current === 3" class="step-pane review-step-pane">
        <div class="pane-heading">
          <div>
            <h3>{{ t('tenderCreate.attachmentsReview') }}</h3>
            <p>{{ t('tenderCreate.attachmentsReviewDesc') }}</p>
          </div>
        </div>
        <div class="review-step-layout">
          <div class="review-main">
            <h3 class="pane-section-title">{{ t('tenderCreate.tenderDocuments') }}</h3>
            <input ref="fileInput" hidden type="file" accept=".pdf,image/*" @change="uploadAttachment" />
            <div v-if="form.attachments.length" class="attachment-list">
              <div v-for="(file, index) in form.attachments" :key="file.key" class="attachment-item">
                <button type="button" class="attachment-preview" @click="previewAttachment(file)">
                  <el-icon><Document /></el-icon>
                  <span class="attachment-name">{{ file.name }}</span>
                  <span class="attachment-size">{{ formatSize(file.size) }}</span>
                </button>
                <el-button text type="danger" size="small" @click="form.attachments.splice(index, 1)">{{ t('common.remove') }}</el-button>
              </div>
              <button class="upload-add" type="button" :disabled="uploading" @click="fileInput?.click()">
                <el-icon><Plus /></el-icon> {{ t('tenderCreate.addMoreFiles') }}
              </button>
            </div>
            <button v-else class="upload-empty" type="button" :disabled="uploading" @click="fileInput?.click()">
              <el-icon size="24"><UploadFilled /></el-icon>
              <span>{{ uploading ? t('tenderCreate.uploading') : t('tenderCreate.uploadPrompt') }}</span>
            </button>

            <h3 class="pane-section-title">{{ t('tenderCreate.visibility') }}</h3>
            <div class="visibility-grid">
              <label :class="['visibility-card', { selected: form.isHallVisible }]">
                <input v-model="form.isHallVisible" type="checkbox" />
                <div>
                  <strong>{{ t('tenderCreate.publishToHall') }}</strong>
                  <span>{{ t('tenderCreate.publishToHallDesc') }}</span>
                </div>
              </label>
              <label :class="['visibility-card', { selected: form.isPublicRankingVisible }]">
                <input v-model="form.isPublicRankingVisible" type="checkbox" />
                <div>
                  <strong>{{ t('tenderCreate.publicRanking') }}</strong>
                  <span>{{ t('tenderCreate.publicRankingDesc') }}</span>
                </div>
              </label>
            </div>
            <el-form-item v-if="form.isHallVisible" :label="t('tenderCreate.hallSummary')" style="margin-top:16px">
              <el-input v-model="form.hallSummary" :placeholder="t('tenderCreate.hallSummaryPlaceholder')" />
            </el-form-item>

            <h3 class="pane-section-title">{{ t('tenderCreate.informationReview') }}</h3>
            <div class="review">
              <div class="review-row"><span>{{ t('hall.project_name') }}</span><strong>{{ form.title || '—' }}</strong></div>
              <div class="review-row"><span>{{ t('tender.title') }}</span><strong>{{ t(`tender.${form.type}`) }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.baseCurrency') }}</span><strong>{{ form.baseCurrency }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.bidStart') }}</span><strong>{{ form.bidStartAt ? fmtDate(form.bidStartAt) : t('tenderCreate.startImmediately') }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.bidDeadline') }}</span><strong>{{ form.bidDeadline ? fmtDate(form.bidDeadline) : t('common.not_set') }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.openReview') }}</span><strong>{{ form.openTime ? fmtDate(form.openTime) : t('common.not_set') }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.rankingMode') }}</span><strong>{{ rankingLabel }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.quoteLimits') }}</span><strong>{{ t('tenderCreate.quoteLimitSummary', { count: form.maxRebidCount, pct: form.minDecrementPct, seconds: form.cooldownSeconds }) }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.lotCount') }}</span><strong>{{ t('tenderCreate.countUnit', { count: form.lots.length }) }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.attachments') }}</span><strong>{{ t('tenderCreate.countUnit', { count: form.attachments.length }) }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.participants') }}</span><strong>{{ participantSummary }}</strong></div>
              <div class="review-row"><span>{{ t('tenderCreate.notifySuppliers') }}</span><strong>{{ form.notifySuppliers ? t('common.yes') : t('common.no') }}</strong></div>
            </div>
          </div>

          <aside class="review-side">
            <h3 class="pane-section-title">{{ t('tenderCreate.participants') }}</h3>
            <section class="participant-panel">
              <div v-if="isNextRoundEdit" class="round-mode-block">
                <div class="round-mode-row">
                  <button type="button" :class="{ active: roundParticipantMode === 'previous_all' }" @click="applyRoundMode('previous_all')">
                    {{ t('tenderCreate.previousRoundAll') }}
                  </button>
                  <button type="button" :class="{ active: roundParticipantMode === 'previous_select' }" @click="applyRoundMode('previous_select')">
                    {{ t('tenderCreate.previousRoundSelect') }}
                  </button>
                  <button type="button" :class="{ active: roundParticipantMode === 'all' }" @click="applyRoundMode('all')">
                    {{ t('tenderCreate.continuePublicAll') }}
                  </button>
                </div>
                <p class="round-mode-hint">{{ t('tenderCreate.nextRoundParticipantHint') }}</p>
              </div>
              <div v-else class="participation-toggle">
                <label :class="['visibility-card', { selected: form.participationMode === 'all' }]">
                  <input v-model="form.participationMode" type="radio" value="all" />
                  <div>
                    <strong>{{ t('tenderCreate.allSuppliers') }}</strong>
                    <span>{{ t('tenderCreate.allSuppliersDesc') }}</span>
                  </div>
                </label>
                <label :class="['visibility-card', { selected: form.participationMode === 'selected' }]">
                  <input v-model="form.participationMode" type="radio" value="selected" />
                  <div>
                    <strong>{{ t('tenderCreate.selectedSuppliers') }}</strong>
                    <span>{{ t('tenderCreate.selectedSuppliersDesc') }}</span>
                  </div>
                </label>
              </div>

              <label :class="['notification-card', { selected: form.notifySuppliers }]">
                <el-checkbox v-model="form.notifySuppliers" size="large" />
                <div>
                  <strong>{{ t('tenderCreate.notifySuppliers') }}</strong>
                  <span>{{ notifySuppliersDesc }}</span>
                </div>
              </label>

              <div v-if="form.participationMode === 'selected'" class="supplier-picker">
                <div class="supplier-pool">
                  <div class="supplier-toolbar">
                    <el-input v-model.trim="supplierQuery.search" clearable :placeholder="t('tenderCreate.searchSupplier')" @keyup.enter="loadSupplierOptions(1)" />
                    <el-select v-if="isEdit" v-model="supplierQuery.sort" :placeholder="t('tenderCreate.sortSuppliers')" @change="loadSupplierOptions(1)">
                      <el-option value="quote_amount" :label="t('tenderCreate.sortQuoteAmount')" />
                      <el-option value="quote_time" :label="t('tenderCreate.sortQuoteTime')" />
                      <el-option value="quote_count" :label="t('tenderCreate.sortQuoteCount')" />
                      <el-option value="name" :label="t('tenderCreate.sortName')" />
                    </el-select>
                    <el-button @click="selectCurrentPage">{{ t('tenderCreate.selectPage') }}</el-button>
                    <el-button @click="downloadParticipantTemplate">{{ t('tenderCreate.downloadImportTemplate') }}</el-button>
                    <el-button type="primary" plain :loading="participantImporting" @click="participantFileInput?.click()">
                      {{ t('tenderCreate.importParticipants') }}
                    </el-button>
                    <input
                      ref="participantFileInput"
                      hidden
                      type="file"
                      accept=".xlsx,.xls"
                      @change="importParticipants"
                    />
                  </div>
                  <el-table v-loading="supplierLoading" :data="supplierOptions" border stripe class="supplier-table">
                    <el-table-column width="48" align="center">
                      <template #default="{ row }">
                        <el-checkbox :model-value="isSupplierSelected(row.id)" @change="toggleSupplier(row, Boolean($event))" />
                      </template>
                    </el-table-column>
                    <el-table-column prop="businessId" :label="t('supplierList.supplierNo')" width="130" />
                    <el-table-column :label="t('supplier.legal_name')" min-width="190">
                      <template #default="{ row }">
                        <strong>{{ row.legalName || row.shortName || row.businessId }}</strong>
                        <small v-if="row.previousRoundInvited" class="supplier-note">{{ t('tenderCreate.previousInvited') }}</small>
                        <small v-if="row.previousRoundParticipant" class="supplier-note">{{ t('tenderCreate.previousParticipant') }}</small>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('tenderCreate.quoteStats')" width="120">
                      <template #default="{ row }">
                        <span>{{ row.quoteStats?.quoteCount ?? 0 }}</span>
                        <small v-if="row.quoteStats?.minTotalPrice" class="supplier-note">{{ Number(row.quoteStats.minTotalPrice).toLocaleString() }}</small>
                      </template>
                    </el-table-column>
                  </el-table>
                  <div class="supplier-footer">
                    <span>{{ t('tenderCreate.selectedSupplierCount', { count: selectedSupplierIds.length }) }}</span>
                    <el-pagination
                      v-model:current-page="supplierQuery.page"
                      :page-size="supplierQuery.limit"
                      :total="supplierTotal"
                      layout="prev, pager, next"
                      @current-change="loadSupplierOptions"
                    />
                  </div>
                </div>
                <aside class="selected-suppliers">
                  <div class="selected-head">
                    <strong>{{ t('tenderCreate.selectedSuppliers') }}</strong>
                    <el-button text type="primary" @click="selectedSupplierIds = []">{{ t('common.clear') }}</el-button>
                  </div>
                  <div v-if="!selectedSupplierRows.length" class="selected-empty">{{ t('tenderCreate.validationSupplierRequired') }}</div>
                  <div v-for="supplier in selectedSupplierRows" :key="supplier.id" class="selected-row">
                    <div>
                      <strong>{{ supplier.legalName || supplier.shortName || supplier.businessId || supplier.id }}</strong>
                      <span>{{ supplier.businessId || supplier.id }}</span>
                    </div>
                    <el-button text type="danger" @click="removeSelectedSupplier(supplier.id)">{{ t('common.remove') }}</el-button>
                  </div>
                </aside>
              </div>
              <div v-else class="public-scope-note">{{ t('tenderCreate.publicScopeNote') }}</div>
            </section>
          </aside>
        </div>
      </div>

    </section>

    <!-- 底部导航 -->
    <footer class="wizard-foot">
      <span v-if="error" class="foot-error">{{ error }}</span>
      <div class="foot-spacer" />
      <el-button v-if="current > 0" size="large" @click="prev">{{ t('tenderCreate.previous') }}</el-button>
      <el-button v-if="current < steps.length - 1" type="primary" size="large" @click="next">
        {{ t('tenderCreate.next') }}<el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
      <el-button v-else type="primary" size="large" :loading="saving" @click="submit">
        <el-icon><Check /></el-icon>{{ isEdit ? t('tenderCreate.saveChanges') : t('route.tenderCreate') }}
      </el-button>
    </footer>

    <!-- 附件预览 -->
    <el-dialog v-model="preview.visible" :title="preview.title" width="82vw">
      <iframe v-if="preview.kind === 'inline'" class="preview-frame" :src="preview.url" :title="t('tenderCreate.attachmentPreview')" />
      <div v-else class="preview-fallback">
        <p>{{ t('tenderCreate.previewUnsupported') }}</p>
        <el-button type="primary" @click="openPreviewFile">{{ t('tenderCreate.openInNewWindow') }}</el-button>
      </div>
    </el-dialog>

    <!-- 批量导入参与供应商 — 结果 -->
    <el-dialog v-model="importResultVisible" :title="t('tenderCreate.importResultTitle')" width="560px">
      <div v-if="importResult" class="import-result">
        <div class="import-stat">
          <span class="import-stat-ok">{{ t('tenderCreate.importMatched', { count: importResult.matched.length }) }}</span>
          <span v-if="importResult.errors.length" class="import-stat-fail">
            {{ t('tenderCreate.importFailedCount', { count: importResult.errors.length }) }}
          </span>
        </div>
        <el-table
          v-if="importResult.errors.length"
          :data="importResult.errors"
          border
          size="small"
          max-height="320"
          class="import-error-table"
        >
          <el-table-column :label="t('tenderCreate.importRow')" width="70">
            <template #default="{ row }">{{ row.row }}</template>
          </el-table-column>
          <el-table-column :label="t('supplierList.supplierNo')" width="140">
            <template #default="{ row }">{{ row.value || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('tenderCreate.importReason')" show-overflow-tooltip>
            <template #default="{ row }">{{ row.reason }}</template>
          </el-table-column>
        </el-table>
        <p v-else class="import-all-ok">{{ t('tenderCreate.importAllOk') }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="importResultVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onMounted, reactive, ref,
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Check, Close, Plus, Delete, ArrowRight, Document, UploadFilled,
} from '@element-plus/icons-vue';
import { api } from '../../composables/useApi';

const DEFAULT_CURRENCY = 'IDR';
type LineColumn = { key: string; label: string; type?: string; required?: boolean };
type LotLine = { id?: string; rowNo?: number; dataJson: Record<string, unknown> };
type TenderLotForm = {
  id?: string;
  title: string;
  description: string;
  quantity?: number;
  unit: string;
  pricingMode: string;
  budgetAmount?: number;
  budgetCurrency: string;
  lineColumns: LineColumn[];
  lines: LotLine[];
};
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const importingLotIndex = ref<number | null>(null);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const isEdit = computed(() => Boolean(route.params.id));
const lockLotEditing = ref(false);
const current = ref(0);
const maxReached = ref(0);

const preview = reactive({
  visible: false,
  title: '',
  url: '',
  kind: 'inline' as 'inline' | 'download',
});

const steps = computed(() => [
  { key: 'basic', label: t('tenderCreate.basicInfo'), desc: t('tenderCreate.basicStepDesc') },
  { key: 'rules', label: t('tenderCreate.quoteRules'), desc: t('tenderCreate.rulesStepDesc') },
  { key: 'lots', label: t('tenderCreate.lotConfig'), desc: t('tenderCreate.lotsStepDesc') },
  { key: 'review', label: t('tenderCreate.attachmentsReview'), desc: t('tenderCreate.reviewStepDesc') },
]);

const form = reactive({
  title: '',
  type: 'transport',
  baseCurrency: DEFAULT_CURRENCY,
  rankingMode: 'top_n',
  bidStartAt: null as Date | null,
  bidDeadline: null as Date | null,
  openTime: null as Date | null,
  maxRebidCount: 3,
  minDecrementPct: 1.0,
  cooldownSeconds: 60,
  description: '',
  isHallVisible: false,
  isPublicRankingVisible: false,
  notifySuppliers: false,
  participationMode: 'all' as 'all' | 'selected',
  hallSummary: '',
  attachments: [] as Array<{ key: string; name: string; size: number; mimeType?: string; fileUrl?: string }>,
  lots: [{
    title: '',
    description: '',
    quantity: undefined as number | undefined,
    unit: '',
    pricingMode: 'total_price',
    budgetAmount: undefined as number | undefined,
    budgetCurrency: DEFAULT_CURRENCY,
    lineColumns: [] as LineColumn[],
    lines: [] as LotLine[],
  }] as TenderLotForm[],
});

const rankingOptions = computed(() => [
  { value: 'top_n', label: t('tenderCreate.rankingTopN'), desc: t('tenderCreate.rankingTopNDesc') },
  { value: 'interval', label: t('tenderCreate.rankingInterval'), desc: t('tenderCreate.rankingIntervalDesc') },
  { value: 'leading_flag', label: t('tenderCreate.rankingLeadingFlag'), desc: t('tenderCreate.rankingLeadingFlagDesc') },
]);

const rankingLabel = computed(() => rankingOptions.value.find((r) => r.value === form.rankingMode)?.label ?? '—');
const isTransportTender = computed(() => form.type === 'transport');
const supplierOptions = ref<any[]>([]);
const supplierTotal = ref(0);
const supplierLoading = ref(false);
const selectedSupplierIds = ref<string[]>([]);
const selectedSupplierMap = ref<Record<string, any>>({});
const previousInvitedSupplierIds = ref<string[]>([]);
const previousQuotedSupplierIds = ref<string[]>([]);
const roundParticipantMode = ref<'previous_all' | 'previous_select' | 'all'>('all');

// 参与供应商批量导入
const participantFileInput = ref<HTMLInputElement | null>(null);
const participantImporting = ref(false);
const importResultVisible = ref(false);
const importResult = ref<{ matched: any[]; errors: Array<{ row: number; value: string; reason: string }>; total: number } | null>(null);
const supplierSelectionHydrated = ref(false);
const supplierQuery = reactive({
  search: '',
  page: 1,
  limit: 8,
  sort: 'quote_amount',
});
const isNextRoundEdit = computed(() => isEdit.value && Number((form as any).currentQuoteRound ?? 1) > 1);
const participantSummary = computed(() => (
  form.participationMode === 'all'
    ? t('tenderCreate.allSuppliers')
    : t('tenderCreate.selectedSupplierCount', { count: selectedSupplierIds.value.length })
));
const notifySuppliersDesc = computed(() => (
  form.participationMode === 'all'
    ? t('tenderCreate.notifyAllSuppliersDesc')
    : t('tenderCreate.notifySelectedSuppliersDesc')
));
const selectedSupplierRows = computed(() => selectedSupplierIds.value.map((id) => selectedSupplierMap.value[id] ?? { id }));

function fmtDate(d: Date | string) { return dayjs(d).format('YYYY-MM-DD HH:mm'); }

function canJumpTo(i: number) {
  return i <= maxReached.value;
}
function jumpTo(i: number) {
  if (canJumpTo(i)) current.value = i;
}

function validateStep(i: number): string {
  if (i === 0 && !form.title.trim()) return t('tenderCreate.validationTitleRequired');
  if (i === 0 && !form.bidDeadline) return t('tenderCreate.validationDeadlineRequired');
  if (i === 0 && form.bidStartAt && form.bidDeadline && form.bidStartAt >= form.bidDeadline) return t('tenderCreate.validationStartBeforeDeadline');
  if (i === 0 && form.bidDeadline && form.bidDeadline <= new Date()) return t('tenderCreate.validationDeadlineFuture');
  if (i === 2 && form.lots.some((lot) => !lot.title.trim())) return t('tenderCreate.validationLotTitleRequired');
  if (i === 3 && form.participationMode === 'selected' && selectedSupplierIds.value.length === 0) return t('tenderCreate.validationSupplierRequired');
  return '';
}

function next() {
  const e = validateStep(current.value);
  if (e) { error.value = e; return; }
  error.value = '';
  current.value = Math.min(current.value + 1, steps.value.length - 1);
  maxReached.value = Math.max(maxReached.value, current.value);
}

function prev() {
  error.value = '';
  current.value = Math.max(current.value - 1, 0);
}

function addLot() {
  form.lots.push({
    title: '',
    description: '',
    quantity: undefined,
    unit: '',
    pricingMode: 'total_price',
    budgetAmount: undefined,
    budgetCurrency: form.baseCurrency || DEFAULT_CURRENCY,
    lineColumns: [],
    lines: [],
  });
}

function removeLot(index: number) {
  if (form.lots.length > 1) form.lots.splice(index, 1);
}

function syncLotCurrency() {
  form.lots.forEach((lot) => { lot.budgetCurrency = form.baseCurrency; });
}

async function loadTender() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const res = await api.get(`/api/tenders/${route.params.id}`);
    const tender = res.data.data;
    // 第二轮起允许改报价结构：后端按 lot.id/line.id 增量更新，被移除的线路软删除，
    // 上一轮报价是快照不受影响，因此前端不再锁定编辑。
    lockLotEditing.value = false;
    form.title = tender.title ?? '';
    form.type = tender.type ?? 'routine';
    form.baseCurrency = tender.baseCurrency ?? DEFAULT_CURRENCY;
    form.rankingMode = tender.rankingMode ?? 'leading_flag';
    form.bidStartAt = tender.bidStartAt ? new Date(tender.bidStartAt) : null;
    form.bidDeadline = tender.bidDeadline ? new Date(tender.bidDeadline) : null;
    form.openTime = tender.openTime ? new Date(tender.openTime) : null;
    form.maxRebidCount = tender.maxRebidCount ?? 3;
    form.minDecrementPct = Number(tender.minDecrementPct ?? 1);
    form.cooldownSeconds = tender.cooldownSeconds ?? 60;
    form.description = tender.description ?? '';
    form.isHallVisible = Boolean(tender.isHallVisible);
    form.isPublicRankingVisible = Boolean(tender.isPublicRankingVisible);
    form.notifySuppliers = Boolean(tender.notifySuppliers);
    form.hallSummary = tender.hallSummary ?? '';
    (form as any).currentQuoteRound = tender.currentQuoteRound ?? 1;
    form.participationMode = tender.participationMode ?? 'all';
    form.attachments = (tender.attachments ?? []).map((item: any) => ({
      key: item.key,
      name: item.name,
      size: item.size ?? 0,
      mimeType: item.mimeType,
      fileUrl: item.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(item.key)}`,
    }));
    form.lots = (tender.lots?.length ? tender.lots : [{ title: '', budgetCurrency: DEFAULT_CURRENCY }]).map((lot: any) => ({
      id: lot.id,
      title: lot.title ?? '',
      description: lot.description ?? '',
      quantity: lot.quantity == null ? undefined : Number(lot.quantity),
      unit: lot.unit ?? '',
      pricingMode: lot.pricingMode ?? 'total_price',
      budgetAmount: lot.budgetAmount == null ? undefined : Number(lot.budgetAmount),
      budgetCurrency: lot.budgetCurrency ?? DEFAULT_CURRENCY,
      lineColumns: (lot.uiSchema?.lineColumns ?? []).map((col: any) => ({
        key: col.key,
        label: col.label,
        type: col.type ?? 'text',
        required: Boolean(col.required),
      })),
      lines: (lot.lines ?? []).map((line: any) => ({
        id: line.id,
        rowNo: line.rowNo,
        dataJson: line.dataJson ?? {},
      })),
    }));
    // 编辑模式：解锁全部步骤，方便跳转
    maxReached.value = steps.value.length - 1;
    await loadSupplierOptions(1);
  } finally {
    loading.value = false;
  }
}

async function loadSupplierOptions(page = supplierQuery.page) {
  supplierQuery.page = page;
  supplierLoading.value = true;
  try {
    if (isEdit.value) {
      const res = await api.get(`/api/tenders/${route.params.id}/participant-options`, {
        params: {
          ...supplierQuery,
          candidateMode: candidateModeForQuery(),
        },
      });
      const data = res.data.data;
      supplierOptions.value = data.items ?? [];
      supplierTotal.value = data.total ?? 0;
      previousInvitedSupplierIds.value = data.previousInvitedSupplierIds ?? data.previousRoundSupplierIds ?? [];
      previousQuotedSupplierIds.value = data.previousQuotedSupplierIds ?? [];
      rememberSuppliers([...(data.items ?? []), ...(data.selectedSuppliers ?? [])]);
      if (!supplierSelectionHydrated.value) {
        selectedSupplierIds.value = data.selectedSupplierIds ?? [];
        roundParticipantMode.value = isNextRoundEdit.value && form.participationMode === 'selected' ? 'previous_all' : 'all';
        supplierSelectionHydrated.value = true;
      }
      return;
    }
    const res = await api.get('/api/suppliers', {
      params: {
        search: supplierQuery.search,
        page: supplierQuery.page,
        limit: supplierQuery.limit,
        status: 'active',
        reviewStatus: 'approved',
      },
    });
    supplierOptions.value = res.data.data ?? [];
    supplierTotal.value = res.data.meta?.total ?? 0;
    rememberSuppliers(supplierOptions.value);
  } finally {
    supplierLoading.value = false;
  }
}

function candidateModeForQuery() {
  // 始终允许搜索全部已认证供应商；下一轮的预设按钮只做"一键填入"，填完仍可自由增删。
  return 'all';
}

function rememberSuppliers(suppliers: any[]) {
  const next = { ...selectedSupplierMap.value };
  suppliers.forEach((supplier) => {
    if (supplier?.id) next[supplier.id] = supplier;
  });
  selectedSupplierMap.value = next;
}

function isSupplierSelected(id: string) {
  return selectedSupplierIds.value.includes(id);
}

function toggleSupplier(row: any, checked: boolean) {
  const ids = new Set(selectedSupplierIds.value);
  if (checked) ids.add(row.id);
  else ids.delete(row.id);
  rememberSuppliers([row]);
  selectedSupplierIds.value = Array.from(ids);
  if (form.participationMode !== 'selected') form.participationMode = 'selected';
}

function selectCurrentPage() {
  const ids = new Set(selectedSupplierIds.value);
  supplierOptions.value.forEach((supplier) => ids.add(supplier.id));
  rememberSuppliers(supplierOptions.value);
  selectedSupplierIds.value = Array.from(ids);
  form.participationMode = 'selected';
}

function removeSelectedSupplier(id: string) {
  selectedSupplierIds.value = selectedSupplierIds.value.filter((supplierId) => supplierId !== id);
}

async function downloadParticipantTemplate() {
  const res = await api.get('/api/suppliers/participants/import-template', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'participant-import-template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

async function importParticipants(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  participantImporting.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/suppliers/participants/import', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const result = res.data.data as { matched: any[]; errors: any[]; total: number };
    // 成功匹配的并入已选名单
    if (result.matched.length) {
      rememberSuppliers(result.matched);
      const ids = new Set(selectedSupplierIds.value);
      result.matched.forEach((s) => ids.add(s.id));
      selectedSupplierIds.value = Array.from(ids);
      form.participationMode = 'selected';
    }
    importResult.value = result;
    importResultVisible.value = true;
  } catch (e: any) {
    error.value = e.response?.data?.error?.message ?? e.response?.data?.error?.message_key ?? t('tenderCreate.importFailedGeneric');
  } finally {
    participantImporting.value = false;
    input.value = '';
  }
}

function applyRoundMode(mode: 'previous_all' | 'previous_select' | 'all') {
  roundParticipantMode.value = mode;
  if (mode === 'all') {
    form.participationMode = 'all';
    return;
  }
  form.participationMode = 'selected';
  if (mode === 'previous_all') selectedSupplierIds.value = [...previousInvitedSupplierIds.value];
  if (mode === 'previous_select') selectedSupplierIds.value = [...previousQuotedSupplierIds.value];
  loadSupplierOptions(1);
}

function openLotImport(event: MouseEvent) {
  const button = event.currentTarget as HTMLElement;
  const input = button.parentElement?.querySelector('input[type="file"]') as HTMLInputElement | null;
  input?.click();
}

async function importLotLines(event: Event, lotIndex: number) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importingLotIndex.value = lotIndex;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/tenders/lots/import-preview', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const previewData = res.data.data;
    form.lots[lotIndex].lineColumns = (previewData.columns ?? []).map((col: LineColumn) => ({
      ...col,
      required: Boolean(col.required),
    }));
    form.lots[lotIndex].lines = previewData.rows ?? [];
    ElMessage.success(t('tenderCreate.importedLines', { count: previewData.total ?? form.lots[lotIndex].lines.length }));
  } catch (e: any) {
    ElMessage.error(t(e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'tenderCreate.importFailed'));
  } finally {
    importingLotIndex.value = null;
    input.value = '';
  }
}

function clearLotLines(lotIndex: number) {
  form.lots[lotIndex].lineColumns = [];
  form.lots[lotIndex].lines = [];
}

function nextLineColumnKey(lot: TenderLotForm) {
  const used = new Set(lot.lineColumns.map((col) => col.key));
  let index = lot.lineColumns.length + 1;
  let key = `col_${String(index).padStart(3, '0')}`;
  while (used.has(key)) {
    index += 1;
    key = `col_${String(index).padStart(3, '0')}`;
  }
  return key;
}

async function addLineColumn(lotIndex: number) {
  const lot = form.lots[lotIndex];
  const { value } = await ElMessageBox.prompt(t('tenderCreate.enterNewColumnName'), t('tenderCreate.addLineField'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValue: t('tenderCreate.fieldName', { index: lot.lineColumns.length + 1 }),
    inputPattern: /\S+/,
    inputErrorMessage: t('tenderCreate.columnNameRequired'),
  });
  const key = nextLineColumnKey(lot);
  lot.lineColumns.push({ key, label: value.trim(), type: 'text', required: false });
  lot.lines.forEach((line) => { line.dataJson[key] = ''; });
}

async function renameLineColumn(lotIndex: number, col: LineColumn) {
  const { value } = await ElMessageBox.prompt(t('tenderCreate.enterColumnName'), t('tenderCreate.editLineField'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValue: col.label,
    inputPattern: /\S+/,
    inputErrorMessage: t('tenderCreate.columnNameRequired'),
  });
  const lot = form.lots[lotIndex];
  const target = lot.lineColumns.find((item) => item.key === col.key);
  if (target) target.label = value.trim();
}

async function removeLineColumn(lotIndex: number, key: string) {
  const lot = form.lots[lotIndex];
  if (lot.lineColumns.length <= 1) {
    ElMessage.warning(t('tenderCreate.keepOneColumn'));
    return;
  }
  await ElMessageBox.confirm(t('tenderCreate.deleteColumnConfirm'), t('tenderCreate.deleteColumn'), {
    type: 'warning',
    confirmButtonText: t('common.confirmDelete'),
    cancelButtonText: t('common.cancel'),
  });
  lot.lineColumns = lot.lineColumns.filter((col) => col.key !== key);
  lot.lines.forEach((line) => { delete line.dataJson[key]; });
}

function addLineRow(lotIndex: number) {
  const lot = form.lots[lotIndex];
  if (!lot.lineColumns.length) {
    const key = nextLineColumnKey(lot);
    lot.lineColumns.push({ key, label: t('tenderCreate.fieldName', { index: 1 }), type: 'text', required: false });
  }
  const dataJson: Record<string, unknown> = {};
  lot.lineColumns.forEach((col) => { dataJson[col.key] = ''; });
  lot.lines.push({ rowNo: lot.lines.length + 1, dataJson });
}

async function removeLineRow(lotIndex: number, rowIndex: number) {
  await ElMessageBox.confirm(t('tenderCreate.deleteRowConfirm'), t('tenderCreate.deleteRow'), {
    type: 'warning',
    confirmButtonText: t('common.confirmDelete'),
    cancelButtonText: t('common.cancel'),
  });
  const lot = form.lots[lotIndex];
  lot.lines.splice(rowIndex, 1);
  lot.lines.forEach((line, index) => { line.rowNo = index + 1; });
}

async function uploadAttachment(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await api.post('/api/uploads/tender-attachments', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const uploaded = res.data.data;
    form.attachments.push({
      key: uploaded.objectKey,
      name: uploaded.fileName,
      size: uploaded.fileSize,
      mimeType: uploaded.mimeType,
      fileUrl: uploaded.fileUrl,
    });
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function buildPayload() {
  return {
    ...form,
    participationMode: form.participationMode,
    participantSupplierIds: form.participationMode === 'selected' ? selectedSupplierIds.value : [],
    participantSource: isNextRoundEdit.value ? roundParticipantMode.value : 'manual',
    bidStartAt: form.bidStartAt ? new Date(form.bidStartAt).toISOString() : null,
    bidDeadline: form.bidDeadline ? new Date(form.bidDeadline).toISOString() : undefined,
    openTime: form.openTime ? new Date(form.openTime).toISOString() : null,
    lots: form.lots.map((lot) => {
      const payload: any = {
        ...lot,
        budgetCurrency: form.baseCurrency || DEFAULT_CURRENCY,
      };
      if (!isTransportTender.value) {
        payload.lineColumns = [];
        payload.lines = [];
      }
      return payload;
    }),
  };
}

async function submit() {
  // 提交前再次验证所有步骤
  for (let i = 0; i < steps.value.length; i++) {
    const e = validateStep(i);
    if (e) { current.value = i; error.value = e; return; }
  }
  error.value = '';
  saving.value = true;
  try {
    if (isEdit.value) {
      await api.patch(`/api/tenders/${route.params.id}`, buildPayload());
      ElMessage.success(t('common.saved'));
    } else {
      await api.post('/api/tenders', buildPayload());
      ElMessage.success(t('tenderCreate.created'));
    }
    closeEditor();
  } catch (e: any) {
    error.value = t(e.response?.data?.error?.message_key ?? e.response?.data?.message ?? 'tenderCreate.saveFailed');
  } finally {
    saving.value = false;
  }
}

function cancel() {
  closeEditor();
}

function closeEditor() {
  window.dispatchEvent(new CustomEvent('bidflow:close-current-tab'));
  setTimeout(() => {
    if (router.currentRoute.value.fullPath === route.fullPath) router.replace('/tenders');
  }, 0);
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

onMounted(async () => {
  await loadTender();
  if (!isEdit.value) await loadSupplierOptions(1);
});
</script>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f6f8fb;
  min-height: calc(100vh - 160px);
}

/* ── Head ── */
.wizard-head {
  padding: 22px 28px 0;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.head-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.head-title h2 { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }

/* ── Steps ── */
.step-bar {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0 0 16px;
  gap: 10px;
  overflow-x: auto;
}
.step {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 180px;
  position: relative;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  cursor: not-allowed;
  opacity: 0.5;
  transition: border-color .18s, background .18s, opacity .18s;
}
.step.clickable { cursor: pointer; opacity: 1; }
.step.active {
  border-color: #2563eb;
  background: #eff6ff;
  opacity: 1;
}
.step.done { opacity: 1; }
.step-circle {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
  transition: all .2s;
}
.step.active .step-circle {
  background: #2563eb;
  color: #fff;
}
.step.done .step-circle {
  background: #10b981;
  color: #fff;
}
.step-text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.step-text strong { font-size: 14px; color: #0f172a; font-weight: 600; }
.step-text small { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.step.active .step-text strong { color: #2563eb; }

/* ── Body ── */
.wizard-body {
  flex: 1;
  padding: 0;
  overflow-y: auto;
}
.step-pane {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.lot-step-pane {
  width: 100%;
  max-width: none;
}
.review-step-pane {
  width: 100%;
  max-width: none;
}
.pane-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px solid #edf2f7;
}
.pane-heading h3 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  line-height: 1.3;
}
.pane-heading p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}
.pane-section-title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.pane-section-title:not(:first-child) { margin-top: 32px; }

/* ── Form grid ── */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 24px;
}
.form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.col-full { grid-column: 1 / -1; }
.form-grid :deep(.el-form-item__label) {
  color: #475569;
  font-weight: 500;
}
.form-grid :deep(.el-input__wrapper),
.form-grid :deep(.el-textarea__inner),
.form-grid :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px #dbe3ef inset;
}
.form-grid :deep(.el-input__wrapper:hover),
.form-grid :deep(.el-textarea__inner:hover),
.form-grid :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #94a3b8 inset;
}

/* ── Ranking cards ── */
.rank-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}
.rank-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
  cursor: pointer;
  transition: all .15s;
}
.rank-card:hover { border-color: #94a3b8; background: #fff; }
.rank-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.rank-radio { margin-top: 3px; accent-color: #2563eb; flex-shrink: 0; }
.rank-body { display: flex; flex-direction: column; gap: 4px; }
.rank-body strong { font-size: 14px; color: #0f172a; }
.rank-body span { font-size: 12px; color: #64748b; line-height: 1.5; }

/* ── Lots ── */
.lot-stack { display: grid; gap: 14px; }
.lot-mode-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-left: 3px solid #2563eb;
  background: #f8fafc;
}
.lot-mode-tip strong {
  color: #1e40af;
  font-size: 14px;
  white-space: nowrap;
}
.lot-mode-tip span {
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
}
.lot-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  transition: border-color .15s;
}
.lot-card:hover { border-color: #bfdbfe; }
.lot-header {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.lot-index {
  width: 30px; height: 30px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.lot-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.lot-meta :deep(.el-form-item) { margin-bottom: 0; }
.lot-meta :deep(.el-form-item__label) { font-size: 12px; color: #64748b; padding-bottom: 4px; line-height: 1.4; }
.line-config {
  margin-top: 2px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  min-width: 0;
}
.line-config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.line-config-head strong {
  display: block;
  font-size: 14px;
  color: #0f172a;
}
.line-config-head span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}
.line-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.line-table {
  width: 100%;
  min-width: 0;
}
.line-col-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.line-col-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.line-col-title button {
  min-width: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.line-col-title :deep(.el-checkbox) {
  height: 18px;
  font-weight: 400;
}
.line-col-title :deep(.el-checkbox__label) {
  padding-left: 4px;
  color: #64748b;
  font-size: 12px;
}
.line-empty {
  padding: 18px 14px;
  font-size: 13px;
  color: #64748b;
  background: #fff;
}
.add-lot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: transparent;
  color: #2563eb;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s;
}
.add-lot-btn:hover { border-color: #2563eb; background: #f0f6ff; }
.add-lot-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
}

/* ── Attachments ── */
.attachment-list { display: grid; gap: 8px; }
.attachment-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.attachment-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  min-width: 0;
  color: #475569;
}
.attachment-preview:hover .attachment-name { color: #2563eb; }
.attachment-name {
  flex: 1;
  font-size: 14px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.attachment-size { font-size: 12px; color: #94a3b8; flex-shrink: 0; }
.upload-empty, .upload-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 32px;
  border: 1.5px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  color: #2563eb;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s;
}
.upload-empty:hover, .upload-add:hover { border-color: #2563eb; background: #f0f6ff; }
.upload-empty:disabled, .upload-add:disabled { opacity: 0.6; cursor: not-allowed; }
.upload-add { padding: 14px; flex-direction: row; }

/* ── Visibility cards ── */
.visibility-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.visibility-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all .15s;
}
.visibility-card:hover { border-color: #cbd5e1; }
.visibility-card.selected {
  border-color: #2563eb;
  background: #f0f6ff;
}
.visibility-card input { margin-top: 4px; accent-color: #2563eb; flex-shrink: 0; }
.visibility-card strong { display: block; font-size: 14px; color: #0f172a; margin-bottom: 4px; }
.visibility-card span { font-size: 12px; color: #64748b; line-height: 1.5; }
.notification-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.notification-card:hover { border-color: #cbd5e1; }
.notification-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.notification-card strong { display: block; font-size: 14px; color: #0f172a; margin-bottom: 4px; }
.notification-card span { font-size: 12px; color: #64748b; line-height: 1.5; }

/* ── Participants ── */
.review-step-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 42%);
  gap: 18px;
  align-items: start;
}
.review-main, .review-side {
  min-width: 0;
}
.review-side {
  position: sticky;
  top: 12px;
}
.participant-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fbfdff;
}
.participation-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.round-mode-block { margin-bottom: 12px; }
.round-mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.round-mode-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.round-mode-row button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}
.round-mode-row button.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}
.supplier-picker {
  display: grid;
  gap: 12px;
}
.supplier-pool { display: grid; gap: 12px; min-width: 0; }
.supplier-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 150px auto;
  gap: 8px;
  align-items: center;
}
.supplier-table :deep(.el-table__cell) { padding: 8px 0; }
.supplier-note {
  display: block;
  margin-top: 3px;
  color: #0369a1;
  font-size: 12px;
  font-weight: 500;
}
.supplier-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #475569;
  font-size: 13px;
}
.selected-suppliers {
  display: grid;
  gap: 8px;
  max-height: 430px;
  overflow: auto;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.selected-head, .selected-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.selected-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
}
.selected-head strong { color: #0f172a; font-size: 14px; }
.selected-row {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}
.selected-row:last-child { border-bottom: 0; }
.selected-row div { min-width: 0; display: grid; gap: 2px; }
.selected-row strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-row span { color: #64748b; font-size: 12px; }
.selected-empty {
  padding: 18px 10px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}
.public-scope-note {
  padding: 12px 14px;
  border-radius: 8px;
  background: #f0f9ff;
  color: #075985;
  font-size: 13px;
}

/* ── Review ── */
.review {
  display: grid;
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
}
.review-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #e5e7eb;
}
.review-row:last-child { border-bottom: none; }
.review-row span { color: #64748b; font-size: 13px; }
.review-row strong { color: #0f172a; font-size: 14px; font-weight: 600; }

/* ── Foot ── */
.wizard-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.foot-error { color: #ef4444; font-size: 13px; }
.foot-spacer { flex: 1; }

/* ── Preview dialog ── */
.preview-frame { width: 100%; height: 72vh; border: 0; }
.preview-fallback { display: grid; justify-items: center; gap: 16px; padding: 48px 0; color: #606266; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .wizard { gap: 12px; }
  .wizard-head, .wizard-foot { padding-left: 16px; padding-right: 16px; }
  .step-pane { padding: 18px; }
  .step-bar { padding-bottom: 16px; }
  .step { min-width: 140px; }
  .step-text small { display: none; }
  .form-grid, .form-grid.three, .rank-options, .lot-meta, .visibility-grid, .participation-toggle {
    grid-template-columns: 1fr;
  }
  .review-step-layout, .supplier-toolbar { grid-template-columns: 1fr; }
  .review-side { position: static; }
  .lot-mode-tip {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .review-row { grid-template-columns: 1fr; gap: 4px; }
}
</style>
