/**
 * 文件：backend/src/shared/export/export.service.ts
 * 功能：按完整或脱敏模式导出招标报价 Excel，所有固定文案通过 I18nService 按当前请求 locale 渲染。
 * 交互：读取 quote/tender/lot/supplier 实体；由 export.controller.ts 调用；写入 audit.service.ts 审计；通过 I18nService.t() 取词条。
 * 作者：吴川
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Quote } from '../../modules/quote/quote.entity';
import { LineQuote } from '../../modules/quote/line-quote.entity';
import { Tender } from '../../modules/tender/tender.entity';
import { Lot } from '../../modules/tender/lot.entity';
import { LotLine } from '../../modules/tender/lot-line.entity';
import { Supplier } from '../../modules/supplier/supplier.entity';
import { AuditService, AuditContext } from '../audit/audit.service';
import { AuditAction, AuditEntityType } from '../audit/audit-log.entity';
import { I18nService } from '../i18n/i18n.service';
import { SupportedLocale } from '../i18n/locale.context';

export type ExportMode = 'full' | 'masked';
export type ExportView = 'item' | 'supplier';

export type ExportOptions = {
  view?: ExportView;
  round?: string;
  fields?: string[];
};

const DEFAULT_FIELDS = [
  'roundNo', 'lotNo', 'lotTitle', 'itemLabel', 'rank',
  'quoteNo', 'supplierBusinessId', 'supplierName',
  'totalPrice', 'currency', 'version', 'submittedAt',
];

const COLLATION_BY_LOCALE: Record<SupportedLocale, string> = {
  'zh-CN': 'zh-Hans-CN',
  en: 'en-US',
  'id-ID': 'id-ID',
};

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(LineQuote) private readonly lineQuoteRepo: Repository<LineQuote>,
    @InjectRepository(Tender) private readonly tenderRepo: Repository<Tender>,
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(LotLine) private readonly lineRepo: Repository<LotLine>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
  ) {}

  // 翻译快捷方法
  private label(field: string) { return this.i18n.t(`export.field.${field}`); }
  private summary(key: string) { return this.i18n.t(`export.summary.${key}`); }
  private hint(key: string) { return this.i18n.t(`export.hint.${key}`); }

  async exportTenderQuotes(
    tenderId: string,
    mode: ExportMode,
    ctx: AuditContext,
    options: ExportOptions = {},
  ): Promise<Buffer> {
    const tender = await this.tenderRepo.findOne({ where: { id: tenderId } });
    if (!tender) throw new Error('error.tender.not_found');

    const lots = await this.lotRepo.find({ where: { tenderId }, order: { sortOrder: 'ASC' } });
    const lines = await this.lineRepo.find({ where: { tenderId, isActive: true }, order: { sortOrder: 'ASC' } });
    const lotMap = new Map(lots.map((lot) => [lot.id, lot]));
    const linesByLot = new Map<string, LotLine[]>();
    for (const line of lines) {
      linesByLot.set(line.lotId, [...(linesByLot.get(line.lotId) ?? []), line]);
    }

    const selectedRound = options.round && options.round !== 'all' ? Number(options.round) : null;
    const targetRounds = selectedRound && Number.isFinite(selectedRound) ? [selectedRound] : undefined;
    const selectedFields = options.fields?.length ? options.fields : DEFAULT_FIELDS;
    const view = options.view ?? 'item';
    const wb = XLSX.utils.book_new();

    this.appendLotDataSheet(wb, lots, linesByLot);

    const supplierMap = await this.buildSupplierMap(tenderId);
    const lineQuotes = await this.lineQuoteRepo.find({
      where: { tenderId, isLatest: true, isValid: true },
      order: { roundNo: 'ASC', totalPrice: 'ASC' },
    });
    const latestLotQuotes = await this.quoteRepo.find({
      where: { tenderId, isLatest: true, isValid: true },
      order: { totalPrice: 'ASC' },
    });
    const filteredLineQuotes = targetRounds
      ? lineQuotes.filter((quote) => targetRounds.includes(quote.roundNo))
      : lineQuotes;

    const lineRows = filteredLineQuotes.map((quote) => {
      const lot = lotMap.get(quote.lotId);
      const line = lines.find((item) => item.id === quote.lineId);
      const supplier = supplierMap.get(quote.supplierId);
      const lineColumns = (lot?.uiSchema?.lineColumns ?? []) as Array<{ key: string; label: string; required?: boolean }>;
      return { quote, lot, line, supplier, lineColumns };
    });
    const lotRows = (!targetRounds || targetRounds.includes(1))
      ? latestLotQuotes.map((quote) => {
        const lot = lotMap.get(quote.lotId);
        const supplier = supplierMap.get(quote.supplierId);
        return {
          quote: { ...quote, roundNo: 1, lineId: null },
          lot,
          line: undefined,
          supplier,
          lineColumns: [] as Array<{ key: string; label: string; required?: boolean }>,
        };
      })
      : [];

    const rankedRows = this.rankRows([...lineRows, ...lotRows]);
    const collation = COLLATION_BY_LOCALE[this.i18n.currentLocale()] ?? 'en-US';
    const sortedRows = [...rankedRows].sort((a, b) => {
      if (view === 'supplier') {
        return this.supplierName(a.supplier, a.quote.supplierId).localeCompare(
          this.supplierName(b.supplier, b.quote.supplierId), collation,
        )
          || (a.lot?.sortOrder ?? 0) - (b.lot?.sortOrder ?? 0)
          || (a.line?.sortOrder ?? 0) - (b.line?.sortOrder ?? 0);
      }
      return (a.lot?.sortOrder ?? 0) - (b.lot?.sortOrder ?? 0)
        || (a.line?.sortOrder ?? 0) - (b.line?.sortOrder ?? 0)
        || a.rank - b.rank;
    });

    const reviewRows = sortedRows.map((row) => this.buildReviewRow(row, selectedFields, mode));
    const reviewSheetName = this.i18n.t(view === 'supplier' ? 'export.sheet.bySupplier' : 'export.sheet.byItem');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(reviewRows.length ? reviewRows : [{ [this.label('key')]: this.hint('noLineQuotes') }]),
      this.safeSheetName(reviewSheetName),
    );

    for (const lot of lots) {
      const quotes = await this.quoteRepo.find({
        where: { lotId: lot.id, isLatest: true, isValid: true },
        order: { totalPrice: 'ASC' },
      });

      const rows = await Promise.all(quotes.map(async (q, i) => {
        const supplier = await this.supplierRepo.findOne({ where: { id: q.supplierId } });
        const anonymousName = this.i18n.t('export.anonymousSupplier', { seq: String(i + 1).padStart(2, '0') });

        if (mode === 'masked') {
          return {
            [this.label('rank')]: i + 1,
            [this.label('quoteNo')]: q.quoteNo,
            [this.label('supplierName')]: anonymousName,
            [this.label('totalPrice')]: Number(q.totalPrice).toFixed(2),
            [this.label('currency')]: q.currency,
            [this.label('version')]: q.version,
            [this.label('submittedAt')]: q.submittedAt.toISOString(),
          };
        }

        return {
          [this.label('rank')]: i + 1,
          [this.label('quoteNo')]: q.quoteNo,
          [this.label('supplierBusinessId')]: supplier?.businessId ?? q.supplierId,
          [this.label('supplierName')]: supplier?.legalName ?? '—',
          [this.label('supplierContact')]: supplier?.contactName ?? '—',
          [this.label('supplierEmail')]: supplier?.contactEmail ?? '—',
          [this.label('totalPrice')]: Number(q.totalPrice).toFixed(4),
          [this.label('currency')]: q.currency,
          [this.label('version')]: q.version,
          [this.label('submittedAt')]: q.submittedAt.toISOString(),
          [this.label('submitIp')]: q.submitIp ?? '—',
        };
      }));

      const lotSheetName = this.i18n.t('export.sheet.lotQuotes', { lotNo: lot.lotNo });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), this.safeSheetName(lotSheetName));
    }

    // 概览
    const k = this.label('key');
    const v = this.label('value');
    const coverData = [
      { [k]: this.summary('tenderNo'), [v]: tender.tenderNo },
      { [k]: this.summary('tenderTitle'), [v]: tender.title },
      { [k]: this.summary('exportMode'), [v]: mode === 'full' ? this.summary('modeFull') : this.summary('modeMasked') },
      { [k]: this.summary('exportView'), [v]: view === 'supplier' ? this.summary('viewSupplier') : this.summary('viewItem') },
      { [k]: this.summary('exportRound'), [v]: options.round && options.round !== 'all' ? options.round : this.summary('allRounds') },
      { [k]: this.summary('exportedAt'), [v]: new Date().toISOString() },
      { [k]: this.summary('operator'), [v]: ctx.userId },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coverData), this.safeSheetName(this.i18n.t('export.sheet.summary')));

    const action = mode === 'full' ? AuditAction.EXPORT_FULL : AuditAction.EXPORT_MASKED;
    await this.audit.log(ctx, AuditEntityType.EXPORT, tenderId, action, undefined, {
      mode, tenderId, locale: this.i18n.currentLocale(),
    });

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private appendLotDataSheet(wb: XLSX.WorkBook, lots: Lot[], linesByLot: Map<string, LotLine[]>) {
    const rows: Record<string, unknown>[] = [];
    for (const lot of lots) {
      const lineColumns = (lot.uiSchema?.lineColumns ?? []) as Array<{ key: string; label: string; required?: boolean }>;
      // 用户自定义字段（required=false 的 lineColumns）按用户填写的 label 输出，不翻译。
      const procurementColumns = lineColumns.filter((col) => !col.required);
      const lines = linesByLot.get(lot.id) ?? [];
      if (!lines.length) {
        rows.push({
          [this.label('lotNo')]: lot.lotNo,
          [this.label('lotTitle')]: lot.title,
          [this.label('lotDescription')]: lot.description ?? '',
          [this.label('quantity')]: lot.quantity ?? '',
          [this.label('unit')]: lot.unit ?? '',
          [this.label('budgetAmount')]: lot.budgetAmount ?? '',
          [this.label('currency')]: lot.budgetCurrency ?? '',
        });
        continue;
      }
      for (const line of lines) {
        const row: Record<string, unknown> = {
          [this.label('lotNo')]: lot.lotNo,
          [this.label('lotTitle')]: lot.title,
          [this.label('rowNo')]: line.rowNo,
        };
        for (const col of procurementColumns) row[col.label] = line.dataJson?.[col.key] ?? '';
        rows.push(row);
      }
    }
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ [this.label('key')]: this.hint('noLotData') }]);
    XLSX.utils.book_append_sheet(wb, sheet, this.safeSheetName(this.i18n.t('export.sheet.lotData')));
  }

  private async buildSupplierMap(tenderId: string) {
    const lineQuotes = await this.lineQuoteRepo.find({ where: { tenderId, isLatest: true, isValid: true } });
    const lotQuotes = await this.quoteRepo.find({ where: { tenderId, isLatest: true, isValid: true } });
    const supplierIds = Array.from(new Set([...lineQuotes, ...lotQuotes].map((q) => q.supplierId).filter(Boolean)));
    if (!supplierIds.length) return new Map<string, Supplier>();
    const suppliers = await this.supplierRepo.find({ where: { id: In(supplierIds) } });
    return new Map(suppliers.map((s) => [s.id, s]));
  }

  private rankRows(rows: Array<{ quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; lineColumns: Array<{ key: string; label: string; required?: boolean }> }>) {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.quote.roundNo}:${row.quote.lineId ?? row.quote.lotId}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const rankMap = new Map<string, number>();
    for (const group of groups.values()) {
      [...group]
        .sort((a, b) => Number(a.quote.totalPrice) - Number(b.quote.totalPrice))
        .forEach((row, index) => rankMap.set(row.quote.id, index + 1));
    }
    return rows.map((row) => ({ ...row, rank: rankMap.get(row.quote.id) ?? 0 }));
  }

  private buildReviewRow(row: {
    quote: any;
    lot?: Lot;
    line?: LotLine;
    supplier?: Supplier;
    lineColumns: Array<{ key: string; label: string; required?: boolean }>;
    rank: number;
  }, fields: string[], mode: ExportMode) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.startsWith('line:')) {
        const key = field.slice(5);
        const col = row.lineColumns.find((item) => item.key === key);
        if (col) out[col.label] = row.line?.dataJson?.[key] ?? '';
        continue;
      }
      if (field.startsWith('supplierItem:')) {
        const key = field.slice(13);
        const col = row.lineColumns.find((item) => item.key === key);
        if (col) out[col.label] = row.quote.items?.[key] ?? '';
        continue;
      }
      out[this.label(field)] = this.baseFieldValue(field, row, mode);
    }
    return out;
  }

  private baseFieldValue(field: string, row: { quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; rank: number }, mode: ExportMode) {
    const quote = row.quote;
    const supplier = row.supplier;
    const anonymous = (seq: number) => this.i18n.t('export.anonymousSupplier', { seq: String(seq).padStart(2, '0') });
    switch (field) {
      case 'roundNo': return quote.roundNo;
      case 'lotNo': return row.lot?.lotNo ?? quote.lotId;
      case 'lotTitle': return row.lot?.title ?? '';
      case 'itemLabel': return this.lineLabel(row.line, row.lot);
      case 'rank': return row.rank;
      case 'quoteNo': return quote.quoteNo;
      case 'supplierBusinessId': return mode === 'masked' ? anonymous(row.rank) : supplier?.businessId ?? quote.supplierId;
      case 'supplierName': return mode === 'masked' ? anonymous(row.rank) : this.supplierName(supplier, quote.supplierId);
      case 'supplierContact': return mode === 'masked' ? '' : supplier?.contactName ?? '';
      case 'supplierPhone': return mode === 'masked' ? '' : supplier?.contactPhone ?? '';
      case 'supplierEmail': return mode === 'masked' ? '' : supplier?.contactEmail ?? '';
      case 'totalPrice': return Number(quote.totalPrice).toFixed(4);
      case 'currency': return quote.currency;
      case 'version': return quote.version;
      case 'submittedAt': return quote.submittedAt?.toISOString?.() ?? '';
      case 'remark': return quote.remark ?? '';
      case 'submitIp': return mode === 'masked' ? '' : quote.submitIp ?? '';
      default: return '';
    }
  }

  private lineLabel(line?: LotLine, lot?: Lot) {
    if (!line) return this.i18n.t('export.lotIntegralQuote');
    const columns = ((lot?.uiSchema?.lineColumns ?? []) as Array<{ key: string; required?: boolean }>).filter((col) => !col.required);
    const values = columns.slice(0, 3)
      .map((col) => line.dataJson?.[col.key])
      .filter((v) => v !== undefined && v !== null && String(v).trim());
    return values.length ? values.join(' / ') : line.lineNo;
  }

  private supplierName(supplier?: Supplier, fallback = '') {
    return supplier?.legalName || supplier?.shortName || fallback;
  }

  private safeSheetName(name: string) {
    return name.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  }
}
