/**
 * 文件：backend/src/modules/quote/quote.service.ts
 * 功能：实现报价提交、改价频控、Redis 排名、排名读取、快照生成与重建。
 * 交互：被 quote.controller.ts 调用；依赖 quote.entity.ts / ranking-snapshot.entity.ts；读取 tender 与 lot 配置并通过 redis.config.ts 推送实时排名。
 * 作者：吴川
 */
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Quote } from './quote.entity';
import { LineQuote } from './line-quote.entity';
import { LotQuoteAttachment, QuoteAttachmentItem } from './lot-quote-attachment.entity';
import { RankingSnapshot, SnapshotTrigger } from './ranking-snapshot.entity';
import { ParticipationMode, Tender, TenderStatus } from '../tender/tender.entity';
import { Lot } from '../tender/lot.entity';
import { LotLine } from '../tender/lot-line.entity';
import { Invitation } from '../tender/invitation.entity';
import { RedisService } from '../../shared/config/redis.config';
import {
  InjectTenantRepository, TenantRepository,
} from '../../shared/tenant/tenant-repository';
import { BranchScope } from '../../shared/tenant/branch-scope';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import { Supplier, SupplierReviewStatus, SupplierStatus } from '../supplier/supplier.entity';
import { I18nService } from '../../shared/i18n/i18n.service';

function quoteNo(seq: number): string {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  return `Q-${ym}-${String(seq).padStart(6, '0')}`;
}

function lineQuoteNo(seq: number): string {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  return `QL-${ym}-${String(seq).padStart(6, '0')}`;
}

/**
 * 取机构内该编号前缀的下一个序号。
 * 用最大序号 +1 而非按行数计数：历史删除会让计数落后于实际序号，随后生成的编号会与既有记录撞唯一键
 * （招标编号曾因同样写法在生产触发 duplicate key）。序号按机构独立，各国机构互不干扰。
 */
async function nextQuoteSeq(
  em: EntityManager,
  entity: typeof Quote | typeof LineQuote,
  prefix: string,
  branchId: string,
): Promise<number> {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const row = await em
    .createQueryBuilder(entity, 'q')
    .select('MAX(CAST(RIGHT(q.quoteNo, 6) AS INT))', 'max')
    .where('q.quoteNo LIKE :p', { p: `${prefix}-${ym}-%` })
    .andWhere('q.branchId = :branchId', { branchId })
    .getRawOne<{ max: string | null }>();
  return Number(row?.max ?? 0) + 1;
}

