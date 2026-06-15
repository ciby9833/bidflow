/**
 * 文件：backend/src/modules/tender/tender.service.ts
 * 功能：负责招标、标包、邀请及模板能力，承接招标全生命周期的业务规则。
 * 交互：被 tender.controller.ts 调用；写入 tender.entity.ts / lot.entity.ts / invitation.entity.ts；被 quote.service.ts 读取招标与标包上下文。
 * 作者：吴川
 */
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource, EntityManager, In, ObjectLiteral, Repository, SelectQueryBuilder,
} from 'typeorm';
import * as XLSX from 'xlsx';
import { ParticipationMode, Tender, TenderStatus, TenderType } from './tender.entity';
import { Lot } from './lot.entity';
import { LotLine } from './lot-line.entity';
import { Invitation, InvitationStatus } from './invitation.entity';
import { TenderNotificationLog, TenderNotificationTrigger, TenderNotificationType } from './tender-notification-log.entity';
import { Quote } from '../quote/quote.entity';
import { LineQuote } from '../quote/line-quote.entity';
import { LotQuoteAttachment } from '../quote/lot-quote-attachment.entity';
import { RankingSnapshot } from '../quote/ranking-snapshot.entity';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import { User, UserRole } from '../auth/user.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';
import { Supplier, SupplierReviewStatus, SupplierStatus } from '../supplier/supplier.entity';
import { MailService } from '../../shared/mail/mail.service';
import { buildTenderInvitationEmail } from '../../shared/mail/templates/tender-invitation.template';
import { buildTenderWithdrawalEmail } from '../../shared/mail/templates/tender-withdrawal.template';
import { RedisService } from '../../shared/config/redis.config';

// Three standard templates (spec_json + ui_schema stubs)
const TEMPLATES: Record<TenderType, { specJson: object; uiSchema: object }> = {
  [TenderType.ENGINEERING]: {
    specJson: {
      sections: ['scope', 'technical', 'safety', 'timeline', 'qualification'],
      requiredFields: ['total_price', 'currency', 'project_duration_days', 'warranty_months'],
    },
    uiSchema: {
      order: ['total_price', 'currency', 'project_duration_days', 'warranty_months'],
      fields: {
        total_price: { type: 'currency', label: { 'zh-CN': '报价总价', en: 'Total Price', 'id-ID': 'Total Harga' } },
        currency: { type: 'currency_select', label: { 'zh-CN': '币种', en: 'Currency', 'id-ID': 'Mata Uang' } },
        project_duration_days: { type: 'number', label: { 'zh-CN': '工期（天）', en: 'Duration (days)', 'id-ID': 'Durasi (hari)' } },
        warranty_months: { type: 'number', label: { 'zh-CN': '质保期（月）', en: 'Warranty (months)', 'id-ID': 'Garansi (bulan)' } },
      },
    },
  },
  [TenderType.TRANSPORT]: {
    specJson: {
      sections: ['route', 'capacity', 'vehicle_type', 'rate'],
      requiredFields: ['total_price', 'currency', 'unit_price', 'unit', 'capacity_tons'],
    },
    uiSchema: {
      order: ['total_price', 'currency', 'unit_price', 'unit', 'capacity_tons'],
      fields: {
        total_price: { type: 'currency', label: { 'zh-CN': '报价总价', en: 'Total Price', 'id-ID': 'Total Harga' } },
        currency: { type: 'currency_select', label: { 'zh-CN': '币种', en: 'Currency', 'id-ID': 'Mata Uang' } },
        unit_price: { type: 'currency', label: { 'zh-CN': '单价', en: 'Unit Price', 'id-ID': 'Harga Satuan' } },
        unit: { type: 'select', options: ['ton-km', 'trip', 'day'], label: { 'zh-CN': '计价单位', en: 'Unit', 'id-ID': 'Satuan' } },
        capacity_tons: { type: 'number', label: { 'zh-CN': '运载吨位', en: 'Capacity (tons)', 'id-ID': 'Kapasitas (ton)' } },
      },
    },
  },
  [TenderType.ROUTINE]: {
    specJson: {
      sections: ['item_list', 'delivery', 'payment'],
      requiredFields: ['total_price', 'currency', 'delivery_days'],
    },
    uiSchema: {
      order: ['total_price', 'currency', 'delivery_days', 'payment_terms'],
      fields: {
        total_price: { type: 'currency', label: { 'zh-CN': '报价总价', en: 'Total Price', 'id-ID': 'Total Harga' } },
        currency: { type: 'currency_select', label: { 'zh-CN': '币种', en: 'Currency', 'id-ID': 'Mata Uang' } },
        delivery_days: { type: 'number', label: { 'zh-CN': '交货天数', en: 'Delivery Days', 'id-ID': 'Hari Pengiriman' } },
        payment_terms: { type: 'text', label: { 'zh-CN': '付款条款', en: 'Payment Terms', 'id-ID': 'Syarat Pembayaran' } },
      },
    },
  },
};
const DEFAULT_TENDER_CURRENCY = 'IDR';
const NOTIFICATION_RESEND_LOCK_TTL_SECONDS = 300;
const TENDER_WITHDRAW_LOCK_TTL_SECONDS = 120;
type TenderAttachmentInput = {
  objectKey?: string;
  key?: string;
  fileName?: string;
  name?: string;
  fileSize?: number;
  size?: number;
  mimeType?: string;
  fileUrl?: string;
};
type TenderLotInput = {
  id?: string;
  title: string;
  description?: string;
  quantity?: number;
  unit?: string;
  pricingMode?: string;
  specJson?: object;
  uiSchema?: object;
  budgetAmount?: number;
  budgetCurrency?: string;
  lineColumns?: LineColumnInput[];
  lines?: TenderLotLineInput[];
};
type LineColumnInput = {
  key?: string;
  label: string;
  type?: string;
  required?: boolean;
};
type TenderLotLineInput = {
  id?: string;
  rowNo?: number;
  dataJson?: Record<string, unknown>;
  data?: Record<string, unknown>;
};
type ParticipationInput = {
  participationMode?: ParticipationMode | 'all' | 'selected';
  participantSupplierIds?: string[];
  participantSource?: string;
};
export type SupplierParticipationScopeFilter = 'invited' | 'public';
type SupplierNotificationResult = {
  supplierCount: number;
  accountCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};
type SupplierNotificationEmailType = TenderNotificationType.INVITATION | TenderNotificationType.WITHDRAWAL;

function nextTenderNo(seq: number): string {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  return `T-${ym}-${String(seq).padStart(4, '0')}`;
}

function formatLotNo(seq: number): string {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  return `L-${ym}-${String(seq).padStart(4, '0')}`;
}

async function nextLotNo(em: EntityManager): Promise<string> {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const result = await em
    .createQueryBuilder(Lot, 'lot')
    .select("MAX(CAST(RIGHT(lot.lotNo, 4) AS INT))", 'max')
    .where('lot.lotNo LIKE :prefix', { prefix: `L-${ym}-%` })
    .getRawOne<{ max: string | null }>();
  return formatLotNo(Number(result?.max ?? 0) + 1);
}

