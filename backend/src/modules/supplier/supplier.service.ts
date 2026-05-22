/**
 * 文件：backend/src/modules/supplier/supplier.service.ts
 * 功能：处理供应商创建、查询、更新、挂起恢复与指纹碰撞检查。
 * 交互：被 supplier.controller.ts 调用；使用 supplier.entity.ts 持久化；写入 audit.service.ts 审计日志。
 * 作者：吴川
 */
import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { Supplier, SupplierReviewStatus, SupplierStatus } from './supplier.entity';
import { I18nService } from '../../shared/i18n/i18n.service';
import { SupplierDocument } from './supplier-document.entity';
import { SupplierReviewLog } from './supplier-review-log.entity';
import { SupplierInvitation } from './supplier-invitation.entity';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import { User } from '../auth/user.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';

// 当前产品阶段仅开放印尼供应商认证，后端统一默认 ID。
// 后续开放多国家时，再由前端传入国家码，并在资料模板与校验规则中扩展对应国家。
const DEFAULT_SUPPLIER_COUNTRY_CODE = 'ID';

function nextBusinessId(seq: number, region = DEFAULT_SUPPLIER_COUNTRY_CODE): string {
  return `S-${region}-${String(seq).padStart(5, '0')}`;
}

interface SupplierDocumentInput {
  docType: string;
  docLabel: string;
  textValue?: string;
  fileName?: string;
  fileUrl?: string;
  objectKey?: string;
  mimeType?: string;
  fileSize?: number;
}

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier) private readonly repo: Repository<Supplier>,
    @InjectRepository(SupplierDocument) private readonly documentRepo: Repository<SupplierDocument>,
    @InjectRepository(SupplierReviewLog) private readonly reviewLogRepo: Repository<SupplierReviewLog>,
    @InjectRepository(SupplierInvitation) private readonly invitationRepo: Repository<SupplierInvitation>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SupplierAccount) private readonly supplierAccountRepo: Repository<SupplierAccount>,
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
  ) {}

  async create(data: Partial<Supplier>, ctx: AuditContext) {
    const count = await this.repo.count();
    const businessId = nextBusinessId(count + 1, data.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE);

    const existing = await this.repo.findOne({ where: { businessId } });
    if (existing) throw new ConflictException('error.supplier.business_id_conflict');

    const supplier = this.repo.create({
      ...data,
      businessId,
      status: data.status ?? SupplierStatus.ACTIVE,
      reviewStatus: data.reviewStatus ?? SupplierReviewStatus.NOT_SUBMITTED,
    });
    const saved = await this.repo.save(supplier);

    await this.audit.log(ctx, AuditEntityType.SUPPLIER, saved.id, AuditAction.SUPPLIER_CREATE, undefined, { businessId: saved.businessId, legalName: saved.legalName });
    return saved;
  }

  async findAll(filters: {
    status?: SupplierStatus;
    reviewStatus?: SupplierReviewStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.repo.createQueryBuilder('s');
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.reviewStatus) qb.andWhere('s.review_status = :reviewStatus', { reviewStatus: filters.reviewStatus });
    if (filters.search) {
      qb.andWhere(
        `(
          s.legal_name ILIKE :q
          OR s.short_name ILIKE :q
          OR s.business_id ILIKE :q
          OR s.contact_name ILIKE :q
          OR s.contact_email ILIKE :q
          OR s.contact_phone ILIKE :q
        )`,
        { q: `%${filters.search}%` },
      );
    }
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    qb.skip((page - 1) * limit).take(limit).orderBy('s.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findById(id: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('error.supplier.not_found');
    return s;
  }

  /** 导出供应商清单 Excel（按当前筛选条件，含编号/名称/状态/审核状态/国家/联系方式）。 */
  async exportSuppliers(filters: { status?: SupplierStatus; reviewStatus?: SupplierReviewStatus; search?: string }): Promise<Buffer> {
    const qb = this.repo.createQueryBuilder('s');
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.reviewStatus) qb.andWhere('s.review_status = :reviewStatus', { reviewStatus: filters.reviewStatus });
    if (filters.search) {
      qb.andWhere(
        `(
          s.legal_name ILIKE :q
          OR s.short_name ILIKE :q
          OR s.business_id ILIKE :q
          OR s.contact_name ILIKE :q
          OR s.contact_email ILIKE :q
          OR s.contact_phone ILIKE :q
        )`,
        { q: `%${filters.search}%` },
      );
    }
    qb.orderBy('s.createdAt', 'DESC');
    const suppliers = await qb.getMany();

    const f = (k: string) => this.i18n.t(`supplierExport.field.${k}`);
    const HEADER_BG = 'FF1E293B';
    const BAND = 'FFF1F5F9';
    const BORDER = 'FFE2E8F0';
    const hair = { style: 'hair' as const, color: { argb: BORDER } };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BidFlow';
    wb.created = new Date();
    const ws = wb.addWorksheet(this.safeSheetName(this.i18n.t('supplierExport.sheet')), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const headers = [
      f('businessId'), f('legalName'), f('shortName'), f('status'), f('reviewStatus'),
      f('country'), f('contactEmail'), f('contactPhone'), f('contactName'),
    ];
    ws.columns = headers.map((h) => ({ header: h, width: 18 }));
    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    suppliers.forEach((s, index) => {
      const row = ws.addRow([
        s.businessId ?? '',
        s.legalName ?? '',
        s.shortName ?? '',
        this.i18n.t(`supplierExport.status.${s.status}`),
        this.i18n.t(`supplierExport.reviewStatus.${s.reviewStatus}`),
        s.countryCode ?? '',
        s.contactEmail ?? '',
        s.contactPhone ?? '',
        s.contactName ?? '',
      ]);
      row.height = 20;
      row.eachCell((cell) => {
        cell.border = {
          top: hair, bottom: hair, left: hair, right: hair,
        };
        cell.alignment = { vertical: 'middle', indent: 1 };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      });
    });

    // 列宽自适应（中文按 2 字宽）
    ws.columns?.forEach((col) => {
      let max = 8;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const text = cell.value == null ? '' : String(cell.value);
        const width = [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
        if (width > max) max = width;
      });
      col.width = Math.min(Math.max(max + 3, 12), 44);
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private safeSheetName(name: string) {
    return name.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  }

  /** 生成「参与供应商批量导入」模板：A 列供应商编号（必填），B 列名称（仅参考）。 */
  buildParticipantImportTemplate(): Buffer {
    const headerId = this.i18n.t('supplierImport.headerBusinessId');
    const headerName = this.i18n.t('supplierImport.headerName');
    const rows = [
      [headerId, headerName],
      [this.i18n.t('supplierImport.exampleId'), this.i18n.t('supplierImport.exampleName')],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, ws, this.safeSheetName(this.i18n.t('supplierImport.sheet')));
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /**
   * 解析「参与供应商批量导入」Excel，按供应商编号匹配系统内供应商。
   * 不落库——仅返回校验后的供应商列表与逐行失败明细，由前端并入已选名单、随招标提交。
   */
  async resolveParticipantImport(buffer?: Buffer) {
    if (!buffer?.length) throw new BadRequestException('error.tender.import_file_required');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException('error.tender.import_empty_workbook');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length < 2) throw new BadRequestException('error.tender.import_requires_header_and_rows');

    type ImportError = { row: number; value: string; reason: string };
    const errors: ImportError[] = [];
    const seen = new Set<string>();
    const wanted: Array<{ row: number; businessId: string }> = [];

    rows.slice(1).forEach((raw, index) => {
      const rowNo = index + 2; // 含表头 + 从 1 计数
      const businessId = String((raw as unknown[])[0] ?? '').trim();
      if (!businessId) return; // 容忍空行
      const norm = businessId.toUpperCase();
      if (seen.has(norm)) {
        errors.push({ row: rowNo, value: businessId, reason: this.i18n.t('supplierImport.reason.duplicate') });
        return;
      }
      seen.add(norm);
      wanted.push({ row: rowNo, businessId: norm });
    });

    // 非空数据行总数 = 唯一编号 + 重复行（此刻 errors 仅含重复项）
    const totalRows = wanted.length + errors.length;

    const found = wanted.length
      ? await this.repo.find({ where: { businessId: In(wanted.map((w) => w.businessId)) } })
      : [];
    const foundMap = new Map(found.map((s) => [s.businessId.toUpperCase(), s]));

    const matched: Array<{ id: string; businessId: string; legalName?: string; shortName?: string }> = [];
    for (const w of wanted) {
      const supplier = foundMap.get(w.businessId);
      if (!supplier) {
        errors.push({ row: w.row, value: w.businessId, reason: this.i18n.t('supplierImport.reason.notFound') });
        continue;
      }
      if (supplier.status !== SupplierStatus.ACTIVE || supplier.reviewStatus !== SupplierReviewStatus.APPROVED) {
        errors.push({ row: w.row, value: w.businessId, reason: this.i18n.t('supplierImport.reason.notEligible') });
        continue;
      }
      matched.push({
        id: supplier.id,
        businessId: supplier.businessId,
        legalName: supplier.legalName,
        shortName: supplier.shortName,
      });
    }

    return { matched, errors, total: totalRows };
  }

  async findReviewDetail(id: string) {
    const supplier = await this.findById(id);
    const [documents, reviewLogs] = await Promise.all([
      this.documentRepo.find({ where: { supplierId: id }, order: { sortOrder: 'ASC', createdAt: 'ASC' } }),
      this.reviewLogRepo.find({ where: { supplierId: id }, order: { createdAt: 'DESC' } }),
    ]);
    return { supplier, documents, reviewLogs };
  }

  async listReviewLogs(supplierId: string, page = 1, limit = 10) {
    await this.findById(supplierId);
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const [items, total] = await this.reviewLogRepo.findAndCount({
      where: { supplierId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return {
      items, total, page: safePage, limit: safeLimit,
    };
  }

  async update(id: string, data: Partial<Supplier>, ctx: AuditContext) {
    const before = await this.findById(id);
    await this.repo.update(id, data);
    const after = await this.findById(id);
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_CREATE, before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    return after;
  }

  async findSupplierIdForAccount(authUserId: string) {
    const relation = await this.supplierAccountRepo.findOne({
      where: { authUserId, status: 'active' },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return relation?.supplierId;
  }

  async createCompanyForAccount(authUserId: string, data: Partial<Supplier>, ctx: AuditContext) {
    const existingRelation = await this.supplierAccountRepo.findOne({ where: { authUserId, status: 'active' } });
    if (existingRelation) throw new BadRequestException('error.supplier.company_already_bound');
    if (!data.legalName || !data.shortName) throw new BadRequestException('error.supplier.company_required');

    const result = await this.ds.transaction(async (em) => {
      const count = await em.count(Supplier);
      const countryCode = data.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE;
      const businessId = nextBusinessId(count + 1, countryCode);
      const supplier = em.create(Supplier, {
        ...data,
        businessId,
        countryCode,
        status: SupplierStatus.ACTIVE,
        reviewStatus: SupplierReviewStatus.NOT_SUBMITTED,
      });
      const savedSupplier = await em.save(supplier);

      const user = await em.findOne(User, { where: { id: authUserId } });
      const relation = em.create(SupplierAccount, {
        authUserId,
        supplierId: savedSupplier.id,
        displayName: user?.displayName,
        isPrimary: true,
        relationRole: 'owner',
        status: 'active',
        createdByUserId: authUserId,
      });
      await em.save(relation);

      // 兼容现有报价/招标模块的单供应商上下文字段；后续多公司时改为显式 current supplier。
      await em.update(User, authUserId, { supplierId: savedSupplier.id });
      return { supplier: savedSupplier, relation };
    });

    await this.audit.log(
      ctx,
      AuditEntityType.SUPPLIER,
      result.supplier.id,
      AuditAction.SUPPLIER_CREATE,
      undefined,
      { businessId: result.supplier.businessId, relationRole: result.relation.relationRole },
    );
    return result;
  }

  async createInvitation(supplierId: string, data: { email?: string; relationRole?: 'admin' | 'operator' }, ctx: AuditContext) {
    await this.findById(supplierId);
    const token = randomUUID().replaceAll('-', '');
    const invitation = await this.invitationRepo.save(this.invitationRepo.create({
      token,
      supplierId,
      email: data.email,
      relationRole: data.relationRole ?? 'operator',
      status: 'pending',
      createdByUserId: ctx.userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    }));
    await this.audit.log(
      ctx,
      AuditEntityType.INVITATION,
      invitation.id,
      AuditAction.INVITATION_SEND,
      undefined,
      { supplierId, email: data.email, relationRole: invitation.relationRole },
    );
    return invitation;
  }

  async listInvitations(supplierId: string, page = 1, limit = 10) {
    await this.findById(supplierId);
    await this.invitationRepo.createQueryBuilder()
      .update(SupplierInvitation)
      .set({ status: 'expired' })
      .where('supplier_id = :supplierId', { supplierId })
      .andWhere('status = :status', { status: 'pending' })
      .andWhere('expires_at IS NOT NULL AND expires_at < :now', { now: new Date() })
      .execute();

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const qb = this.invitationRepo.createQueryBuilder('invitation')
      .leftJoin(User, 'acceptedBy', 'acceptedBy.id = invitation.accepted_by_user_id')
      .where('invitation.supplier_id = :supplierId', { supplierId })
      .orderBy('invitation.created_at', 'DESC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select([
        'invitation.id AS "id"',
        'invitation.token AS "token"',
        'invitation.supplier_id AS "supplierId"',
        'invitation.email AS "email"',
        'invitation.relation_role AS "relationRole"',
        'invitation.status AS "status"',
        'invitation.created_by_user_id AS "createdByUserId"',
        'invitation.accepted_by_user_id AS "acceptedByUserId"',
        'invitation.accepted_at AS "acceptedAt"',
        'invitation.expires_at AS "expiresAt"',
        'invitation.created_at AS "createdAt"',
        'invitation.updated_at AS "updatedAt"',
        'acceptedBy.id AS "acceptedById"',
        'acceptedBy.email AS "acceptedByEmail"',
        'acceptedBy.display_name AS "acceptedByDisplayName"',
      ]);
    const [rows, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    const items = rows.map((row) => ({
      id: row.id,
      token: row.token,
      supplierId: row.supplierId,
      email: row.email,
      relationRole: row.relationRole,
      status: row.status,
      createdByUserId: row.createdByUserId,
      acceptedByUserId: row.acceptedByUserId,
      acceptedAt: row.acceptedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      acceptedBy: row.acceptedById ? {
        id: row.acceptedById,
        email: row.acceptedByEmail,
        displayName: row.acceptedByDisplayName,
      } : null,
    }));
    return {
      items, total, page: safePage, limit: safeLimit,
    };
  }

  async revokeInvitation(supplierId: string, invitationId: string, ctx: AuditContext) {
    const invitation = await this.invitationRepo.findOne({ where: { id: invitationId, supplierId } });
    if (!invitation) throw new NotFoundException('error.supplier.invitation_not_found');
    if (invitation.status !== 'pending') throw new BadRequestException('error.supplier.invitation_not_pending');

    await this.invitationRepo.update(invitation.id, { status: 'revoked' });
    await this.audit.log(
      ctx,
      AuditEntityType.INVITATION,
      invitation.id,
      AuditAction.INVITATION_SEND,
      { status: invitation.status },
      { status: 'revoked' },
      { supplierId, source: 'manual_revoke' },
    );
    return this.invitationRepo.findOne({ where: { id: invitation.id } });
  }

  async previewInvitation(token: string) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) throw new BadRequestException('error.supplier.invitation_required');

    const invitation = await this.invitationRepo.findOne({ where: { token: normalizedToken } });
    if (!invitation) {
      return {
        token: normalizedToken,
        status: 'invalid',
        canJoin: false,
      };
    }

    let status = invitation.status;
    if (status === 'pending' && invitation.expiresAt && invitation.expiresAt < new Date()) {
      status = 'expired';
      await this.invitationRepo.update(invitation.id, { status });
    }
    const supplier = await this.repo.findOne({ where: { id: invitation.supplierId } });

    return {
      id: invitation.id,
      token: invitation.token,
      status,
      canJoin: status === 'pending',
      expiresAt: invitation.expiresAt,
      relationRole: invitation.relationRole,
      supplier: supplier ? {
        id: supplier.id,
        businessId: supplier.businessId,
        legalName: supplier.legalName,
        shortName: supplier.shortName,
        status: supplier.status,
        reviewStatus: supplier.reviewStatus,
      } : undefined,
    };
  }

  async joinCompanyByInvitation(authUserId: string, token: string, ctx: AuditContext) {
    const result = await this.ds.transaction(async (em) => {
      const invitation = await em.createQueryBuilder(SupplierInvitation, 'invitation')
        .setLock('pessimistic_write')
        .where('invitation.token = :token', { token })
        .getOne();
      if (!invitation || invitation.status !== 'pending') throw new BadRequestException('error.supplier.invitation_invalid');
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        await em.update(SupplierInvitation, invitation.id, { status: 'expired' });
        throw new BadRequestException('error.supplier.invitation_expired');
      }

      const existing = await em.findOne(SupplierAccount, {
        where: { authUserId, supplierId: invitation.supplierId },
      });
      if (existing) throw new BadRequestException('error.supplier.company_already_bound');

      const user = await em.findOne(User, { where: { id: authUserId } });
      const relation = em.create(SupplierAccount, {
        authUserId,
        supplierId: invitation.supplierId,
        displayName: user?.displayName,
        isPrimary: false,
        relationRole: invitation.relationRole,
        status: 'active',
        createdByUserId: invitation.createdByUserId,
      });
      const savedRelation = await em.save(relation);
      await em.update(SupplierInvitation, invitation.id, {
        status: 'accepted',
        acceptedByUserId: authUserId,
        acceptedAt: new Date(),
      });
      if (!user?.supplierId) await em.update(User, authUserId, { supplierId: invitation.supplierId });
      return { relation: savedRelation, supplierId: invitation.supplierId };
    });

    await this.audit.log(
      ctx,
      AuditEntityType.SUPPLIER,
      result.supplierId,
      AuditAction.USER_CREATE,
      undefined,
      { authUserId, relationRole: result.relation.relationRole, source: 'supplier_invitation' },
    );
    return { supplierId: result.supplierId, relation: result.relation };
  }

  async suspend(id: string, reason: string, ctx: AuditContext) {
    const s = await this.findById(id);
    if (s.status !== SupplierStatus.ACTIVE) throw new BadRequestException('error.supplier.only_active_can_suspend');
    await this.repo.update(id, { status: SupplierStatus.SUSPENDED, suspendedReason: reason });
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_SUSPEND, { status: s.status }, { status: SupplierStatus.SUSPENDED, reason });
    return this.findById(id);
  }

  async resume(id: string, ctx: AuditContext) {
    const s = await this.findById(id);
    if (s.status !== SupplierStatus.SUSPENDED) throw new BadRequestException('error.supplier.only_suspended_can_resume');
    await this.repo.update(id, {
      status: SupplierStatus.ACTIVE,
      suspendedReason: undefined,
    });
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_RESUME, { status: s.status }, { status: SupplierStatus.ACTIVE });
    return this.findById(id);
  }

  async approve(id: string, ctx: AuditContext, comment?: string) {
    const before = await this.findById(id);
    if (before.status !== SupplierStatus.ACTIVE || before.reviewStatus !== SupplierReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException('error.supplier.only_pending_review_can_approve');
    }
    await this.repo.update(id, {
      status: SupplierStatus.ACTIVE,
      reviewStatus: SupplierReviewStatus.APPROVED,
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      reviewComment: comment,
    });
    const after = await this.findById(id);
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_APPROVE, before as any, after as any, { comment });
    await this.writeReviewLog(id, 'approve', SupplierReviewStatus.APPROVED, ctx, comment);
    return after;
  }

  async reject(id: string, comment: string | undefined, ctx: AuditContext) {
    const before = await this.findById(id);
    if (before.status !== SupplierStatus.ACTIVE || before.reviewStatus !== SupplierReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException('error.supplier.only_pending_review_can_reject');
    }
    await this.repo.update(id, {
      reviewStatus: SupplierReviewStatus.REJECTED,
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      reviewComment: comment,
    });
    const after = await this.findById(id);
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_REJECT, before as any, after as any, { comment });
    await this.writeReviewLog(id, 'reject', SupplierReviewStatus.REJECTED, ctx, comment);
    return after;
  }

  async requestSupplement(id: string, comment: string | undefined, ctx: AuditContext) {
    const before = await this.findById(id);
    if (
      before.status !== SupplierStatus.ACTIVE
      || ![SupplierReviewStatus.PENDING_REVIEW, SupplierReviewStatus.APPROVED].includes(before.reviewStatus)
    ) {
      throw new BadRequestException('error.supplier.only_pending_or_approved_can_request_supplement');
    }
    await this.repo.update(id, {
      reviewStatus: SupplierReviewStatus.SUPPLEMENT_REQUIRED,
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      reviewComment: comment,
    });
    const after = await this.findById(id);
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, id, AuditAction.SUPPLIER_REQUEST_SUPPLEMENT, before as any, after as any, { comment });
    await this.writeReviewLog(id, 'request_supplement', SupplierReviewStatus.SUPPLEMENT_REQUIRED, ctx, comment);
    return after;
  }

  async submitProfile(
    supplierId: string,
    payload: {
      legalName: string;
      shortName: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      countryCode?: string;
      taxId?: string;
      documents?: SupplierDocumentInput[];
    },
    ctx: AuditContext,
  ) {
    const before = await this.findById(supplierId);
    if (!payload.legalName || !payload.shortName || !payload.contactName || !payload.contactPhone) {
      throw new BadRequestException('error.supplier.company_required');
    }
    const documents = (payload.documents ?? []).filter((d) => d.docType && d.docLabel && (d.textValue || d.fileUrl));
    if (documents.length === 0) {
      throw new BadRequestException('error.supplier.documents_required');
    }

    await this.ds.transaction(async (em) => {
      await em.update(Supplier, supplierId, {
        legalName: payload.legalName,
        shortName: payload.shortName,
        contactName: payload.contactName,
        contactEmail: payload.contactEmail,
        contactPhone: payload.contactPhone,
        countryCode: payload.countryCode ?? before.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE,
        taxId: payload.taxId,
        reviewStatus: SupplierReviewStatus.PENDING_REVIEW,
        reviewComment: undefined,
      });

      await em.delete(SupplierDocument, { supplierId });
      for (let i = 0; i < documents.length; i += 1) {
        const item = em.create(SupplierDocument, {
          supplierId,
          docType: documents[i].docType,
          docLabel: documents[i].docLabel,
          textValue: documents[i].textValue,
          fileName: documents[i].fileName,
          fileUrl: documents[i].fileUrl,
          objectKey: documents[i].objectKey,
          mimeType: documents[i].mimeType,
          fileSize: documents[i].fileSize,
          sortOrder: i,
        });
        await em.save(item);
      }

      const log = em.create(SupplierReviewLog, {
        supplierId,
        action: 'submit_profile',
        reviewStatus: SupplierReviewStatus.PENDING_REVIEW,
        operatorUserId: ctx.userId,
        operatorRole: ctx.userRole,
        comment: 'supplier_submitted_profile',
        metadata: { documentCount: documents.length },
      });
      await em.save(log);
    });

    const after = await this.findById(supplierId);
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, supplierId, AuditAction.SUPPLIER_PROFILE_SUBMIT, before as any, after as any, { documentCount: documents.length });
    return this.findReviewDetail(supplierId);
  }

  async getSupplierPortalProfile(supplierId: string) {
    return this.findReviewDetail(supplierId);
  }

  async getSupplierPortalProfileForAccount(authUserId: string) {
    const supplierId = await this.findSupplierIdForAccount(authUserId);
    if (!supplierId) {
      return {
        supplier: {
          reviewStatus: SupplierReviewStatus.NOT_SUBMITTED,
          status: SupplierStatus.ACTIVE,
          countryCode: DEFAULT_SUPPLIER_COUNTRY_CODE,
        },
        documents: [],
        reviewLogs: [],
      };
    }
    return this.findReviewDetail(supplierId);
  }

  async submitProfileForAccount(
    authUserId: string,
    payload: {
      legalName: string;
      shortName: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      countryCode?: string;
      taxId?: string;
      documents?: SupplierDocumentInput[];
    },
    ctx: AuditContext,
  ) {
    const supplierId = await this.findSupplierIdForAccount(authUserId);
    if (supplierId) return this.submitProfile(supplierId, payload, ctx);

    if (!payload.legalName || !payload.shortName || !payload.contactName || !payload.contactPhone) {
      throw new BadRequestException('error.supplier.company_required');
    }
    const documents = (payload.documents ?? []).filter((d) => d.docType && d.docLabel && (d.textValue || d.fileUrl));
    if (documents.length === 0) {
      throw new BadRequestException('error.supplier.documents_required');
    }

    const result = await this.ds.transaction(async (em) => {
      const count = await em.count(Supplier);
      const countryCode = payload.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE;
      const businessId = nextBusinessId(count + 1, countryCode);
      const user = await em.findOne(User, { where: { id: authUserId } });
      const supplier = em.create(Supplier, {
        businessId,
        legalName: payload.legalName,
        shortName: payload.shortName,
        contactName: payload.contactName,
        contactEmail: payload.contactEmail ?? user?.email,
        contactPhone: payload.contactPhone,
        countryCode,
        taxId: payload.taxId,
        status: SupplierStatus.ACTIVE,
        reviewStatus: SupplierReviewStatus.PENDING_REVIEW,
      });
      const savedSupplier = await em.save(supplier);

      await em.save(em.create(SupplierAccount, {
        authUserId,
        supplierId: savedSupplier.id,
        displayName: user?.displayName,
        isPrimary: true,
        relationRole: 'owner',
        status: 'active',
        createdByUserId: authUserId,
      }));
      await em.update(User, authUserId, { supplierId: savedSupplier.id });

      for (let i = 0; i < documents.length; i += 1) {
        await em.save(em.create(SupplierDocument, {
          supplierId: savedSupplier.id,
          docType: documents[i].docType,
          docLabel: documents[i].docLabel,
          textValue: documents[i].textValue,
          fileName: documents[i].fileName,
          fileUrl: documents[i].fileUrl,
          objectKey: documents[i].objectKey,
          mimeType: documents[i].mimeType,
          fileSize: documents[i].fileSize,
          sortOrder: i,
        }));
      }

      await em.save(em.create(SupplierReviewLog, {
        supplierId: savedSupplier.id,
        action: 'submit_profile',
        reviewStatus: SupplierReviewStatus.PENDING_REVIEW,
        operatorUserId: ctx.userId,
        operatorRole: ctx.userRole,
        comment: 'supplier_submitted_profile',
        metadata: { documentCount: documents.length, createdFromProfileSubmit: true },
      }));

      return savedSupplier;
    });

    await this.audit.log(
      ctx,
      AuditEntityType.SUPPLIER,
      result.id,
      AuditAction.SUPPLIER_CREATE,
      undefined,
      { businessId: result.businessId, source: 'profile_submit' },
    );
    await this.audit.log(ctx, AuditEntityType.SUPPLIER, result.id, AuditAction.SUPPLIER_PROFILE_SUBMIT, undefined, result as any, { documentCount: documents.length });
    return this.findReviewDetail(result.id);
  }

  async checkFingerprint(fingerprintHash: string, currentSupplierId: string): Promise<boolean> {
    const others = await this.repo
      .createQueryBuilder('s')
      .where('s.fingerprint_hash = :hash', { hash: fingerprintHash })
      .andWhere('s.id != :id', { id: currentSupplierId })
      .getCount();
    return others > 0; // true = collision detected
  }

  private async writeReviewLog(
    supplierId: string,
    action: string,
    reviewStatus: SupplierReviewStatus,
    ctx: AuditContext,
    comment?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.reviewLogRepo.save(this.reviewLogRepo.create({
      supplierId,
      action,
      reviewStatus,
      operatorUserId: ctx.userId,
      operatorRole: ctx.userRole,
      comment,
      metadata,
    }));
  }
}
