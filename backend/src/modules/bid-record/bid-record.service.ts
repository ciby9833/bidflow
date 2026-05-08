/**
 * 文件：backend/src/modules/bid-record/bid-record.service.ts
 * 功能：聚合供应商自己的投标记录，统一普通标包报价与运力线路报价的列表视图。
 * 交互：被 bid-record.controller.ts 调用；读取 quote/line_quote/tender/lot/line 实体，不修改业务数据。
 * 作者：吴川
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Quote } from '../quote/quote.entity';
import { LineQuote } from '../quote/line-quote.entity';
import { LotLine } from '../tender/lot-line.entity';
import { Invitation } from '../tender/invitation.entity';
import { Supplier, SupplierReviewStatus, SupplierStatus } from '../supplier/supplier.entity';
import { ParticipationMode, TenderStatus, TenderType } from '../tender/tender.entity';

export type BidRecordKind = 'lot' | 'line';

export interface BidRecordFilters {
  search?: string;
  status?: TenderStatus;
  type?: TenderType;
  kind?: BidRecordKind;
  participationScope?: 'invited' | 'public';
  page?: number;
  limit?: number;
}

export interface BidRecordItem {
  id: string;
  kind: BidRecordKind;
  tenderId: string;
  tenderNo: string;
  tenderTitle: string;
  tenderType: TenderType;
  tenderStatus: TenderStatus;
  participationMode?: ParticipationMode;
  participationScope?: 'invited' | 'public';
  currentQuoteRound?: number;
  bidDeadline?: Date;
  openTime?: Date;
  lotId: string;
  lotNo: string;
  lotTitle: string;
  latestQuoteNo: string;
  latestTotalPrice: number;
  currency: string;
  version: number;
  submittedAt: Date;
  quoteCount: number;
  roundNo?: number;
  submittedLineCount?: number;
  totalLineCount?: number;
}

@Injectable()
export class BidRecordService {
  constructor(
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(LineQuote) private readonly lineQuoteRepo: Repository<LineQuote>,
    @InjectRepository(LotLine) private readonly lineRepo: Repository<LotLine>,
    @InjectRepository(Invitation) private readonly invitationRepo: Repository<Invitation>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async listMine(supplierId: string, filters: BidRecordFilters): Promise<{
    items: BidRecordItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.ensureSupplierApproved(supplierId);

    const [lotRecords, lineRecords] = await Promise.all([
      filters.kind === 'line' ? Promise.resolve([]) : this.getLotRecords(supplierId),
      filters.kind === 'lot' ? Promise.resolve([]) : this.getLineRecords(supplierId),
    ]);

    const visibleRecords = await this.filterCurrentRoundAccess([...lotRecords, ...lineRecords], supplierId);
    const keyword = filters.search?.trim().toLowerCase();
    const filtered = visibleRecords
      .filter((item) => !filters.status || item.tenderStatus === filters.status)
      .filter((item) => !filters.type || item.tenderType === filters.type)
      .filter((item) => !filters.participationScope || item.participationScope === filters.participationScope)
      .filter((item) => !keyword || [
        item.tenderNo,
        item.tenderTitle,
        item.lotNo,
        item.lotTitle,
        item.latestQuoteNo,
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword)))
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  private async getLotRecords(supplierId: string): Promise<BidRecordItem[]> {
    const latestQuotes = await this.quoteRepo.find({
      where: { supplierId, isLatest: true, isValid: true },
      relations: ['lot', 'lot.tender'],
      order: { submittedAt: 'DESC' },
    });
    if (!latestQuotes.length) return [];

    const allQuotes = await this.quoteRepo.find({
      where: { supplierId, lotId: In(latestQuotes.map((quote) => quote.lotId)) },
      select: ['id', 'lotId'],
    });
    const quoteCountMap = this.countBy(allQuotes, 'lotId');

    return latestQuotes
      .filter((quote) => quote.lot?.tender)
      .map((quote) => ({
        id: `lot:${quote.lotId}`,
        kind: 'lot',
        tenderId: quote.tenderId,
        tenderNo: quote.lot.tender.tenderNo,
        tenderTitle: quote.lot.tender.title,
        tenderType: quote.lot.tender.type,
        tenderStatus: quote.lot.tender.status,
        participationMode: quote.lot.tender.participationMode,
        participationScope: quote.lot.tender.participationMode === ParticipationMode.SELECTED ? 'invited' : 'public',
        currentQuoteRound: quote.lot.tender.currentQuoteRound,
        bidDeadline: quote.lot.tender.bidDeadline,
        openTime: quote.lot.tender.openTime,
        lotId: quote.lotId,
        lotNo: quote.lot.lotNo,
        lotTitle: quote.lot.title,
        latestQuoteNo: quote.quoteNo,
        latestTotalPrice: Number(quote.totalPrice),
        currency: quote.currency,
        version: quote.version,
        submittedAt: quote.submittedAt,
        quoteCount: quoteCountMap.get(quote.lotId) ?? 1,
      }));
  }

  private async getLineRecords(supplierId: string): Promise<BidRecordItem[]> {
    const latestQuotes = await this.lineQuoteRepo.find({
      where: { supplierId, isLatest: true, isValid: true },
      relations: ['line', 'line.lot', 'line.tender'],
      order: { submittedAt: 'DESC' },
    });
    if (!latestQuotes.length) return [];

    const lotIds = Array.from(new Set(latestQuotes.map((quote) => quote.lotId)));
    const [allLineQuotes, lines] = await Promise.all([
      this.lineQuoteRepo.find({
        where: { supplierId, lotId: In(lotIds) },
        select: ['id', 'lotId', 'roundNo'],
      }),
      this.lineRepo.find({
        where: { lotId: In(lotIds), isActive: true },
        select: ['id', 'lotId'],
      }),
    ]);
    const lineCountMap = this.countBy(lines, 'lotId');

    const grouped = new Map<string, LineQuote[]>();
    for (const quote of latestQuotes) {
      if (!quote.line?.lot || !quote.line?.tender) continue;
      const key = `${quote.lotId}:${quote.roundNo}`;
      grouped.set(key, [...(grouped.get(key) ?? []), quote]);
    }

    return Array.from(grouped.entries()).map(([key, quotes]) => {
      const latest = quotes.reduce((current, quote) => (
        new Date(quote.submittedAt).getTime() > new Date(current.submittedAt).getTime() ? quote : current
      ), quotes[0]);
      const tender = latest.line.tender;
      const lot = latest.line.lot;
      const lotId = latest.lotId;
      const total = quotes.reduce((sum, quote) => sum + Number(quote.totalPrice), 0);
      const maxVersion = Math.max(...quotes.map((quote) => Number(quote.version ?? 1)));
      return {
        id: `line:${key}`,
        kind: 'line',
        tenderId: latest.tenderId,
        tenderNo: tender.tenderNo,
        tenderTitle: tender.title,
        tenderType: tender.type,
        tenderStatus: tender.status,
        participationMode: tender.participationMode,
        participationScope: tender.participationMode === ParticipationMode.SELECTED ? 'invited' : 'public',
        currentQuoteRound: tender.currentQuoteRound,
        bidDeadline: tender.bidDeadline,
        openTime: tender.openTime,
        lotId,
        lotNo: lot.lotNo,
        lotTitle: lot.title,
        latestQuoteNo: latest.quoteNo,
        latestTotalPrice: total,
        currency: latest.currency,
        version: maxVersion,
        submittedAt: latest.submittedAt,
        quoteCount: allLineQuotes.filter((quote) => quote.lotId === lotId && quote.roundNo === latest.roundNo).length,
        roundNo: latest.roundNo,
        submittedLineCount: quotes.length,
        totalLineCount: lineCountMap.get(lotId) ?? quotes.length,
      };
    });
  }

  private countBy<T, K extends keyof T>(items: T[], key: K) {
    const map = new Map<string, number>();
    for (const item of items) {
      const value = String(item[key] ?? '');
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return map;
  }

  private async filterCurrentRoundAccess(records: BidRecordItem[], supplierId: string) {
    const selectedRecords = records.filter((item) => item.participationMode === ParticipationMode.SELECTED);
    if (!selectedRecords.length) return records;

    const scopes = Array.from(
      new Map(
        selectedRecords.map((item) => {
          const roundNo = item.currentQuoteRound ?? item.roundNo ?? 1;
          return [`${item.tenderId}:${roundNo}`, { tenderId: item.tenderId, roundNo }];
        }),
      ).values(),
    );
    const invitations = await this.invitationRepo.find({
      where: scopes.map((scope) => ({
        tenderId: scope.tenderId,
        supplierId,
        roundNo: scope.roundNo,
      })),
      select: ['tenderId', 'roundNo'],
    });
    const accessibleScope = new Set(invitations.map((item) => `${item.tenderId}:${item.roundNo}`));

    return records.filter((item) => {
      if (item.participationMode !== ParticipationMode.SELECTED) return true;
      const roundNo = item.currentQuoteRound ?? item.roundNo ?? 1;
      return accessibleScope.has(`${item.tenderId}:${roundNo}`);
    });
  }

  private async ensureSupplierApproved(supplierId: string) {
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('error.supplier.not_found');
    if (supplier.status !== SupplierStatus.ACTIVE || supplier.reviewStatus !== SupplierReviewStatus.APPROVED) {
      throw new ForbiddenException('error.supplier.certification_required');
    }
  }
}