function rebidCountFromQuoteCount(quoteCount: number): number {
  return Math.max(0, quoteCount - 1);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Redis key schema per §4.1
const KEYS = {
  rank: (lotId: string) => `lot:${lotId}:rank`,
  latest: (lotId: string) => `lot:${lotId}:latest`,
  rebid: (lotId: string, sup: string) => `lot:${lotId}:rebid:${sup}`,
  cooldown: (lotId: string, sup: string) => `lot:${lotId}:cooldown:${sup}`,
  lineRank: (lineId: string, roundNo: number) => `line:${lineId}:round:${roundNo}:rank`,
  lineLatest: (lineId: string, roundNo: number) => `line:${lineId}:round:${roundNo}:latest`,
  lineCooldown: (lineId: string, roundNo: number, sup: string) => `line:${lineId}:round:${roundNo}:cooldown:${sup}`,
  lineRebid: (lineId: string, roundNo: number, sup: string) => `line:${lineId}:round:${roundNo}:rebid:${sup}`,
  lineSubmitLock: (lineId: string, roundNo: number, sup: string) => `line:${lineId}:round:${roundNo}:submit:${sup}`,
  channel: (lotId: string) => `lot:${lotId}:channel`,
  submitLock: (lotId: string, sup: string) => `lot:${lotId}:submit:${sup}`,
};

@Injectable()
export class QuoteService {
  constructor(
    @InjectTenantRepository(Tender) private readonly tenders: TenantRepository<Tender>,
    @InjectTenantRepository(Lot) private readonly lots: TenantRepository<Lot>,
    @InjectTenantRepository(LotLine) private readonly lines: TenantRepository<LotLine>,
    // tenant-guard: allow 锚点已在入口校验机构归属，下游查询由锚点派生
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(LineQuote) private readonly lineQuoteRepo: Repository<LineQuote>,
    @InjectRepository(LotQuoteAttachment) private readonly lotAttachmentRepo: Repository<LotQuoteAttachment>,
    @InjectRepository(RankingSnapshot) private readonly snapshotRepo: Repository<RankingSnapshot>,
    @InjectRepository(Tender) private readonly tenderRepo: Repository<Tender>,
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(LotLine) private readonly lineRepo: Repository<LotLine>,
    @InjectRepository(Invitation) private readonly invRepo: Repository<Invitation>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
    private readonly ds: DataSource,
  ) {}

  // ── 标包级投标附件（盖章报价单等，按 招标+标包+供应商+轮次 一份，最多 5 个）──
  private static readonly MAX_QUOTE_ATTACHMENTS = 5;
  private static readonly FRANKFURTER_API = 'https://api.frankfurter.dev';

  // ── 机构锚点 ──────────────────────────────────────────────────────────────
  // 报价域的所有操作都锚定在 lot 或 line 上，后续查询的 tenderId / lotId 均由锚点派生。
  // 因此只需在入口校验锚点归属，下游查询自然落在同一机构内，
  // 无需给每一处 findOne 单独附加机构条件 —— 那样既冗余又容易遗漏。

  /** 取标包并校验机构归属。跨机构的 lotId 一律按"不存在"处理，不泄漏其存在性。 */
  private async requireLot(scope: BranchScope, lotId: string): Promise<Lot> {
    const lot = await this.lots.findById(scope, lotId);
    if (!lot) throw new NotFoundException('error.lot.not_found');
    return lot;
  }

  /** 取品目并校验机构归属。 */
  private async requireLine(scope: BranchScope, lineId: string): Promise<LotLine> {
    const line = await this.lines.findById(scope, lineId);
    if (!line) throw new NotFoundException('error.line.not_found');
    return line;
  }

  /** 取招标并校验机构归属。 */
  private async requireTender(scope: BranchScope, tenderId: string): Promise<Tender> {
    const tender = await this.tenders.findById(scope, tenderId);
    if (!tender) throw new NotFoundException('error.tender.not_found');
    return tender;
  }

  private async resolveLotContext(
    scope: BranchScope,
    lotId: string,
  ): Promise<{ tenderId: string; roundNo: number; branchId: string }> {
    const lot = await this.requireLot(scope, lotId);
    const tender = await this.requireTender(scope, lot.tenderId);
    return { tenderId: lot.tenderId, roundNo: tender.currentQuoteRound ?? 1, branchId: lot.branchId };
  }

  /** 供应商保存某标包当前轮的投标附件（整份覆盖）。 */
  async saveLotAttachments(scope: BranchScope, lotId: string, supplierId: string, attachments: QuoteAttachmentItem[]) {
    const list = (attachments ?? []).slice(0, QuoteService.MAX_QUOTE_ATTACHMENTS).map((a) => ({
      key: String(a.key),
      name: String(a.name ?? '附件'),
      size: Number(a.size ?? 0),
      mimeType: a.mimeType,
      fileUrl: a.fileUrl,
    }));
    if ((attachments?.length ?? 0) > QuoteService.MAX_QUOTE_ATTACHMENTS) {
      throw new BadRequestException('error.upload.file_too_many');
    }
    const { tenderId, roundNo, branchId } = await this.resolveLotContext(scope, lotId);
    const existing = await this.lotAttachmentRepo.findOne({ where: { tenderId, lotId, supplierId, roundNo } });
    if (existing) {
      existing.attachments = list;
      await this.lotAttachmentRepo.save(existing);
      return existing;
    }
    const created = this.lotAttachmentRepo.create({ branchId, tenderId, lotId, supplierId, roundNo, attachments: list });
    return this.lotAttachmentRepo.save(created);
  }

  /** 供应商读取自己在某标包当前轮的投标附件。 */
  async getMyLotAttachments(scope: BranchScope, lotId: string, supplierId: string) {
    const { tenderId, roundNo } = await this.resolveLotContext(scope, lotId);
    const row = await this.lotAttachmentRepo.findOne({ where: { tenderId, lotId, supplierId, roundNo } });
    return { roundNo, attachments: row?.attachments ?? [] };
  }

  /** 评审方读取某标包指定轮次（缺省为当前轮）所有供应商的投标附件，附带供应商名称。 */
  async getLotAttachmentsForReview(scope: BranchScope, lotId: string, roundNo?: number) {
    const ctx = await this.resolveLotContext(scope, lotId);
    const targetRound = roundNo && Number.isFinite(roundNo) ? Number(roundNo) : ctx.roundNo;
    const rows = await this.lotAttachmentRepo.find({ where: { tenderId: ctx.tenderId, lotId, roundNo: targetRound } });
    const supplierIds = Array.from(new Set(rows.map((r) => r.supplierId).filter(Boolean)));
    const suppliers = supplierIds.length ? await this.supplierRepo.find({ where: { id: In(supplierIds) } }) : [];
    const nameMap = new Map(suppliers.map((s) => [s.id, s.legalName || s.shortName || s.businessId || s.id]));
    return rows.map((r) => ({
      supplierId: r.supplierId,
      supplierName: nameMap.get(r.supplierId) ?? r.supplierId,
      roundNo: r.roundNo,
      attachments: r.attachments ?? [],
    }));
  }

  private normalizeCurrency(currency: string) {
    return String(currency || '').trim().toUpperCase();
  }

  private quoteRankPrice(quote: { priceInBase?: number | string | null; totalPrice: number | string }) {
    const converted = Number(quote.priceInBase);
    if (Number.isFinite(converted) && converted > 0) return converted;
    return Number(quote.totalPrice);
  }

  private async resolveConversion(totalPrice: number, currency: string, baseCurrency: string, at: Date) {
    const fromCurrency = this.normalizeCurrency(currency);
    const toCurrency = this.normalizeCurrency(baseCurrency);
    const exchangeRateDate = isoDate(at);

    if (!fromCurrency || !toCurrency) throw new BadRequestException('error.quote.currency_required');
    if (fromCurrency === toCurrency) {
      return {
        currency: fromCurrency,
        baseCurrency: toCurrency,
        exchangeRate: 1,
        exchangeRateDate,
        exchangeRateSource: 'same_currency',
        priceInBase: Number(totalPrice),
      };
    }

    const url = `${QuoteService.FRANKFURTER_API}/v2/rate/${encodeURIComponent(fromCurrency)}/${encodeURIComponent(toCurrency)}?date=${exchangeRateDate}`;
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => null) as { rate?: number; date?: string; message?: string } | null;
      if (!res.ok || !data?.rate) {
        throw new BadRequestException({
          code: 'EXCHANGE_RATE_UNAVAILABLE',
          message_key: 'error.quote.exchange_rate_unavailable',
          detail: { from_currency: fromCurrency, to_currency: toCurrency, date: exchangeRateDate, provider_message: data?.message },
        });
      }
      const rate = Number(data.rate);
      return {
        currency: fromCurrency,
        baseCurrency: toCurrency,
        exchangeRate: rate,
        exchangeRateDate: data.date ?? exchangeRateDate,
        exchangeRateSource: 'frankfurter',
        priceInBase: Math.round(Number(totalPrice) * rate * 10000) / 10000,
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException({
        code: 'EXCHANGE_RATE_UNAVAILABLE',
        message_key: 'error.quote.exchange_rate_unavailable',
        detail: { from_currency: fromCurrency, to_currency: toCurrency, date: exchangeRateDate },
      });
    }
  }

  // ── §4.2 Write Path ─────────────────────────────────────────────────────
  async submit(scope: BranchScope, data: {
    lotId: string;
    supplierId: string;
    totalPrice: number;
    currency: string;
    items?: Record<string, unknown>[];
    remark?: string;
    idempotencyKey?: string;
  }, submitIp: string, ctx: AuditContext) {

    const { lotId, supplierId } = data;
    await this.ensureSupplierApproved(supplierId);

    const lot = await this.requireLot(scope, lotId);
    const tenderId = lot.tenderId;

    // ① Idempotency check (if rebid supplies a key)
    if (data.idempotencyKey) {
      const existing = await this.quoteRepo.findOne({
        where: { tenderId, lotId, supplierId, idempotencyKey: data.idempotencyKey },
      });
      if (existing) return { quote: existing, idempotent: true };
    }

    // ② Deadline check
    const tender = await this.requireTender(scope, tenderId);
    await this.ensureCanParticipate(tender, supplierId);
    const now = new Date();
    if (tender.status === TenderStatus.PUBLISHED && (!tender.bidStartAt || tender.bidStartAt <= now) && (!tender.bidDeadline || tender.bidDeadline > now)) {
      await this.tenderRepo.update(tender.id, { status: TenderStatus.OPEN });
      tender.status = TenderStatus.OPEN;
    }
    if ([TenderStatus.PUBLISHED, TenderStatus.OPEN].includes(tender.status) && tender.bidDeadline && tender.bidDeadline <= now) {
      await this.tenderRepo.update(tender.id, { status: TenderStatus.CLOSED });
      tender.status = TenderStatus.CLOSED;
    }
    if (tender.status !== TenderStatus.OPEN) throw new ForbiddenException('error.quote.tender_not_open');
    if (tender.bidDeadline && now > tender.bidDeadline) {
      throw new ForbiddenException('error.quote.deadline_passed');
    }

    // ③ Distributed lock (prevent concurrent submission from same supplier)
    const lockKey = KEYS.submitLock(lotId, supplierId);
    const locked = await this.redis.setnx(lockKey, '1', 5);
    if (!locked) throw new ConflictException('error.quote.concurrent_submit');

    try {
      // ④ Cooldown check
      const cooldownKey = KEYS.cooldown(lotId, supplierId);
      const onCooldown = await this.redis.exists(cooldownKey);
      if (onCooldown) {
        const ttl = await this.redis.raw.ttl(cooldownKey);
        throw new BadRequestException({
          code: 'COOLDOWN_ACTIVE',
          message_key: 'error.quote.cooldown_active',
          detail: { retry_after_seconds: ttl },
        });
      }

      // ⑤ Rebid count check
      const existing = await this.quoteRepo.findOne({ where: { lotId, supplierId, isLatest: true } });
      const isRebid = !!existing;
      const conversion = await this.resolveConversion(data.totalPrice, data.currency, tender.baseCurrency, now);

      if (isRebid) {
        const quoteCount = await this.quoteRepo.count({ where: { lotId, supplierId } });
        const rebidCount = rebidCountFromQuoteCount(quoteCount);
        if (rebidCount >= tender.maxRebidCount) {
          throw new BadRequestException({
            code: 'REBID_LIMIT_REACHED',
            message_key: 'error.quote.rebid_limit_reached',
            detail: { remaining: 0 },
          });
        }

        // ⑥ Min decrement check
        const minPct = Number(tender.minDecrementPct);
        const lastPrice = this.quoteRankPrice(existing);
        const maxAllowed = lastPrice * (1 - minPct / 100);
        if (conversion.priceInBase > maxAllowed) {
          throw new BadRequestException({
            code: 'MIN_DECREMENT_FAIL',
            message_key: 'error.quote.min_decrement_fail',
            detail: {
              required_price: Math.floor((maxAllowed / conversion.exchangeRate) * 100) / 100,
              required_price_base: maxAllowed,
              base_currency: conversion.baseCurrency,
              exchange_rate: conversion.exchangeRate,
            },
          });
        }
      }

      // ⑦ DB transaction (optimistic lock + version bump)
      const idempotencyKey = data.idempotencyKey ?? uuidv4();
      const newQuote = await this.ds.transaction(async (em) => {
        if (existing) {
          const updateResult = await em.update(Quote,
            { lotId, supplierId, isLatest: true, version: existing.version },
            { isLatest: false },
          );
          if (updateResult.affected === 0) {
            throw new ConflictException('error.quote.version_conflict');
          }
        }

        const nextSeq = await nextQuoteSeq(em, Quote, 'Q', lot.branchId);
        const q = em.create(Quote, {
          branchId: lot.branchId,
          quoteNo: quoteNo(nextSeq),
          tenderId,
          lotId,
          supplierId,
          version: existing ? existing.version + 1 : 1,
          isLatest: true,
          totalPrice: data.totalPrice,
          currency: conversion.currency,
          exchangeRate: conversion.exchangeRate,
          exchangeRateDate: conversion.exchangeRateDate,
          exchangeRateSource: conversion.exchangeRateSource,
          baseCurrency: conversion.baseCurrency,
          priceInBase: conversion.priceInBase,
          lotSchemaVersion: lot.schemaVersion,
          items: data.items,
          remark: data.remark,
          idempotencyKey,
          submitIp,
        });
        return em.save(q);
      });

      // ⑧ Redis write
      const price = Number(conversion.priceInBase);
      await this.redis.zadd(KEYS.rank(lotId), price, supplierId);
      await this.redis.hset(KEYS.latest(lotId), supplierId, JSON.stringify({
        version: newQuote.version,
        totalPrice: Number(data.totalPrice),
        currency: conversion.currency,
        baseCurrency: conversion.baseCurrency,
        exchangeRate: conversion.exchangeRate,
        exchangeRateDate: conversion.exchangeRateDate,
        priceInBase: price,
        submittedAt: newQuote.submittedAt,
      }));
      await this.redis.set(KEYS.cooldown(lotId, supplierId), '1', tender.cooldownSeconds);

      if (isRebid) {
        const rebidKey = KEYS.rebid(lotId, supplierId);
        const quoteCount = await this.quoteRepo.count({ where: { lotId, supplierId } });
        await this.redis.set(rebidKey, String(rebidCountFromQuoteCount(quoteCount)));
      }

      // ⑨ Publish ranking event
      const rank = await this.redis.zrank(KEYS.rank(lotId), supplierId);
      const total = await this.redis.zcard(KEYS.rank(lotId));
      await this.redis.publish(KEYS.channel(lotId), JSON.stringify({
        type: 'rank_update', supplierId, rank, total, price, baseCurrency: conversion.baseCurrency,
      }));

      await this.audit.log(ctx, AuditEntityType.QUOTE, newQuote.id,
        isRebid ? AuditAction.QUOTE_REBID : AuditAction.QUOTE_SUBMIT,
        existing ? { price: existing.totalPrice, version: existing.version } : undefined,
        { price: newQuote.totalPrice, priceInBase: newQuote.priceInBase, baseCurrency: newQuote.baseCurrency, version: newQuote.version, quoteNo: newQuote.quoteNo },
      );

      return { quote: newQuote, idempotent: false, idempotencyKey };

    } finally {
      await this.redis.del(lockKey);
    }
  }

  async submitLineQuote(scope: BranchScope, data: {
    lineId: string;
    supplierId: string;
    totalPrice: number;
    currency: string;
    items?: Record<string, unknown>;
    remark?: string;
    idempotencyKey?: string;
  }, submitIp: string, ctx: AuditContext) {
    const { lineId, supplierId } = data;
    await this.ensureSupplierApproved(supplierId);

    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const lot = await this.lots.findById(scope, line.lotId);
    if (!lot) throw new NotFoundException('error.lot.not_found');
    const roundNo = tender.currentQuoteRound ?? 1;
    await this.ensureCanParticipate(tender, supplierId);

    const now = new Date();
    if (tender.status === TenderStatus.PUBLISHED && (!tender.bidStartAt || tender.bidStartAt <= now) && (!tender.bidDeadline || tender.bidDeadline > now)) {
      await this.tenderRepo.update(tender.id, { status: TenderStatus.OPEN });
      tender.status = TenderStatus.OPEN;
    }
    if ([TenderStatus.PUBLISHED, TenderStatus.OPEN].includes(tender.status) && tender.bidDeadline && tender.bidDeadline <= now) {
      await this.tenderRepo.update(tender.id, { status: TenderStatus.CLOSED });
      tender.status = TenderStatus.CLOSED;
    }
    if (tender.status !== TenderStatus.OPEN) throw new ForbiddenException('error.quote.tender_not_open');
    if (tender.bidDeadline && now > tender.bidDeadline) throw new ForbiddenException('error.quote.deadline_passed');

    const requiredColumns = (((lot.uiSchema as Record<string, unknown> | null)?.lineColumns ?? []) as Array<{
      key?: string;
      label?: string;
      required?: boolean;
    }>).filter((col) => col.required && col.key);
    const missingColumn = requiredColumns.find((col) => !String(data.items?.[col.key!] ?? '').trim());
    if (missingColumn) {
      throw new BadRequestException({
        code: 'LINE_REQUIRED_FIELD_MISSING',
        message_key: 'error.quote.required_field_missing',
        detail: { field: missingColumn.key, label: missingColumn.label ?? missingColumn.key },
      });
    }

    if (data.idempotencyKey) {
      const existingIdempotent = await this.lineQuoteRepo.findOne({
        where: { tenderId: line.tenderId, lineId, roundNo, supplierId, idempotencyKey: data.idempotencyKey },
      });
      if (existingIdempotent) return { quote: existingIdempotent, idempotent: true };
    }

    const lockKey = KEYS.lineSubmitLock(lineId, roundNo, supplierId);
    const locked = await this.redis.setnx(lockKey, '1', 5);
    if (!locked) throw new ConflictException('error.quote.concurrent_submit');

    try {
      const cooldownKey = KEYS.lineCooldown(lineId, roundNo, supplierId);
      const onCooldown = await this.redis.exists(cooldownKey);
      if (onCooldown) {
        const ttl = await this.redis.raw.ttl(cooldownKey);
        throw new BadRequestException({
          code: 'COOLDOWN_ACTIVE',
          message_key: 'error.quote.cooldown_active',
          detail: { retry_after_seconds: ttl },
        });
      }

      const existing = await this.lineQuoteRepo.findOne({ where: { lineId, roundNo, supplierId, isLatest: true } });
      const isRebid = !!existing;
      const conversion = await this.resolveConversion(data.totalPrice, data.currency, tender.baseCurrency, now);

      if (isRebid) {
        const quoteCount = await this.lineQuoteRepo.count({ where: { lineId, roundNo, supplierId } });
        const rebidCount = rebidCountFromQuoteCount(quoteCount);
        if (rebidCount >= tender.maxRebidCount) {
          throw new BadRequestException({
            code: 'REBID_LIMIT_REACHED',
            message_key: 'error.quote.rebid_limit_reached',
            detail: { remaining: 0 },
          });
        }

        const minPct = Number(tender.minDecrementPct);
        const lastPrice = this.quoteRankPrice(existing);
        const maxAllowed = lastPrice * (1 - minPct / 100);
        if (conversion.priceInBase > maxAllowed) {
          throw new BadRequestException({
            code: 'MIN_DECREMENT_FAIL',
            message_key: 'error.quote.min_decrement_fail',
            detail: {
              required_price: Math.floor((maxAllowed / conversion.exchangeRate) * 100) / 100,
              required_price_base: maxAllowed,
              base_currency: conversion.baseCurrency,
              exchange_rate: conversion.exchangeRate,
            },
          });
        }
      }

      const idempotencyKey = data.idempotencyKey ?? uuidv4();
      const newQuote = await this.ds.transaction(async (em) => {
        if (existing) {
          const updateResult = await em.update(LineQuote,
            { lineId, roundNo, supplierId, isLatest: true, version: existing.version },
            { isLatest: false },
          );
          if (updateResult.affected === 0) throw new ConflictException('error.quote.version_conflict');
        }

        const nextSeq = await nextQuoteSeq(em, LineQuote, 'QL', line.branchId);
        const quote = em.create(LineQuote, {
          branchId: line.branchId,
          quoteNo: lineQuoteNo(nextSeq),
          tenderId: line.tenderId,
          lotId: line.lotId,
          lineId,
          roundNo,
          supplierId,
          version: existing ? existing.version + 1 : 1,
          isLatest: true,
          totalPrice: data.totalPrice,
          currency: conversion.currency,
          exchangeRate: conversion.exchangeRate,
          exchangeRateDate: conversion.exchangeRateDate,
          exchangeRateSource: conversion.exchangeRateSource,
          baseCurrency: conversion.baseCurrency,
          priceInBase: conversion.priceInBase,
          lineSchemaVersion: line.schemaVersion,
          items: data.items,
          remark: data.remark,
          idempotencyKey,
          submitIp,
        });
        return em.save(quote);
      });

      const price = Number(conversion.priceInBase);
      await this.redis.zadd(KEYS.lineRank(lineId, roundNo), price, supplierId);
      await this.redis.hset(KEYS.lineLatest(lineId, roundNo), supplierId, JSON.stringify({
        version: newQuote.version,
        totalPrice: Number(data.totalPrice),
        currency: conversion.currency,
        baseCurrency: conversion.baseCurrency,
        exchangeRate: conversion.exchangeRate,
        exchangeRateDate: conversion.exchangeRateDate,
        priceInBase: price,
        submittedAt: newQuote.submittedAt,
      }));
      await this.redis.set(KEYS.lineCooldown(lineId, roundNo, supplierId), '1', tender.cooldownSeconds);
      if (isRebid) {
        const quoteCount = await this.lineQuoteRepo.count({ where: { lineId, roundNo, supplierId } });
        await this.redis.set(KEYS.lineRebid(lineId, roundNo, supplierId), String(rebidCountFromQuoteCount(quoteCount)));
      }

      await this.audit.log(ctx, AuditEntityType.QUOTE, newQuote.id,
        isRebid ? AuditAction.QUOTE_REBID : AuditAction.QUOTE_SUBMIT,
        existing ? { price: existing.totalPrice, version: existing.version, lineId, roundNo } : undefined,
        { price: newQuote.totalPrice, priceInBase: newQuote.priceInBase, baseCurrency: newQuote.baseCurrency, version: newQuote.version, quoteNo: newQuote.quoteNo, lineId, roundNo },
      );

      return { quote: newQuote, idempotent: false, idempotencyKey };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async getLineQuotes(scope: BranchScope, lineId: string, supplierId?: string, roundNo?: number) {
    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const targetRound = roundNo ?? tender.currentQuoteRound ?? 1;

    const where: any = { lineId, roundNo: targetRound, isLatest: true };
    if (supplierId) where.supplierId = supplierId;
    const quotes = await this.lineQuoteRepo.find({
      where,
      order: { submittedAt: 'ASC' },
    });
    return this.withSupplierSummary(quotes.sort((a, b) => this.quoteRankPrice(a) - this.quoteRankPrice(b)));
  }

  async getLineQuoteHistory(scope: BranchScope, lineId: string, supplierId: string, roundNo?: number) {
    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const targetRound = roundNo ?? tender.currentQuoteRound ?? 1;
    const quotes = await this.lineQuoteRepo.find({
      where: { lineId, supplierId, roundNo: targetRound },
      order: { version: 'DESC' },
    });
    return this.withSupplierSummary(quotes);
  }

  async getLineQuoteHistoryForReview(scope: BranchScope, lineId: string, supplierId: string, roundNo?: number) {
    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const targetRound = roundNo ?? tender.currentQuoteRound ?? 1;
    const quotes = await this.lineQuoteRepo.find({
      where: { lineId, supplierId, roundNo: targetRound },
      order: { version: 'DESC', submittedAt: 'DESC' },
    });
    return this.withSupplierSummary(quotes);
  }

  async getLineRankForSupplier(scope: BranchScope, lineId: string, supplierId: string, roundNo?: number) {
    await this.ensureSupplierApproved(supplierId);
    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const targetRound = roundNo ?? tender.currentQuoteRound ?? 1;
    const quotes = await this.getLineQuotes(scope, lineId, undefined, targetRound);
    const index = quotes.findIndex((quote) => quote.supplierId === supplierId);
    if (index < 0) return { hasQuote: false, rankingMode: tender.rankingMode, roundNo: targetRound };
    return {
      hasQuote: true,
      rankingMode: tender.rankingMode,
      myRank: index + 1,
      total: quotes.length,
      isLeading: index === 0,
      roundNo: targetRound,
    };
  }

  private buildQuoteAbility(args: {
    tender: Tender;
    quoteCount: number;
    latestPrice?: number | null;
    cooldownTtl?: number | null;
  }) {
    const { tender, quoteCount, latestPrice, cooldownTtl } = args;
    const usedRebidCount = rebidCountFromQuoteCount(quoteCount);
    const maxRebidCount = Number(tender.maxRebidCount ?? 0);
    const remainingRebidCount = Math.max(0, maxRebidCount - usedRebidCount);
    const isRebid = quoteCount > 0;
    const minPct = Number(tender.minDecrementPct ?? 0);
    const nextMaxPrice = isRebid && latestPrice !== null && latestPrice !== undefined
      ? Math.floor(Number(latestPrice) * (1 - minPct / 100) * 100) / 100
      : null;

    if (tender.status !== TenderStatus.OPEN) {
      return {
        canSubmit: false,
        canRebid: false,
        reasonCode: 'TENDER_NOT_OPEN',
        reasonMessage: this.i18n.t('quote.ability.tenderNotOpen'),
        usedRebidCount,
        remainingRebidCount,
        maxRebidCount,
        nextMaxPrice,
      };
    }
    if (isRebid && remainingRebidCount <= 0) {
      return {
        canSubmit: false,
        canRebid: false,
        reasonCode: 'REBID_LIMIT_REACHED',
        reasonMessage: this.i18n.t('quote.ability.rebidLimitReached'),
        usedRebidCount,
        remainingRebidCount,
        maxRebidCount,
        nextMaxPrice,
      };
    }
    if (cooldownTtl && cooldownTtl > 0) {
      return {
        canSubmit: false,
        canRebid: false,
        reasonCode: 'COOLDOWN_ACTIVE',
        reasonMessage: this.i18n.t('quote.ability.cooldownActive', { seconds: cooldownTtl }),
        retryAfterSeconds: cooldownTtl,
        usedRebidCount,
        remainingRebidCount,
        maxRebidCount,
        nextMaxPrice,
      };
    }
    return {
      canSubmit: true,
      canRebid: isRebid,
      reasonCode: null,
      reasonMessage: '',
      usedRebidCount,
      remainingRebidCount,
      maxRebidCount,
      nextMaxPrice,
    };
  }

  private async ensureCanParticipate(tender: Tender, supplierId: string) {
    if ((tender.participationMode ?? ParticipationMode.ALL) === ParticipationMode.ALL) return;
    const scope = await this.invRepo.findOne({
      where: {
        tenderId: tender.id,
        supplierId,
        roundNo: tender.currentQuoteRound ?? 1,
      },
    });
    if (!scope) throw new ForbiddenException('error.tender.not_invited');
  }

  // ── §4.3 Read Path ──────────────────────────────────────────────────────
  async getMyRank(scope: BranchScope, lotId: string, supplierId: string, rankingMode: string, topN?: number) {
    // 排名存放在 Redis，其 key 只含 lotId 而无机构信息，
    // 因此必须先用数据库校验标包归属，否则跨机构可凭 lotId 直接读到排名。
    await this.requireLot(scope, lotId);
    const rankKey = KEYS.rank(lotId);
    const myRank = await this.redis.zrank(rankKey, supplierId);
    const total = await this.redis.zcard(rankKey);

    if (myRank === null) return { hasQuote: false };

    const isLeading = myRank === 0;

    switch (rankingMode) {
      case 'interval': {
        const bucket = Math.floor(myRank / Math.max(total, 1) * 10) + 1;
        return { hasQuote: true, rankingMode, bucket, total, isLeading };
      }
      case 'top_n': {
        const n = topN ?? 3;
        const top = await this.redis.zrange(rankKey, 0, n - 1, true);
        const prices: { rank: number; price: number }[] = [];
        for (let i = 0; i < top.length; i += 2) {
          prices.push({ rank: i / 2 + 1, price: parseFloat(top[i + 1]) });
        }
        return { hasQuote: true, rankingMode, myRank: myRank + 1, total, topN: prices };
      }
      case 'leading_flag':
      default:
        return { hasQuote: true, rankingMode, isLeading, total, myRank: myRank + 1 };
    }
  }

  async getMyRankForSupplier(scope: BranchScope, lotId: string, supplierId: string) {
    await this.ensureSupplierApproved(supplierId);
    const lot = await this.requireLot(scope, lotId);

    const tender = await this.requireTender(scope, lot.tenderId);

    return this.getMyRank(scope, lotId, supplierId, tender.rankingMode, tender.rankingTopN);
  }

  async getMyQuoteState(scope: BranchScope, lotId: string, supplierId: string) {
    await this.ensureSupplierApproved(supplierId);
    const lot = await this.requireLot(scope, lotId);
    const tender = await this.requireTender(scope, lot.tenderId);
    const quotes = await this.quoteRepo.find({
      where: { lotId, supplierId },
      order: { version: 'DESC', submittedAt: 'DESC' },
    });
    const latest = quotes.find((quote) => quote.isLatest) ?? quotes[0] ?? null;
    const cooldownKey = KEYS.cooldown(lotId, supplierId);
    const cooldownTtl = latest && await this.redis.exists(cooldownKey) ? await this.redis.raw.ttl(cooldownKey) : null;
    const [quote] = latest ? await this.withSupplierSummary([latest]) : [null];
    return {
      quote,
      ability: this.buildQuoteAbility({
        tender,
        quoteCount: quotes.length,
        latestPrice: latest ? Number(latest.totalPrice) : null,
        cooldownTtl,
      }),
    };
  }

  async getMyLineQuoteState(scope: BranchScope, lineId: string, supplierId: string) {
    await this.ensureSupplierApproved(supplierId);
    const line = await this.requireLine(scope, lineId);
    const tender = await this.requireTender(scope, line.tenderId);
    const roundNo = tender.currentQuoteRound ?? 1;
    const quotes = await this.lineQuoteRepo.find({
      where: { lineId, roundNo, supplierId },
      order: { version: 'DESC', submittedAt: 'DESC' },
    });
    const latest = quotes.find((quote) => quote.isLatest) ?? quotes[0] ?? null;
    const cooldownKey = KEYS.lineCooldown(lineId, roundNo, supplierId);
    const cooldownTtl = latest && await this.redis.exists(cooldownKey) ? await this.redis.raw.ttl(cooldownKey) : null;
    const [quote] = latest ? await this.withSupplierSummary([latest]) : [null];
    return {
      quote,
      ability: {
        ...this.buildQuoteAbility({
          tender,
          quoteCount: quotes.length,
          latestPrice: latest ? Number(latest.totalPrice) : null,
          cooldownTtl,
        }),
        roundNo,
      },
    };
  }

  async rebuildRankingFromDb(scope: BranchScope, lotId: string) {
    await this.requireLot(scope, lotId);
    const quotes = await this.quoteRepo.find({
      where: { lotId, isLatest: true, isValid: true },
      order: { submittedAt: 'ASC' },
    });
    await this.redis.rebuildLotRanking(lotId, quotes.map((q) => ({
      supplierId: q.supplierId,
      price: this.quoteRankPrice(q),
    })));
    return quotes.length;
  }

  // ── Snapshot generation (key moments only) ──────────────────────────────
  async generateSnapshot(scope: BranchScope, lotId: string, trigger: SnapshotTrigger, triggeredBy?: string) {
    const lot = await this.requireLot(scope, lotId);

    const quotes = await this.quoteRepo.find({
      where: { lotId, isLatest: true, isValid: true },
      order: { submittedAt: 'ASC' },
    });
    const rankedQuotes = quotes.sort((a, b) => this.quoteRankPrice(a) - this.quoteRankPrice(b));

    const snapshotData = rankedQuotes.map((q, i) => ({
      rank: i + 1,
      supplierId: q.supplierId,
      totalPrice: Number(q.totalPrice),
      currency: q.currency,
      baseCurrency: q.baseCurrency,
      exchangeRate: q.exchangeRate === undefined || q.exchangeRate === null ? undefined : Number(q.exchangeRate),
      exchangeRateDate: q.exchangeRateDate,
      priceInBase: this.quoteRankPrice(q),
      version: q.version,
      submittedAt: q.submittedAt.toISOString(),
    }));

    return this.snapshotRepo.save(
      this.snapshotRepo.create({ branchId: lot.branchId, tenderId: lot.tenderId, lotId, snapshotData, triggerReason: trigger, triggeredBy }),
    );
  }

  async getQuotes(scope: BranchScope, lotId: string, supplierId?: string) {
    await this.requireLot(scope, lotId);
    if (supplierId) await this.ensureSupplierApproved(supplierId);
    const where: any = { lotId, isLatest: true };
    if (supplierId) where.supplierId = supplierId;
    const quotes = await this.quoteRepo.find({ where, order: { submittedAt: 'ASC' } });
    return this.withSupplierSummary(quotes.sort((a, b) => this.quoteRankPrice(a) - this.quoteRankPrice(b)));
  }

  async getQuoteHistory(scope: BranchScope, lotId: string, supplierId: string) {
    await this.requireLot(scope, lotId);
    await this.ensureSupplierApproved(supplierId);
    const quotes = await this.quoteRepo.find({
      where: { lotId, supplierId },
      order: { version: 'DESC', submittedAt: 'DESC' },
    });
    return this.withSupplierSummary(quotes);
  }

  private async withSupplierSummary<T extends { supplierId: string }>(quotes: T[]) {
    const supplierIds = Array.from(new Set(quotes.map((q) => q.supplierId).filter(Boolean)));
    if (!supplierIds.length) return quotes;

    const suppliers = await this.supplierRepo.find({ where: { id: In(supplierIds) } });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    return quotes.map((quote) => {
      const supplier = supplierMap.get(quote.supplierId);
      return {
        ...quote,
        supplierName: supplier?.legalName || supplier?.shortName || supplier?.businessId || quote.supplierId,
        supplier: supplier ? {
          id: supplier.id,
          businessId: supplier.businessId,
          legalName: supplier.legalName,
          shortName: supplier.shortName,
          countryCode: supplier.countryCode,
          contactName: supplier.contactName,
          contactEmail: supplier.contactEmail,
          contactPhone: supplier.contactPhone,
          rating: supplier.rating,
          reviewStatus: supplier.reviewStatus,
          status: supplier.status,
        } : null,
      };
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