@Injectable()
export class TenderService implements OnModuleInit, OnModuleDestroy {
  private lifecycleTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Tender) private readonly tenderRepo: Repository<Tender>,
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(LotLine) private readonly lineRepo: Repository<LotLine>,
    @InjectRepository(Invitation) private readonly invRepo: Repository<Invitation>,
    @InjectRepository(TenderNotificationLog) private readonly notificationLogRepo: Repository<TenderNotificationLog>,
    @InjectRepository(Quote) private readonly quoteRepo: Repository<Quote>,
    @InjectRepository(LineQuote) private readonly lineQuoteRepo: Repository<LineQuote>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SupplierAccount) private readonly supplierAccountRepo: Repository<SupplierAccount>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly ds: DataSource,
  ) {}

  private readonly logger = new Logger(TenderService.name);

  onModuleInit() {
    void this.refreshLifecycleStatuses();
    this.lifecycleTimer = setInterval(() => void this.refreshLifecycleStatuses(), 30_000);
    this.lifecycleTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.lifecycleTimer) clearInterval(this.lifecycleTimer);
  }

  async create(data: {
    title: string;
    type: TenderType;
    baseCurrency?: string;
    rankingMode?: string;
    bidStartAt?: string;
    bidDeadline?: string;
    openTime?: string;
    maxRebidCount?: number;
    minDecrementPct?: number;
    cooldownSeconds?: number;
    description?: string;
    isHallVisible?: boolean;
    isPublicRankingVisible?: boolean;
    notifySuppliers?: boolean;
    hallSummary?: string;
    attachments?: TenderAttachmentInput[];
    lots?: TenderLotInput[];
  } & ParticipationInput, ctx: AuditContext) {
    this.validateTenderSchedule(data.bidStartAt, data.bidDeadline);
    return this.ds.transaction(async (em) => {
      const tenderCount = await em.count(Tender);
      const tenderNo = nextTenderNo(tenderCount + 1);
      const template = TEMPLATES[data.type];

      const tender = em.create(Tender, {
        tenderNo,
        title: data.title,
        type: data.type,
        baseCurrency: data.baseCurrency ?? DEFAULT_TENDER_CURRENCY,
        rankingMode: (data.rankingMode as any) ?? 'leading_flag',
        bidStartAt: data.bidStartAt ? new Date(data.bidStartAt) : undefined,
        bidDeadline: data.bidDeadline ? new Date(data.bidDeadline) : undefined,
        openTime: data.openTime ? new Date(data.openTime) : undefined,
        maxRebidCount: data.maxRebidCount ?? 3,
        minDecrementPct: data.minDecrementPct ?? 1.0,
        cooldownSeconds: data.cooldownSeconds ?? 60,
        description: data.description,
        isHallVisible: data.isHallVisible ?? false,
        isPublicRankingVisible: data.isPublicRankingVisible ?? false,
        notifySuppliers: data.notifySuppliers ?? false,
        participationMode: this.normalizeParticipationMode(data.participationMode),
        hallSummary: data.hallSummary,
        attachments: this.normalizeAttachments(data.attachments),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        status: TenderStatus.DRAFT,
      });
      const savedTender = await em.save(tender);

      const lots = data.lots ?? [{ title: `${data.title} - Lot 1` }];
      for (let i = 0; i < lots.length; i++) {
        const lotNo = await nextLotNo(em);
        const lot = em.create(Lot, {
          lotNo,
          tenderId: savedTender.id,
          title: lots[i].title,
          description: lots[i].description,
          quantity: lots[i].quantity,
          unit: lots[i].unit,
          pricingMode: lots[i].pricingMode ?? 'total_price',
          specJson: lots[i].specJson ?? template.specJson,
          uiSchema: lots[i].uiSchema ?? template.uiSchema,
          budgetAmount: lots[i].budgetAmount,
          budgetCurrency: lots[i].budgetCurrency ?? data.baseCurrency ?? DEFAULT_TENDER_CURRENCY,
          sortOrder: i,
          schemaVersion: 1,
        });
        const savedLot = await em.save(lot);
        await this.saveLotLines(em, savedTender.id, savedLot, lots[i]);
      }

      await this.replaceParticipants(em, savedTender.id, 1, data.participationMode ?? ParticipationMode.ALL, data.participantSupplierIds ?? [], 'manual');

      await this.audit.log(ctx, AuditEntityType.TENDER, savedTender.id, AuditAction.TENDER_CREATE, undefined, { tenderNo, type: data.type });
      return em.findOne(Tender, { where: { id: savedTender.id }, relations: ['lots', 'lots.lines'] });
    });
  }

  async findAll(
    filters: {
      status?: TenderStatus;
      type?: TenderType;
      baseCurrency?: string;
      search?: string;
      isHallVisible?: boolean;
      page?: number;
      limit?: number;
    },
    viewer?: { role?: UserRole | string; supplierId?: string },
  ) {
    await this.refreshLifecycleStatuses();
    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      return this.findSupplierVisible(filters, viewer.supplierId);
    }
    const qb = this.tenderRepo.createQueryBuilder('t');
    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.baseCurrency) qb.andWhere('t.base_currency = :baseCurrency', { baseCurrency: filters.baseCurrency });
    if (typeof filters.isHallVisible === 'boolean') qb.andWhere('t.is_hall_visible = :isHallVisible', { isHallVisible: filters.isHallVisible });
    if (filters.search) {
      qb.andWhere('(t.title ILIKE :q OR t.tender_no ILIKE :q OR t.hall_summary ILIKE :q)', { q: `%${filters.search}%` });
    }
    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      qb.innerJoin('t.invitations', 'inv', 'inv.supplierId = :supplierId', { supplierId: viewer.supplierId })
        .andWhere('(inv.visibleAt IS NULL OR inv.visibleAt <= :now)', { now: new Date() })
        .andWhere('t.status IN (:...statuses)', {
          statuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED],
        });
    }
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    qb.leftJoinAndSelect('t.lots', 'lots')
      .skip((page - 1) * limit).take(limit)
      .orderBy('t.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    return { items: await this.withUserSummary(items), total, page, limit };
  }

  async findSupplierVisible(
    filters: {
      status?: TenderStatus;
      type?: TenderType;
      baseCurrency?: string;
      search?: string;
      participationScope?: SupplierParticipationScopeFilter;
      page?: number;
      limit?: number;
    },
    supplierId: string,
  ) {
    await this.refreshLifecycleStatuses();
    await this.ensureSupplierApproved(supplierId);

    const allowedStatuses = [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED];
    const qb = this.tenderRepo.createQueryBuilder('t')
      .where('t.status IN (:...allowedStatuses)', { allowedStatuses });
    this.applySupplierAccessScope(qb, 't', supplierId, 'scope');

    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.baseCurrency) qb.andWhere('t.base_currency = :baseCurrency', { baseCurrency: filters.baseCurrency });
    if (filters.participationScope === 'invited') qb.andWhere('t.participationMode = :selectedMode AND scope.id IS NOT NULL', { selectedMode: ParticipationMode.SELECTED });
    if (filters.participationScope === 'public') qb.andWhere('t.participationMode = :publicMode', { publicMode: ParticipationMode.ALL });
    if (filters.search) {
      qb.andWhere('(t.title ILIKE :q OR t.tender_no ILIKE :q OR t.hall_summary ILIKE :q)', { q: `%${filters.search}%` });
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    qb.leftJoinAndSelect('t.lots', 'lots')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('t.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    return { items: await this.withUserSummary(items), total, page, limit };
  }

  async findById(id: string, viewer?: { role?: UserRole | string; supplierId?: string }) {
    await this.refreshLifecycleStatuses();
    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      await this.ensureSupplierApproved(viewer.supplierId);
    }
    const qb = this.tenderRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.lots', 'lots')
      .leftJoinAndSelect('lots.lines', 'lines', 'lines.is_active = true AND lines.round_no = t.current_quote_round')
      .leftJoinAndSelect('t.invitations', 'invitations')
      .where('t.id = :id', { id });

    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      qb.andWhere('t.status IN (:...statuses)', {
          statuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED],
        });
      this.applySupplierAccessScope(qb, 't', viewer.supplierId, 'scope');
    }

    const t = await qb.getOne();
    if (!t) throw new NotFoundException('error.tender.not_found');
    return t;
  }

  async findLotById(lotId: string, viewer?: { role?: UserRole | string; supplierId?: string }) {
    await this.refreshLifecycleStatuses();
    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      await this.ensureSupplierApproved(viewer.supplierId);
    }
    const qb = this.lotRepo.createQueryBuilder('lot')
      .leftJoinAndSelect('lot.tender', 'tender')
      .leftJoinAndSelect('lot.lines', 'lines', 'lines.is_active = true AND lines.round_no = tender.current_quote_round')
      .where('lot.id = :lotId', { lotId });

    if (viewer?.role === UserRole.SUPPLIER && viewer.supplierId) {
      qb.andWhere('tender.status IN (:...statuses)', {
          statuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED],
        });
      this.applySupplierAccessScope(qb, 'tender', viewer.supplierId, 'scope');
    }

    const lot = await qb.getOne();
    if (!lot) throw new NotFoundException('error.lot.not_found');
    return lot;
  }

  async publish(id: string, ctx: AuditContext) {
    const t = await this.findById(id);
    if (t.status !== TenderStatus.DRAFT) throw new BadRequestException('error.tender.invalid_status_transition');
    this.validateTenderSchedule(t.bidStartAt?.toISOString(), t.bidDeadline?.toISOString());
    const nextStatus = this.shouldOpenNow(t) ? TenderStatus.OPEN : TenderStatus.PUBLISHED;
    await this.tenderRepo.update(id, { status: nextStatus, updatedBy: ctx.userId } as any);
    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_CREATE, { status: t.status }, { status: nextStatus });
    const published = await this.findById(id);
    // 发布后按草稿中的显式开关邮件通知当前参与范围内的供应商（尽力而为，失败不影响发布）
    if (published.notifySuppliers) {
      void this.sendAndRecordSupplierNotifications(published, TenderNotificationType.INVITATION, TenderNotificationTrigger.PUBLISH, ctx)
        .catch((err) => this.logger.warn(`notifySuppliers failed for tender ${published.id}: ${(err as Error).message}`));
    }
    return published;
  }

  async getNotificationSummary(id: string) {
    const tender = await this.findById(id);
    const roundNo = tender.currentQuoteRound ?? 1;
    const latestInvitation = await this.notificationLogRepo.findOne({
      where: { tenderId: id, roundNo, type: TenderNotificationType.INVITATION },
      order: { createdAt: 'DESC' },
    });
    const hasSentInvitationNotice = Number(latestInvitation?.sentCount ?? 0) > 0;
    const shouldHaveInvitationNotice = Boolean(tender.notifySuppliers);
    return {
      tenderId: id,
      tenderNo: tender.tenderNo,
      roundNo,
      hasInvitationNotice: hasSentInvitationNotice || shouldHaveInvitationNotice,
      notifySuppliers: shouldHaveInvitationNotice,
      latestInvitationNotice: latestInvitation ? {
        type: latestInvitation.type,
        trigger: latestInvitation.trigger,
        supplierCount: latestInvitation.supplierCount,
        accountCount: latestInvitation.accountCount,
        sentCount: latestInvitation.sentCount,
        failedCount: latestInvitation.failedCount,
        skippedCount: latestInvitation.skippedCount,
        createdAt: latestInvitation.createdAt,
      } : null,
    };
  }

  async resendSupplierNotifications(id: string, ctx: AuditContext) {
    const tender = await this.findById(id);
    if (![TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED].includes(tender.status)) {
      throw new BadRequestException('error.tender.invalid_status_transition');
    }
    const lockKey = this.notificationLockKey(id);
    const locked = await this.redis.setnx(lockKey, ctx.userId, NOTIFICATION_RESEND_LOCK_TTL_SECONDS);
    if (!locked) throw new ConflictException('error.tender.notification_resend_in_progress');
    try {
      const result = await this.sendAndRecordSupplierNotifications(tender, TenderNotificationType.INVITATION, TenderNotificationTrigger.MANUAL_RESEND, ctx);
      await this.audit.log(ctx, AuditEntityType.INVITATION, id, AuditAction.INVITATION_SEND, undefined, result, {
        tenderNo: tender.tenderNo,
        manualResend: true,
      });
      return result;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /** 向当前参与范围内供应商关联的活跃用户发送招标通知邮件，并记录发送结果。 */
  private async sendAndRecordSupplierNotifications(
    tender: Tender,
    type: SupplierNotificationEmailType,
    trigger: TenderNotificationTrigger,
    ctx: AuditContext,
  ): Promise<SupplierNotificationResult> {
    const result = await this.sendSupplierNotifications(tender, type);
    await this.notificationLogRepo.save(this.notificationLogRepo.create({
      tenderId: tender.id,
      roundNo: tender.currentQuoteRound ?? 1,
      type,
      trigger,
      supplierCount: result.supplierCount,
      accountCount: result.accountCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      createdBy: ctx.userId,
      metadata: { tenderNo: tender.tenderNo },
    }));
    return result;
  }

  private async sendSupplierNotifications(tender: Tender, type: SupplierNotificationEmailType): Promise<SupplierNotificationResult> {
    const roundNo = tender.currentQuoteRound ?? 1;
    const supplierIds = await this.getNotificationSupplierIds(tender, roundNo);
    if (!supplierIds.length) return {
      supplierCount: 0, accountCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0,
    };

    const [accounts, suppliers] = await Promise.all([
      this.supplierAccountRepo.find({ where: { supplierId: In(supplierIds), status: 'active' } }),
      this.supplierRepo.find({ where: { id: In(supplierIds) } }),
    ]);
    if (!accounts.length) return {
      supplierCount: supplierIds.length, accountCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0,
    };

    const supplierNameMap = new Map(suppliers.map((s) => [s.id, s.legalName || s.shortName || s.businessId || '']));
    const users = await this.userRepo.find({ where: { id: In(accounts.map((a) => a.authUserId)) } });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const portalUrl = this.config.get<string>('FRONTEND_ORIGIN') || undefined;
    const recipients = new Map<string, { user: User; account: SupplierAccount }>();

    for (const account of accounts) {
      const user = userMap.get(account.authUserId);
      const email = user?.email?.trim().toLowerCase();
      if (!user || !email || recipients.has(email)) continue;
      recipients.set(email, { user, account });
    }

    let sentCount = 0;
    let failedCount = 0;
    for (const { user, account } of recipients.values()) {
      try {
        const message = type === TenderNotificationType.WITHDRAWAL
          ? buildTenderWithdrawalEmail({
            to: user.email,
            locale: user.locale,
            supplierName: account.displayName || supplierNameMap.get(account.supplierId),
            tenderNo: tender.tenderNo,
            tenderTitle: tender.title,
            bidDeadline: tender.bidDeadline,
            portalUrl,
          })
          : buildTenderInvitationEmail({
            to: user.email,
            locale: user.locale,
            supplierName: account.displayName || supplierNameMap.get(account.supplierId),
            tenderNo: tender.tenderNo,
            tenderTitle: tender.title,
            bidDeadline: tender.bidDeadline,
            portalUrl,
          });
        await this.mail.send(message);
        sentCount += 1;
      } catch (err) {
        failedCount += 1;
        this.logger.warn(`Tender ${type} mail to ${user.email} failed: ${(err as Error).message}`);
      }
    }

    return {
      supplierCount: supplierIds.length,
      accountCount: recipients.size,
      sentCount,
      failedCount,
      skippedCount: accounts.length - recipients.size,
    };
  }

  private async getNotificationSupplierIds(tender: Tender, roundNo: number) {
    if ((tender.participationMode ?? ParticipationMode.ALL) === ParticipationMode.SELECTED) {
      const invitations = await this.invRepo.find({ where: { tenderId: tender.id, roundNo } });
      return Array.from(new Set(invitations.map((inv) => inv.supplierId).filter(Boolean)));
    }
    const suppliers = await this.supplierRepo.find({
      where: {
        status: SupplierStatus.ACTIVE,
        reviewStatus: SupplierReviewStatus.APPROVED,
      },
      select: ['id'],
    });
    return suppliers.map((supplier) => supplier.id);
  }

  private notificationLockKey(tenderId: string) {
    return `tender:${tenderId}:supplier-notification`;
  }

  private withdrawLockKey(tenderId: string) {
    return `tender:${tenderId}:withdraw`;
  }

  async open(id: string, ctx: AuditContext) {
    const t = await this.findById(id);
    if (t.status !== TenderStatus.PUBLISHED) throw new BadRequestException('error.tender.invalid_status_transition');
    if (t.bidDeadline && t.bidDeadline <= new Date()) throw new BadRequestException('error.tender.deadline_passed');
    await this.tenderRepo.update(id, { status: TenderStatus.OPEN, bidStartAt: new Date(), updatedBy: ctx.userId } as any);
    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_OPEN, { status: t.status, bidStartAt: t.bidStartAt }, { status: TenderStatus.OPEN, bidStartAt: new Date().toISOString() });
    return this.findById(id);
  }

  async close(id: string, ctx: AuditContext) {
    const t = await this.findById(id);
    if (![TenderStatus.PUBLISHED, TenderStatus.OPEN].includes(t.status)) throw new BadRequestException('error.tender.invalid_status_transition');
    await this.tenderRepo.update(id, { status: TenderStatus.CLOSED, updatedBy: ctx.userId } as any);
    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_CLOSE, { status: t.status }, { status: TenderStatus.CLOSED });
    return this.findById(id);
  }

  async withdraw(id: string, ctx: AuditContext, options?: { sendWithdrawalNotice?: boolean }) {
    const withdrawLockKey = this.withdrawLockKey(id);
    const withdrawLocked = await this.redis.setnx(withdrawLockKey, ctx.userId, TENDER_WITHDRAW_LOCK_TTL_SECONDS);
    if (!withdrawLocked) throw new ConflictException('error.tender.withdraw_in_progress');

    let notificationLocked = false;
    const notificationLockKey = this.notificationLockKey(id);
    try {
      const t = await this.findById(id);
      if (![TenderStatus.PUBLISHED, TenderStatus.OPEN].includes(t.status)) throw new BadRequestException('error.tender.invalid_status_transition');
      const shouldSendWithdrawalNotice = Boolean(options?.sendWithdrawalNotice);
      let withdrawalNotice: SupplierNotificationResult | null = null;

      if (shouldSendWithdrawalNotice) {
        const summary = await this.getNotificationSummary(id);
        if (summary.hasInvitationNotice) {
          notificationLocked = await this.redis.setnx(notificationLockKey, ctx.userId, NOTIFICATION_RESEND_LOCK_TTL_SECONDS);
          if (!notificationLocked) throw new ConflictException('error.tender.notification_resend_in_progress');
        }
      }

      await this.tenderRepo.update(id, { status: TenderStatus.DRAFT, updatedBy: ctx.userId } as any);
      await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_WITHDRAW, { status: t.status }, { status: TenderStatus.DRAFT });
      if (notificationLocked) {
        withdrawalNotice = await this.sendAndRecordSupplierNotifications(t, TenderNotificationType.WITHDRAWAL, TenderNotificationTrigger.WITHDRAW, ctx);
      }
      const tender = await this.findById(id);
      return { tender, withdrawalNotice };
    } finally {
      if (notificationLocked) await this.redis.del(notificationLockKey);
      await this.redis.del(withdrawLockKey);
    }
  }

  async remove(id: string, ctx: AuditContext) {
    if (ctx.userRole !== UserRole.SUPER_ADMIN) throw new ForbiddenException('error.auth.forbidden');

    const before = await this.findById(id);
    if (![TenderStatus.DRAFT, TenderStatus.CLOSED].includes(before.status)) {
      throw new BadRequestException('error.tender.invalid_status_transition');
    }

    await this.ds.transaction(async (em) => {
      await em.delete(LotQuoteAttachment, { tenderId: id });
      await em.delete(RankingSnapshot, { tenderId: id });
      await em.delete(LineQuote, { tenderId: id });
      await em.delete(Quote, { tenderId: id });
      await em.delete(Invitation, { tenderId: id });
      await em.delete(LotLine, { tenderId: id });
      await em.delete(Lot, { tenderId: id });
      await em.delete(Tender, { id });
    });

    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_DELETE, before as any, undefined, {
      tenderNo: before.tenderNo,
      title: before.title,
      status: before.status,
    });
    return { deleted: true, id };
  }

  async updateDraft(id: string, data: {
    title?: string;
    type?: TenderType;
    baseCurrency?: string;
    rankingMode?: string;
    bidStartAt?: string | null;
    bidDeadline?: string | null;
    openTime?: string | null;
    maxRebidCount?: number;
    minDecrementPct?: number;
    cooldownSeconds?: number;
    description?: string;
    isHallVisible?: boolean;
    hallSummary?: string;
    isPublicRankingVisible?: boolean;
    notifySuppliers?: boolean;
    attachments?: TenderAttachmentInput[];
    lots?: TenderLotInput[];
  } & ParticipationInput, ctx: AuditContext) {
    const before = await this.findById(id);
    if (before.status !== TenderStatus.DRAFT) throw new BadRequestException('error.tender.only_draft_can_edit');
    this.validateTenderSchedule(
      data.bidStartAt === undefined ? before.bidStartAt?.toISOString() : data.bidStartAt ?? undefined,
      data.bidDeadline === undefined ? before.bidDeadline?.toISOString() : data.bidDeadline ?? undefined,
    );
    const template = TEMPLATES[data.type ?? before.type];
    const hasAnyQuotes = await this.hasAnyQuotes(id);

    await this.ds.transaction(async (em) => {
      await em.update(Tender, id, {
        title: data.title ?? before.title,
        type: data.type ?? before.type,
        baseCurrency: data.baseCurrency ?? before.baseCurrency ?? DEFAULT_TENDER_CURRENCY,
        rankingMode: (data.rankingMode as any) ?? before.rankingMode,
        bidStartAt: data.bidStartAt ? new Date(data.bidStartAt) : data.bidStartAt === null ? undefined : before.bidStartAt,
        bidDeadline: data.bidDeadline ? new Date(data.bidDeadline) : data.bidDeadline === null ? undefined : before.bidDeadline,
        openTime: data.openTime ? new Date(data.openTime) : data.openTime === null ? undefined : before.openTime,
        maxRebidCount: data.maxRebidCount ?? before.maxRebidCount,
        minDecrementPct: data.minDecrementPct ?? before.minDecrementPct,
        cooldownSeconds: data.cooldownSeconds ?? before.cooldownSeconds,
        description: data.description ?? before.description,
        isHallVisible: data.isHallVisible ?? before.isHallVisible,
        isPublicRankingVisible: data.isPublicRankingVisible ?? before.isPublicRankingVisible,
        notifySuppliers: data.notifySuppliers ?? before.notifySuppliers ?? false,
        participationMode: this.normalizeParticipationMode(data.participationMode ?? before.participationMode),
        hallSummary: data.hallSummary ?? before.hallSummary,
        attachments: data.attachments ? this.normalizeAttachments(data.attachments) : before.attachments,
        updatedBy: ctx.userId,
      });

      if (data.lots?.length) {
        await this.syncLots(em, id, data.lots, {
          baseCurrency: data.baseCurrency ?? before.baseCurrency ?? DEFAULT_TENDER_CURRENCY,
          template,
          hasAnyQuotes,
          currentRound: before.currentQuoteRound ?? 1,
        });
      }
      if (data.participationMode) {
        await this.replaceParticipants(em, id, before.currentQuoteRound ?? 1, data.participationMode, data.participantSupplierIds ?? [], data.participantSource ?? 'manual');
      }
    });

    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_UPDATE, before as any, { status: TenderStatus.DRAFT, title: data.title });
    return this.findById(id);
  }

  private async ensureSupplierApproved(supplierId: string) {
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('error.supplier.not_found');
    if (supplier.status !== SupplierStatus.ACTIVE || supplier.reviewStatus !== SupplierReviewStatus.APPROVED) {
      throw new ForbiddenException('error.supplier.certification_required');
    }
  }

  private async hasAnyQuotes(tenderId: string) {
    const [lotQuoteCount, lineQuoteCount] = await Promise.all([
      this.quoteRepo.count({ where: { tenderId } }),
      this.lineQuoteRepo.count({ where: { tenderId } }),
    ]);
    return lotQuoteCount + lineQuoteCount > 0;
  }

  private async withUserSummary(tenders: Tender[]) {
    const userIds = Array.from(new Set(tenders.flatMap((tender) => [tender.createdBy, tender.updatedBy]).filter(Boolean) as string[]));
    if (!userIds.length) return tenders.map((tender) => ({
      ...tender,
      participationScope: tender.participationMode === ParticipationMode.SELECTED ? 'invited' : 'public',
    }));

    const users = await this.userRepo.find({ where: { id: In(userIds) } });
    const userMap = new Map(users.map((user) => [user.id, {
      id: user.id,
      displayName: user.displayName,
      loginName: user.loginName,
      email: user.email,
    }]));

    return tenders.map((tender) => ({
      ...tender,
      participationScope: tender.participationMode === ParticipationMode.SELECTED ? 'invited' : 'public',
      creator: userMap.get(tender.createdBy) ?? null,
      updater: tender.updatedBy ? userMap.get(tender.updatedBy) ?? null : null,
    }));
  }

  private applySupplierAccessScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    tenderAlias: string,
    supplierId: string,
    scopeAlias: string,
  ) {
    qb.leftJoin(`${tenderAlias}.invitations`, scopeAlias,
      `${scopeAlias}.supplierId = :supplierId AND ${scopeAlias}.roundNo = ${tenderAlias}.currentQuoteRound`,
      { supplierId })
      .andWhere(`(${tenderAlias}.participationMode = :allMode OR ${scopeAlias}.id IS NOT NULL)`, { allMode: ParticipationMode.ALL });
  }

  async invite(tenderId: string, supplierIds: string[], visibleAt: string | undefined, ctx: AuditContext, roundNo?: number, source = 'manual') {
    const t = await this.findById(tenderId);
    if (![TenderStatus.DRAFT, TenderStatus.PUBLISHED].includes(t.status)) {
      throw new BadRequestException('error.tender.cannot_invite');
    }

    const results = [];
    const targetRound = roundNo ?? t.currentQuoteRound ?? 1;
    for (const sid of supplierIds) {
      const existing = await this.invRepo.findOne({ where: { tenderId, supplierId: sid, roundNo: targetRound } });
      if (existing) { results.push(existing); continue; }

      const inv = this.invRepo.create({
        tenderId,
        supplierId: sid,
        roundNo: targetRound,
        source,
        invitedAt: new Date(),
        visibleAt: visibleAt ? new Date(visibleAt) : undefined,
        status: InvitationStatus.PENDING,
      });
      results.push(await this.invRepo.save(inv));
    }
    await this.audit.log(ctx, AuditEntityType.INVITATION, tenderId, AuditAction.INVITATION_SEND, undefined, { supplierIds, visibleAt });
    return results;
  }

  getTemplate(type: TenderType) {
    return TEMPLATES[type];
  }

  previewLotImport(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('error.tender.import_empty_workbook');
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
      .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
    if (rows.length < 2) throw new BadRequestException('error.tender.import_requires_header_and_rows');

    const labels = (rows[0] ?? []).map((cell) => String(cell ?? '').trim());
    const columns = labels
      .map((label, index) => ({ key: `col_${String(index + 1).padStart(3, '0')}`, label: label || `字段 ${index + 1}`, type: 'text' }))
      .filter((col) => col.label.trim());
    if (!columns.length) throw new BadRequestException('error.tender.import_missing_header');

    const dataRows = rows.slice(1).map((row, rowIndex) => {
      const data: Record<string, unknown> = {};
      columns.forEach((col, colIndex) => {
        const value = row[colIndex];
        data[col.key] = value === undefined ? '' : value;
      });
      return { rowNo: rowIndex + 1, dataJson: data };
    });

    return { sheetName, columns, rows: dataRows, total: dataRows.length };
  }

  async advanceQuoteRound(id: string, ctx: AuditContext) {
    const before = await this.findById(id);
    if (![TenderStatus.DRAFT, TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED].includes(before.status)) {
      throw new BadRequestException('error.tender.invalid_status_transition');
    }
    const nextRound = Number(before.currentQuoteRound ?? 1) + 1;
    const previousRound = before.currentQuoteRound ?? 1;
    const previousInvitedIds = await this.getInvitedSupplierIds(id, previousRound);
    const previousSupplierIds = previousInvitedIds.length ? previousInvitedIds : await this.getQuotedSupplierIds(id, previousRound);
    await this.ds.transaction(async (em) => {
      await em.update(Tender, id, {
        currentQuoteRound: nextRound,
        status: TenderStatus.DRAFT,
        bidStartAt: null,
        bidDeadline: null,
        participationMode: previousSupplierIds.length ? ParticipationMode.SELECTED : ParticipationMode.ALL,
        updatedBy: ctx.userId,
      } as any);
      if (previousSupplierIds.length) {
        await this.replaceParticipants(em, id, nextRound, ParticipationMode.SELECTED, previousSupplierIds, 'previous_round');
      }
      // 克隆上一轮线路到新一轮：新一轮拿到独立的线路副本，编辑结构不再影响上一轮快照。
      const prevLines = await em.find(LotLine, { where: { tenderId: id, roundNo: previousRound, isActive: true } });
      for (const line of prevLines) {
        await em.save(em.create(LotLine, {
          tenderId: line.tenderId,
          lotId: line.lotId,
          lineNo: line.lineNo,
          rowNo: line.rowNo,
          roundNo: nextRound,
          sortOrder: line.sortOrder,
          dataJson: line.dataJson,
          schemaVersion: line.schemaVersion,
          isActive: true,
        }));
      }
    });
    await this.audit.log(ctx, AuditEntityType.TENDER, id, AuditAction.TENDER_UPDATE, {
      currentQuoteRound: before.currentQuoteRound,
      status: before.status,
    }, { currentQuoteRound: nextRound, status: TenderStatus.DRAFT });
    return this.findById(id);
  }

  async getParticipantOptions(id: string, search = '', page = 1, limit = 10, sort = 'name', previousOnly = false, candidateMode = 'all') {
    const tender = await this.findById(id);
    const currentRound = tender.currentQuoteRound ?? 1;
    const previousRound = Math.max(1, currentRound - 1);
    const [selectedScopes, previousInvitedIds, previousQuotedIds, quoteStats] = await Promise.all([
      this.invRepo.find({ where: { tenderId: id, roundNo: currentRound } }),
      this.getInvitedSupplierIds(id, previousRound),
      this.getQuotedSupplierIds(id, previousRound),
      this.getQuotedSupplierStats(id, previousRound),
    ]);
    const selectedIds = new Set(selectedScopes.map((scope) => scope.supplierId));
    const previousInvitedSet = new Set(previousInvitedIds);
    const previousQuotedSet = new Set(previousQuotedIds);

    const qb = this.supplierRepo.createQueryBuilder('s')
      .where('s.status = :status', { status: SupplierStatus.ACTIVE })
      .andWhere('s.review_status = :reviewStatus', { reviewStatus: SupplierReviewStatus.APPROVED });
    if (search?.trim()) {
      qb.andWhere('(s.legal_name ILIKE :q OR s.short_name ILIKE :q OR s.business_id ILIKE :q OR s.contact_name ILIKE :q)', { q: `%${search.trim()}%` });
    }
    const constrainedIds = candidateMode === 'invited'
      ? previousInvitedIds
      : candidateMode === 'quoted' || previousOnly
        ? previousQuotedIds
        : [];
    if (constrainedIds.length) {
      qb.andWhere('s.id IN (:...constrainedIds)', { constrainedIds });
    } else if (candidateMode === 'invited' || candidateMode === 'quoted' || previousOnly) {
        return {
          items: [],
          total: 0,
          page: Math.max(Number(page) || 1, 1),
          limit: Math.min(Math.max(Number(limit) || 10, 1), 100),
          participationMode: tender.participationMode ?? ParticipationMode.ALL,
          selectedSupplierIds: Array.from(selectedIds),
          selectedSuppliers: [],
          previousRoundSupplierIds: previousInvitedIds,
          previousInvitedSupplierIds: previousInvitedIds,
          previousQuotedSupplierIds: previousQuotedIds,
        };
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const allItems = await qb.getMany();
    const enrichedItems = allItems.map((supplier) => ({
      ...supplier,
      selected: selectedIds.has(supplier.id),
      previousRoundInvited: previousInvitedSet.has(supplier.id),
      previousRoundParticipant: previousQuotedSet.has(supplier.id),
      quoteStats: quoteStats.get(supplier.id) ?? null,
    })).sort((a, b) => this.compareSupplierOption(a, b, sort));
    const total = enrichedItems.length;
    const items = enrichedItems.slice((safePage - 1) * safeLimit, safePage * safeLimit);
    const selectedSuppliers = selectedIds.size
      ? await this.supplierRepo.find({ where: { id: In(Array.from(selectedIds)) }, order: { legalName: 'ASC' } })
      : [];
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      participationMode: tender.participationMode ?? ParticipationMode.ALL,
      selectedSupplierIds: Array.from(selectedIds),
      selectedSuppliers,
      previousRoundSupplierIds: previousInvitedIds,
      previousInvitedSupplierIds: previousInvitedIds,
      previousQuotedSupplierIds: previousQuotedIds,
    };
  }

  async getParticipants(id: string) {
    const tender = await this.findById(id);
    const roundNo = tender.currentQuoteRound ?? 1;
    if ((tender.participationMode ?? ParticipationMode.ALL) === ParticipationMode.ALL) {
      return {
        participationMode: ParticipationMode.ALL,
        roundNo,
        source: 'all',
        suppliers: [],
      };
    }
    const scopes = await this.invRepo.find({ where: { tenderId: id, roundNo }, order: { createdAt: 'ASC' } });
    const supplierIds = scopes.map((scope) => scope.supplierId);
    const suppliers = supplierIds.length ? await this.supplierRepo.find({ where: { id: In(supplierIds) } }) : [];
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    return {
      participationMode: ParticipationMode.SELECTED,
      roundNo,
      source: scopes[0]?.source ?? 'manual',
      suppliers: scopes.map((scope) => ({
        ...supplierMap.get(scope.supplierId),
        supplierId: scope.supplierId,
        source: scope.source,
        invitedAt: scope.invitedAt,
      })),
    };
  }

  private async replaceParticipants(em: EntityManager, tenderId: string, roundNo: number, mode: ParticipationMode | string, supplierIds: string[], source: string) {
    await em.delete(Invitation, { tenderId, roundNo });
    if (mode !== ParticipationMode.SELECTED) return;
    const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
    if (!uniqueSupplierIds.length) throw new BadRequestException('error.tender.participant_required');
    const suppliers = await em.find(Supplier, {
      where: {
        id: In(uniqueSupplierIds),
        status: SupplierStatus.ACTIVE,
        reviewStatus: SupplierReviewStatus.APPROVED,
      },
    });
    if (suppliers.length !== uniqueSupplierIds.length) throw new BadRequestException('error.tender.invalid_participants');
    await em.save(suppliers.map((supplier) => em.create(Invitation, {
      tenderId,
      supplierId: supplier.id,
      roundNo,
      source,
      invitedAt: new Date(),
      status: InvitationStatus.PENDING,
    })));
  }

  private normalizeParticipationMode(mode?: ParticipationMode | string) {
    return mode === ParticipationMode.SELECTED || mode === 'selected' ? ParticipationMode.SELECTED : ParticipationMode.ALL;
  }

  private async getQuotedSupplierIds(tenderId: string, roundNo: number) {
    const [lineQuotes, lotQuotes] = await Promise.all([
      this.lineQuoteRepo.find({ where: { tenderId, roundNo, isValid: true }, select: ['supplierId'] }),
      this.quoteRepo.find({ where: { tenderId, isValid: true }, select: ['supplierId'] }),
    ]);
    return Array.from(new Set([...lineQuotes, ...lotQuotes].map((quote) => quote.supplierId).filter(Boolean)));
  }

  private async getInvitedSupplierIds(tenderId: string, roundNo: number) {
    const scopes = await this.invRepo.find({ where: { tenderId, roundNo }, select: ['supplierId'] });
    return Array.from(new Set(scopes.map((scope) => scope.supplierId).filter(Boolean)));
  }

  private async getQuotedSupplierStats(tenderId: string, roundNo: number) {
    const [lineQuotes, lotQuotes] = await Promise.all([
      this.lineQuoteRepo.find({ where: { tenderId, roundNo, isValid: true }, select: ['supplierId', 'totalPrice', 'submittedAt'] }),
      this.quoteRepo.find({ where: { tenderId, isValid: true }, select: ['supplierId', 'totalPrice', 'submittedAt'] }),
    ]);
    const stats = new Map<string, { quoteCount: number; minTotalPrice: number | null; lastSubmittedAt: Date | null }>();
    for (const quote of [...lineQuotes, ...lotQuotes]) {
      const current = stats.get(quote.supplierId) ?? { quoteCount: 0, minTotalPrice: null, lastSubmittedAt: null };
      const price = Number(quote.totalPrice);
      current.quoteCount += 1;
      current.minTotalPrice = current.minTotalPrice === null ? price : Math.min(current.minTotalPrice, price);
      current.lastSubmittedAt = !current.lastSubmittedAt || quote.submittedAt > current.lastSubmittedAt ? quote.submittedAt : current.lastSubmittedAt;
      stats.set(quote.supplierId, current);
    }
    return stats;
  }

  private compareSupplierOption(a: any, b: any, sort: string) {
    if (sort === 'quote_amount') {
      const av = a.quoteStats?.minTotalPrice ?? Number.POSITIVE_INFINITY;
      const bv = b.quoteStats?.minTotalPrice ?? Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
    }
    if (sort === 'quote_time') {
      const av = a.quoteStats?.lastSubmittedAt ? new Date(a.quoteStats.lastSubmittedAt).getTime() : 0;
      const bv = b.quoteStats?.lastSubmittedAt ? new Date(b.quoteStats.lastSubmittedAt).getTime() : 0;
      if (av !== bv) return bv - av;
    }
    if (sort === 'quote_count') {
      const av = a.quoteStats?.quoteCount ?? 0;
      const bv = b.quoteStats?.quoteCount ?? 0;
      if (av !== bv) return bv - av;
    }
    return String(a.legalName || a.shortName || a.businessId || '').localeCompare(String(b.legalName || b.shortName || b.businessId || ''));
  }

  async getQuoteReview(id: string) {
    const tender = await this.findById(id);
    const roundNo = tender.currentQuoteRound ?? 1;
    const lots = [...(tender.lots ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const lotIds = lots.map((lot) => lot.id);

    // 按 标包+轮次 分组的线路（每轮各自独立的结构快照）
    const allLines = await this.lineRepo.find({
      where: { tenderId: tender.id, isActive: true },
      order: { sortOrder: 'ASC' },
    });
    const linesByLotRound = new Map<string, LotLine[]>();
    for (const ln of allLines) {
      const key = `${ln.lotId}:${ln.roundNo}`;
      linesByLotRound.set(key, [...(linesByLotRound.get(key) ?? []), ln]);
    }
    // 取某标包某轮的线路。新数据每轮各有线路按 round 精确取；
    // 历史数据线路只集中在某一轮时，所有轮次回退到该唯一一轮。
    const linesForLotRound = (lotId: string, round: number): LotLine[] => {
      const exact = linesByLotRound.get(`${lotId}:${round}`);
      if (exact) return exact;
      const avail = [...linesByLotRound.entries()].filter(([key]) => key.startsWith(`${lotId}:`));
      return avail.length === 1 ? avail[0][1] : [];
    };

    const [lineQuotes, lotQuotes] = await Promise.all([
      this.lineQuoteRepo.find({ where: { tenderId: tender.id }, order: { roundNo: 'DESC', version: 'DESC', submittedAt: 'DESC' } }),
      lotIds.length
        ? this.quoteRepo.find({ where: { lotId: In(lotIds) }, order: { version: 'DESC', submittedAt: 'DESC' } })
        : Promise.resolve([]),
    ]);

    const supplierIds = Array.from(new Set([
      ...lineQuotes.map((quote) => quote.supplierId),
      ...lotQuotes.map((quote) => quote.supplierId),
    ].filter(Boolean)));
    const suppliers = supplierIds.length ? await this.supplierRepo.find({ where: { id: In(supplierIds) } }) : [];
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

    const lineHistoryMap = new Map<string, LineQuote[]>();
    for (const quote of lineQuotes) {
      const key = `${quote.roundNo}:${quote.lineId}:${quote.supplierId}`;
      lineHistoryMap.set(key, [...(lineHistoryMap.get(key) ?? []), quote]);
    }

    const lotHistoryMap = new Map<string, Quote[]>();
    for (const quote of lotQuotes) {
      const key = `${quote.lotId}:${quote.supplierId}`;
      lotHistoryMap.set(key, [...(lotHistoryMap.get(key) ?? []), quote]);
    }

    const roundRange = Array.from({ length: Math.max(Number(roundNo), 1) }, (_, index) => index + 1);
    const roundNumbers = Array.from(new Set([
      ...roundRange,
      roundNo,
      ...lineQuotes.map((quote) => quote.roundNo),
    ])).sort((a, b) => a - b);

    const buildLotsForRound = (targetRound: number) => lots.map((lot) => {
        const lines = [...linesForLotRound(lot.id, targetRound)].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        const latestLotQuotes = this.latestBySupplier(lotQuotes.filter((quote) => quote.lotId === lot.id))
          .sort((a, b) => Number(a.totalPrice) - Number(b.totalPrice))
          .map((quote, index) => this.enrichQuote(quote, supplierMap, index + 1, lotHistoryMap.get(`${quote.lotId}:${quote.supplierId}`) ?? []));

        return {
          lotId: lot.id,
          lotNo: lot.lotNo,
          title: lot.title,
          description: lot.description,
          lineColumns: lot.uiSchema?.lineColumns ?? [],
          quoteStats: this.buildQuoteStats(latestLotQuotes),
          latestQuotes: latestLotQuotes,
          priceGroups: this.buildPriceGroups(latestLotQuotes),
          lines: lines.map((line) => {
            const latestQuotes = this.latestBySupplier(lineQuotes.filter((quote) => quote.lineId === line.id && quote.roundNo === targetRound))
              .sort((a, b) => Number(a.totalPrice) - Number(b.totalPrice))
              .map((quote, index) => this.enrichQuote(quote, supplierMap, index + 1, lineHistoryMap.get(`${targetRound}:${quote.lineId}:${quote.supplierId}`) ?? []));
            return {
              lineId: line.id,
              lineNo: line.lineNo,
              rowNo: line.rowNo,
              dataJson: line.dataJson,
              quoteStats: this.buildQuoteStats(latestQuotes),
              latestQuotes,
              priceGroups: this.buildPriceGroups(latestQuotes),
            };
          }),
        };
      });

    const rounds = roundNumbers.map((targetRound) => ({
      roundNo: targetRound,
      lots: buildLotsForRound(targetRound),
    }));

    return {
      tenderId: tender.id,
      tenderNo: tender.tenderNo,
      currentRound: roundNo,
      availableRounds: roundNumbers,
      rounds,
      lots: rounds.find((round) => round.roundNo === roundNo)?.lots ?? buildLotsForRound(roundNo),
    };
  }

  private normalizeAttachments(attachments?: TenderAttachmentInput[]) {
    return (attachments ?? [])
      .filter((item) => item.objectKey || item.key)
      .map((item) => ({
        key: item.objectKey ?? item.key!,
        name: item.fileName ?? item.name ?? '附件',
        size: item.fileSize ?? item.size ?? 0,
        mimeType: item.mimeType,
        fileUrl: item.fileUrl ?? `/api/uploads/preview/${encodeURIComponent(item.objectKey ?? item.key!)}`,
      }));
  }

  private latestBySupplier<T extends { supplierId: string; isLatest: boolean; version: number; submittedAt: Date }>(quotes: T[]) {
    const latest = new Map<string, T>();
    for (const quote of quotes) {
      const current = latest.get(quote.supplierId);
      if (!current || quote.isLatest || quote.version > current.version || quote.submittedAt > current.submittedAt) {
        latest.set(quote.supplierId, quote);
      }
    }
    return Array.from(latest.values()).filter((quote) => quote.isLatest);
  }

  private enrichQuote<T extends {
    supplierId: string;
    totalPrice: number;
    currency: string;
    submittedAt: Date;
  }>(quote: T, supplierMap: Map<string, Supplier>, rank: number, history: T[]) {
    const supplier = supplierMap.get(quote.supplierId);
    const supplierName = supplier?.legalName || supplier?.shortName || supplier?.businessId || quote.supplierId;
    return {
      ...quote,
      rank,
      supplierName,
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
      history: history
        .sort((a: any, b: any) => Number(b.version ?? 0) - Number(a.version ?? 0))
        .map((item) => ({ ...item, supplierName })),
    };
  }

  private buildQuoteStats(quotes: Array<{ totalPrice: number }>) {
    const prices = quotes.map((quote) => Number(quote.totalPrice)).filter((price) => Number.isFinite(price));
    const total = prices.reduce((sum, price) => sum + price, 0);
    return {
      quotedSupplierCount: quotes.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      avgPrice: prices.length ? total / prices.length : null,
    };
  }

  private buildPriceGroups(quotes: Array<{ totalPrice: number; currency: string; supplierId: string; supplierName?: string; supplier?: any }>) {
    const groups = new Map<string, any>();
    for (const quote of quotes) {
      const price = Number(quote.totalPrice);
      const key = `${quote.currency}:${price.toFixed(4)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          price,
          currency: quote.currency,
          supplierCount: 0,
          suppliers: [],
        });
      }
      const group = groups.get(key);
      group.supplierCount += 1;
      group.suppliers.push({
        supplierId: quote.supplierId,
        supplierName: quote.supplierName ?? quote.supplierId,
        supplier: quote.supplier ?? null,
      });
    }
    return Array.from(groups.values()).sort((a, b) => a.price - b.price);
  }

  /**
   * 增量同步标包：保留已有 ID 的标包/线路（其历史报价不受影响），新增无 ID 的，软删除被移除的线路。
   * 第二轮起即使已有报价也能改报价结构——上一轮报价是快照，FK 指向的线路 ID 始终保留。
   */
  private async syncLots(
    em: EntityManager,
    tenderId: string,
    lots: TenderLotInput[],
    opts: { baseCurrency: string; template: { specJson: object; uiSchema: object }; hasAnyQuotes: boolean; currentRound: number },
  ) {
    const existingLots = await em.find(Lot, { where: { tenderId } });
    const existingLotMap = new Map(existingLots.map((lot) => [lot.id, lot]));
    const keptLotIds = new Set<string>();

    for (let i = 0; i < lots.length; i++) {
      const input = lots[i];
      const existing = input.id ? existingLotMap.get(input.id) : undefined;
      let lot: Lot;
      if (existing) {
        existing.title = input.title;
        existing.description = input.description;
        existing.quantity = input.quantity as any;
        existing.unit = input.unit as any;
        existing.pricingMode = input.pricingMode ?? existing.pricingMode ?? 'total_price';
        existing.budgetAmount = input.budgetAmount as any;
        existing.budgetCurrency = input.budgetCurrency ?? opts.baseCurrency;
        existing.sortOrder = i;
        lot = await em.save(existing);
      } else {
        lot = await em.save(em.create(Lot, {
          lotNo: await nextLotNo(em),
          tenderId,
          title: input.title,
          description: input.description,
          quantity: input.quantity,
          unit: input.unit,
          pricingMode: input.pricingMode ?? 'total_price',
          specJson: input.specJson ?? opts.template.specJson,
          uiSchema: input.uiSchema ?? opts.template.uiSchema,
          budgetAmount: input.budgetAmount,
          budgetCurrency: input.budgetCurrency ?? opts.baseCurrency,
          sortOrder: i,
          schemaVersion: 1,
        }));
      }
      keptLotIds.add(lot.id);
      await this.syncLotLines(em, tenderId, lot, input, opts.currentRound);
    }

    // 被移除的标包：无任何报价才物理删除；有报价则保留以保护历史。
    for (const lot of existingLots) {
      if (keptLotIds.has(lot.id)) continue;
      const [lq, llq] = await Promise.all([
        em.count(Quote, { where: { lotId: lot.id } }),
        em.count(LineQuote, { where: { lotId: lot.id } }),
      ]);
      if (lq + llq === 0) {
        await em.delete(LotLine, { lotId: lot.id });
        await em.delete(Lot, { id: lot.id });
      }
    }
  }

  /**
   * 增量同步某标包【当前轮】的线路：已有 ID 更新、无 ID 新增、被移除的软删除。
   * 只操作 round_no = currentRound 的线路，上一轮线路（不同 round_no）原封不动，保证轮次快照独立。
   */
  private async syncLotLines(em: EntityManager, tenderId: string, lot: Lot, input: TenderLotInput, currentRound: number) {
    const columns = this.normalizeLineColumns(input.lineColumns);
    if (columns.length) {
      lot.uiSchema = { ...(lot.uiSchema ?? {}), lineColumns: columns };
      await em.save(lot);
    }

    const lines = input.lines ?? [];
    const existingLines = await em.find(LotLine, { where: { lotId: lot.id, roundNo: currentRound } });
    const existingLineMap = new Map(existingLines.map((line) => [line.id, line]));
    const keptLineIds = new Set<string>();
    let maxRowNo = existingLines.reduce((max, line) => Math.max(max, line.rowNo ?? 0), 0);

    for (let i = 0; i < lines.length; i++) {
      const lineInput = lines[i];
      const dataJson = lineInput.dataJson ?? lineInput.data ?? {};
      const existing = lineInput.id ? existingLineMap.get(lineInput.id) : undefined;
      if (existing) {
        existing.dataJson = dataJson;
        existing.rowNo = lineInput.rowNo ?? existing.rowNo;
        existing.sortOrder = i;
        existing.isActive = true;
        await em.save(existing);
        keptLineIds.add(existing.id);
      } else {
        maxRowNo += 1;
        await em.save(em.create(LotLine, {
          tenderId,
          lotId: lot.id,
          lineNo: `LN-${String(maxRowNo).padStart(4, '0')}`,
          rowNo: lineInput.rowNo ?? maxRowNo,
          roundNo: currentRound,
          sortOrder: i,
          dataJson,
          schemaVersion: lot.schemaVersion ?? 1,
          isActive: true,
        }));
      }
    }

    // 被移除的【当前轮】线路：软删除，保留历史报价的 FK 指向。
    for (const line of existingLines) {
      if (!keptLineIds.has(line.id) && line.isActive) {
        line.isActive = false;
        await em.save(line);
      }
    }
  }

  private async saveLotLines(em: EntityManager, tenderId: string, lot: Lot, input: TenderLotInput) {
    const lines = input.lines ?? [];
    if (!lines.length) return;

    const columns = this.normalizeLineColumns(input.lineColumns);
    if (columns.length) {
      lot.uiSchema = {
        ...(lot.uiSchema ?? {}),
        lineColumns: columns,
      };
      await em.save(lot);
    }

    for (let i = 0; i < lines.length; i++) {
      const dataJson = lines[i].dataJson ?? lines[i].data ?? {};
      await em.save(em.create(LotLine, {
        tenderId,
        lotId: lot.id,
        lineNo: `LN-${String(i + 1).padStart(4, '0')}`,
        rowNo: lines[i].rowNo ?? i + 1,
        roundNo: 1,
        sortOrder: i,
        dataJson,
        schemaVersion: lot.schemaVersion ?? 1,
        isActive: true,
      }));
    }
  }

  private normalizeLineColumns(columns?: LineColumnInput[]) {
    return (columns ?? [])
      .filter((col) => col.label?.trim())
      .map((col, index) => ({
        key: col.key?.trim() || `col_${String(index + 1).padStart(3, '0')}`,
        label: col.label.trim(),
        type: col.type ?? 'text',
        required: Boolean(col.required),
      }));
  }

  private shouldOpenNow(tender: Pick<Tender, 'bidStartAt' | 'bidDeadline'>) {
    const now = new Date();
    if (tender.bidDeadline && tender.bidDeadline <= now) return false;
    return !tender.bidStartAt || tender.bidStartAt <= now;
  }

  private validateTenderSchedule(bidStartAt?: string, bidDeadline?: string) {
    const start = bidStartAt ? new Date(bidStartAt) : undefined;
    const deadline = bidDeadline ? new Date(bidDeadline) : undefined;
    if (start && Number.isNaN(start.getTime())) throw new BadRequestException('error.tender.invalid_bid_start_at');
    if (deadline && Number.isNaN(deadline.getTime())) throw new BadRequestException('error.tender.invalid_bid_deadline');
    if (start && deadline && start >= deadline) throw new BadRequestException('error.tender.start_must_before_deadline');
    if (deadline && deadline <= new Date()) throw new BadRequestException('error.tender.deadline_must_be_future');
  }

  async refreshLifecycleStatuses() {
    const now = new Date();
    await this.tenderRepo
      .createQueryBuilder()
      .update(Tender)
      .set({ status: TenderStatus.CLOSED })
      .where('status IN (:...statuses)', { statuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN] })
      .andWhere('bid_deadline IS NOT NULL')
      .andWhere('bid_deadline <= :now', { now })
      .execute();

    await this.tenderRepo
      .createQueryBuilder()
      .update(Tender)
      .set({ status: TenderStatus.OPEN })
      .where('status = :status', { status: TenderStatus.PUBLISHED })
      .andWhere('(bid_start_at IS NULL OR bid_start_at <= :now)', { now })
      .andWhere('(bid_deadline IS NULL OR bid_deadline > :now)', { now })
      .execute();
  }
}
