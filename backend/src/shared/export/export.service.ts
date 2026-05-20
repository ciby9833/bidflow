/**
 * 文件：backend/src/shared/export/export.service.ts
 * 功能：按完整或脱敏模式导出招标报价 Excel（exceljs 实现），含概览封面、评审主表、标包数据三个工作表，带专业样式。
 * 交互：读取 quote/tender/lot/supplier 实体；由 export.controller.ts 调用；写入 audit.service.ts 审计；通过 I18nService.t() 取词条。
 * 作者：吴川
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
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

// ── 配色（专业、克制）──
const COLOR = {
  brand: 'FF1E293B', // 深板岩：标题栏 / 表头
  brandText: 'FFFFFFFF',
  band: 'FFF1F5F9', // 斑马纹浅灰
  border: 'FFE2E8F0',
  rankBest: 'FFDCFCE7', // 第一名浅绿
  rankBestText: 'FF15803D',
  labelBg: 'FFF8FAFC',
  subtitle: 'FF64748B',
};

type ColumnKind = 'rank' | 'price' | 'number' | 'text';
interface ReviewColumn { id: string; field: string; header: string; kind: ColumnKind; }

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

    const selectedRound = options.round && options.round !== 'all' ? Number(options.round) : null;
    const targetRounds = selectedRound && Number.isFinite(selectedRound) ? [selectedRound] : undefined;
    const dataSheetRound = selectedRound && Number.isFinite(selectedRound)
      ? selectedRound
      : (tender.currentQuoteRound ?? 1);
    const selectedFields = options.fields?.length ? options.fields : DEFAULT_FIELDS;
    const view = options.view ?? 'item';

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
        return {
          quote: { ...quote, roundNo: 1, lineId: null },
          lot,
          line: undefined,
          supplier: supplierMap.get(quote.supplierId),
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

    // ── 构建工作簿 ──
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BidFlow';
    wb.created = new Date();

    this.buildSummarySheet(wb, tender, mode, view, options);
    this.buildReviewSheet(wb, tender, sortedRows, selectedFields, lots, mode, view);
    this.buildLotDataSheet(wb, lots, lines, dataSheetRound);

    const action = mode === 'full' ? AuditAction.EXPORT_FULL : AuditAction.EXPORT_MASKED;
    await this.audit.log(ctx, AuditEntityType.EXPORT, tenderId, action, undefined, {
      mode, tenderId, locale: this.i18n.currentLocale(),
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ── 概览封面 ───────────────────────────────────────────────
  private buildSummarySheet(wb: ExcelJS.Workbook, tender: Tender, mode: ExportMode, view: ExportView, options: ExportOptions) {
    const ws = wb.addWorksheet(this.safeSheetName(this.i18n.t('export.sheet.summary')), {
      properties: { defaultRowHeight: 20 },
    });
    ws.columns = [{ width: 24 }, { width: 60 }];

    // 标题栏
    ws.mergeCells('A1:B1');
    const titleCell = ws.getCell('A1');
    titleCell.value = tender.title;
    titleCell.font = { bold: true, size: 18, color: { argb: COLOR.brandText } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 40;

    ws.mergeCells('A2:B2');
    const subCell = ws.getCell('A2');
    subCell.value = `${tender.tenderNo}  ·  ${this.i18n.t('export.sheet.byItem')}`;
    subCell.font = { size: 11, color: { argb: COLOR.subtitle } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 22;

    const rows: Array<[string, string]> = [
      [this.summary('tenderNo'), tender.tenderNo],
      [this.summary('tenderTitle'), tender.title],
      [this.summary('exportMode'), mode === 'full' ? this.summary('modeFull') : this.summary('modeMasked')],
      [this.summary('exportView'), view === 'supplier' ? this.summary('viewSupplier') : this.summary('viewItem')],
      [this.summary('exportRound'), options.round && options.round !== 'all' ? options.round : this.summary('allRounds')],
      [this.summary('exportedAt'), this.fmtDate(new Date())],
    ];
    let r = 4;
    for (const [k, v] of rows) {
      const keyCell = ws.getCell(`A${r}`);
      const valCell = ws.getCell(`B${r}`);
      keyCell.value = k;
      valCell.value = v;
      keyCell.font = { bold: true, color: { argb: COLOR.subtitle } };
      keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.labelBg } };
      keyCell.alignment = { vertical: 'middle', indent: 1 };
      valCell.alignment = { vertical: 'middle', indent: 1 };
      for (const c of [keyCell, valCell]) {
        c.border = {
          top: { style: 'thin', color: { argb: COLOR.border } },
          bottom: { style: 'thin', color: { argb: COLOR.border } },
          left: { style: 'thin', color: { argb: COLOR.border } },
          right: { style: 'thin', color: { argb: COLOR.border } },
        };
      }
      ws.getRow(r).height = 24;
      r += 1;
    }
  }

  // ── 评审主表 ───────────────────────────────────────────────
  private buildReviewSheet(
    wb: ExcelJS.Workbook,
    tender: Tender,
    rows: Array<{ quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; rank: number; lineColumns: any[] }>,
    fields: string[],
    lots: Lot[],
    mode: ExportMode,
    view: ExportView,
  ) {
    const sheetName = this.i18n.t(view === 'supplier' ? 'export.sheet.bySupplier' : 'export.sheet.byItem');
    const ws = wb.addWorksheet(this.safeSheetName(sheetName), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // 用户自定义字段的标签映射
    const colLabelMap = new Map<string, string>();
    for (const lot of lots) {
      for (const c of ((lot.uiSchema?.lineColumns ?? []) as Array<{ key: string; label: string }>)) {
        colLabelMap.set(c.key, c.label);
      }
    }
    const columns = this.buildReviewColumns(fields, colLabelMap);
    ws.columns = columns.map((c) => ({ key: c.id, header: c.header, width: 16 }));

    // 表头样式
    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLOR.brandText }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // 数据行
    if (!rows.length) {
      ws.addRow({ [columns[0].id]: this.hint('noLineQuotes') });
    }
    rows.forEach((row, index) => {
      const record: Record<string, unknown> = {};
      for (const col of columns) record[col.id] = this.cellValue(col, row, mode);
      const added = ws.addRow(record);
      added.height = 22;
      const isBest = row.rank === 1;
      added.eachCell((cell, colNumber) => {
        const col = columns[colNumber - 1];
        cell.border = {
          top: { style: 'hair', color: { argb: COLOR.border } },
          bottom: { style: 'hair', color: { argb: COLOR.border } },
          left: { style: 'hair', color: { argb: COLOR.border } },
          right: { style: 'hair', color: { argb: COLOR.border } },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: col?.kind === 'price' || col?.kind === 'number' || col?.kind === 'rank' ? 'right' : 'left',
          indent: 1,
        };
        if (col?.kind === 'price') cell.numFmt = '#,##0.00';
        // 斑马纹
        if (index % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
        }
        // 第一名整行高亮
        if (isBest) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.rankBest } };
          if (col?.kind === 'rank') cell.font = { bold: true, color: { argb: COLOR.rankBestText } };
        }
      });
    });

    this.autoWidth(ws, columns);
  }

  private buildReviewColumns(fields: string[], colLabelMap: Map<string, string>): ReviewColumn[] {
    const kindOf = (field: string): ColumnKind => {
      if (field === 'rank') return 'rank';
      if (field === 'totalPrice') return 'price';
      if (field === 'roundNo' || field === 'version') return 'number';
      return 'text';
    };
    return fields.map((field, idx) => {
      if (field.startsWith('line:') || field.startsWith('supplierItem:')) {
        const key = field.split(':')[1];
        return {
          id: `c${idx}`, field, header: colLabelMap.get(key) ?? key, kind: 'text' as ColumnKind,
        };
      }
      return {
        id: `c${idx}`, field, header: this.label(field), kind: kindOf(field),
      };
    });
  }

  private cellValue(
    col: ReviewColumn,
    row: { quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; rank: number; lineColumns: Array<{ key: string; label: string; required?: boolean }> },
    mode: ExportMode,
  ): unknown {
    if (col.field.startsWith('line:')) {
      const key = col.field.slice(5);
      return row.line?.dataJson?.[key] ?? '';
    }
    if (col.field.startsWith('supplierItem:')) {
      const key = col.field.slice(13);
      return (row.quote.items as Record<string, unknown> | undefined)?.[key] ?? '';
    }
    return this.baseFieldValue(col.field, row, mode);
  }

  // ── 标包数据 ───────────────────────────────────────────────
  private buildLotDataSheet(wb: ExcelJS.Workbook, lots: Lot[], lines: LotLine[], round: number) {
    const ws = wb.addWorksheet(this.safeSheetName(this.i18n.t('export.sheet.lotData')), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const linesByLot = new Map<string, LotLine[]>();
    for (const line of lines) {
      if (line.roundNo !== round) continue;
      linesByLot.set(line.lotId, [...(linesByLot.get(line.lotId) ?? []), line]);
    }

    // 汇总所有标包用到的自定义列
    const dynCols: Array<{ key: string; label: string }> = [];
    const seen = new Set<string>();
    for (const lot of lots) {
      for (const c of ((lot.uiSchema?.lineColumns ?? []) as Array<{ key: string; label: string; required?: boolean }>)) {
        if (!c.required && !seen.has(c.key)) { seen.add(c.key); dynCols.push({ key: c.key, label: c.label }); }
      }
    }

    const headers = [this.label('lotNo'), this.label('lotTitle'), this.label('rowNo'), ...dynCols.map((c) => c.label)];
    ws.columns = headers.map((h) => ({ header: h, width: 16 }));
    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLOR.brandText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    const dataRows: unknown[][] = [];
    for (const lot of lots) {
      const lotLines = linesByLot.get(lot.id) ?? [];
      if (!lotLines.length) {
        dataRows.push([lot.lotNo, lot.title, '', ...dynCols.map(() => '')]);
        continue;
      }
      for (const line of lotLines) {
        dataRows.push([lot.lotNo, lot.title, line.rowNo, ...dynCols.map((c) => line.dataJson?.[c.key] ?? '')]);
      }
    }
    if (!dataRows.length) dataRows.push([this.hint('noLotData')]);

    dataRows.forEach((cells, index) => {
      const added = ws.addRow(cells);
      added.height = 20;
      added.eachCell((cell) => {
        cell.border = {
          top: { style: 'hair', color: { argb: COLOR.border } },
          bottom: { style: 'hair', color: { argb: COLOR.border } },
          left: { style: 'hair', color: { argb: COLOR.border } },
          right: { style: 'hair', color: { argb: COLOR.border } },
        };
        cell.alignment = { vertical: 'middle', indent: 1 };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
      });
    });
    this.autoWidth(ws);
  }

  // ── 列宽自适应（CJK 字符按 2 宽计算）──
  private autoWidth(ws: ExcelJS.Worksheet, columns?: ReviewColumn[]) {
    ws.columns?.forEach((col, idx) => {
      let max = 8;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const text = cell.value == null ? '' : String(cell.value);
        const width = [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
        if (width > max) max = width;
      });
      col.width = Math.min(Math.max(max + 3, 12), 48);
    });
  }

  // ── 数据装配（沿用原逻辑）──
  private async buildSupplierMap(tenderId: string) {
    const lineQuotes = await this.lineQuoteRepo.find({ where: { tenderId, isLatest: true, isValid: true } });
    const lotQuotes = await this.quoteRepo.find({ where: { tenderId, isLatest: true, isValid: true } });
    const supplierIds = Array.from(new Set([...lineQuotes, ...lotQuotes].map((q) => q.supplierId).filter(Boolean)));
    if (!supplierIds.length) return new Map<string, Supplier>();
    const suppliers = await this.supplierRepo.find({ where: { id: In(supplierIds) } });
    return new Map(suppliers.map((s) => [s.id, s]));
  }

  private rankRows(rows: Array<{ quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; lineColumns: any[] }>) {
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

  private baseFieldValue(field: string, row: { quote: any; lot?: Lot; line?: LotLine; supplier?: Supplier; rank: number }, mode: ExportMode): unknown {
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
      case 'totalPrice': return Number(quote.totalPrice);
      case 'currency': return quote.currency;
      case 'version': return quote.version;
      case 'submittedAt': return this.fmtDate(quote.submittedAt);
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

  private fmtDate(value?: Date | string): string {
    if (!value) return '';
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
  }

  private safeSheetName(name: string) {
    return name.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  }
}
