/**
 * 文件：backend/src/modules/supplier/supplier.service.ts
 * 功能：处理供应商创建、查询、更新、挂起恢复与指纹碰撞检查。
 * 交互：被 supplier.controller.ts 调用；使用 supplier.entity.ts 持久化；写入 audit.service.ts 审计日志。
 * 作者：吴川
 */
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { Supplier, SupplierReviewStatus, SupplierStatus } from './supplier.entity';
import { I18nService } from '../../shared/i18n/i18n.service';
import { SupplierDocument } from './supplier-document.entity';
import { SupplierReviewLog } from './supplier-review-log.entity';
import { SupplierInvitation } from './supplier-invitation.entity';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import * as argon2 from 'argon2';
import { AccountType, RegisterSource, User, UserRole, UserStatus } from '../auth/user.entity';
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

type SupplierRelationRole = 'owner' | 'admin' | 'operator';
type SupplierMemberStatus = 'active' | 'suspended';

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
    const region = data.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE;
    const nextSeq = await this.computeNextBusinessSeq(region);
    const businessId = nextBusinessId(nextSeq, region);

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

  /**
   * 计算指定国家代码下下一个 businessId 序号：取该区段当前最大后缀 + 1。
   * 与 repo.count()+1 不同——后者遇历史删除留下的空洞会撞库；此处按 businessId 实际后缀推进，安全。
   */
  private async computeNextBusinessSeq(region: string, em?: EntityManager): Promise<number> {
    const runner = em ?? this.repo.manager;
    const rows = await runner.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(business_id, '-', 3) AS INTEGER)), 0) AS max_seq
       FROM suppliers WHERE business_id LIKE $1`,
      [`S-${region}-%`],
    );
    return Number(rows?.[0]?.max_seq ?? 0) + 1;
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

  /** 生成「批量新增供应商」模板：7 列表头 + 1 行示例。 */
  buildCreateImportTemplate(): Buffer {
    const h = (k: string) => this.i18n.t(`supplierCreateImport.headers.${k}`);
    const e = (k: string) => this.i18n.t(`supplierCreateImport.example.${k}`);
    const rows = [
      [h('legalName'), h('shortName'), h('contactName'), h('contactPhone'), h('contactEmail'), h('taxId'), h('countryCode')],
      [e('legalName'), e('shortName'), e('contactName'), e('contactPhone'), e('contactEmail'), e('taxId'), e('countryCode')],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 24 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, this.safeSheetName(this.i18n.t('supplierCreateImport.sheet')));
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /**
   * 批量新建供应商：逐行独立创建，失败的行不影响成功的行。
   * 防重：法定名称（trim + 不区分大小写）在文件内不可重复，且不可与系统已有供应商同名。
   */
  async bulkCreateSuppliers(buffer: Buffer | undefined, ctx: AuditContext) {
    if (!buffer?.length) throw new BadRequestException('error.tender.import_file_required');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException('error.tender.import_empty_workbook');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length < 2) throw new BadRequestException('error.tender.import_requires_header_and_rows');

    type ImportError = { row: number; value: string; reason: string };
    const errors: ImportError[] = [];
    const seenNames = new Set<string>();
    type Candidate = {
      rowNo: number; legalName: string; shortName?: string;
      contactName?: string; contactPhone?: string; contactEmail?: string;
      taxId?: string; countryCode: string;
    };
    const candidates: Candidate[] = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let nonEmptyRows = 0;

    rows.slice(1).forEach((raw, idx) => {
      const rowNo = idx + 2;
      const cells = raw as unknown[];
      const legalName = String(cells[0] ?? '').trim();
      const shortName = String(cells[1] ?? '').trim();
      const contactName = String(cells[2] ?? '').trim();
      const contactPhone = String(cells[3] ?? '').trim();
      const contactEmail = String(cells[4] ?? '').trim();
      const taxId = String(cells[5] ?? '').trim();
      let countryCode = String(cells[6] ?? '').trim().toUpperCase();

      // 整行空 → 安静跳过
      if (!legalName && !shortName && !contactName && !contactPhone && !contactEmail && !taxId && !countryCode) return;
      nonEmptyRows += 1;

      if (!legalName) {
        errors.push({ row: rowNo, value: '', reason: this.i18n.t('supplierCreateImport.reason.missingName') });
        return;
      }
      const norm = legalName.toLowerCase();
      if (seenNames.has(norm)) {
        errors.push({ row: rowNo, value: legalName, reason: this.i18n.t('supplierCreateImport.reason.duplicateInFile') });
        return;
      }
      seenNames.add(norm);

      if (contactEmail && !emailRe.test(contactEmail)) {
        errors.push({ row: rowNo, value: legalName, reason: this.i18n.t('supplierCreateImport.reason.invalidEmail') });
        return;
      }
      if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) countryCode = '';

      candidates.push({
        rowNo, legalName, shortName, contactName, contactPhone, contactEmail, taxId,
        countryCode: countryCode || DEFAULT_SUPPLIER_COUNTRY_CODE,
      });
    });

    // 批量查询库内已存在的同名供应商
    if (candidates.length) {
      const namesLower = candidates.map((c) => c.legalName.toLowerCase());
      const existing = await this.repo.createQueryBuilder('s')
        .where('LOWER(s.legal_name) IN (:...names)', { names: namesLower })
        .getMany();
      const existSet = new Set(existing.map((e) => (e.legalName ?? '').toLowerCase()));
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const c = candidates[i];
        if (existSet.has(c.legalName.toLowerCase())) {
          errors.push({ row: c.rowNo, value: c.legalName, reason: this.i18n.t('supplierCreateImport.reason.alreadyExists') });
          candidates.splice(i, 1);
        }
      }
    }

    // 逐行独立创建（任一失败不影响其他）
    // 按国家代码取该区段现有 businessId 的最大后缀，避免被历史删除留下的空洞撞库。
    const created: Array<{ id: string; businessId: string; legalName: string }> = [];
    const seqByRegion = new Map<string, number>();
    const regions = Array.from(new Set(candidates.map((c) => c.countryCode)));
    for (const region of regions) {
      const rows = await this.repo.query(
        `SELECT COALESCE(MAX(CAST(SPLIT_PART(business_id, '-', 3) AS INTEGER)), 0) AS max_seq
         FROM suppliers WHERE business_id LIKE $1`,
        [`S-${region}-%`],
      );
      seqByRegion.set(region, Number(rows?.[0]?.max_seq ?? 0));
    }
    for (const c of candidates) {
      try {
        const next = (seqByRegion.get(c.countryCode) ?? 0) + 1;
        seqByRegion.set(c.countryCode, next);
        const businessId = nextBusinessId(next, c.countryCode);
        const supplier = this.repo.create({
          businessId,
          legalName: c.legalName,
          shortName: c.shortName || undefined,
          contactName: c.contactName || undefined,
          contactPhone: c.contactPhone || undefined,
          contactEmail: c.contactEmail || undefined,
          taxId: c.taxId || undefined,
          countryCode: c.countryCode,
          status: SupplierStatus.ACTIVE,
          reviewStatus: SupplierReviewStatus.NOT_SUBMITTED,
        });
        const saved = await this.repo.save(supplier);
        await this.audit.log(ctx, AuditEntityType.SUPPLIER, saved.id, AuditAction.SUPPLIER_CREATE, undefined, {
          businessId, legalName: c.legalName, bulk: true,
        });
        created.push({ id: saved.id, businessId, legalName: c.legalName });
      } catch (err) {
        errors.push({ row: c.rowNo, value: c.legalName, reason: (err as Error).message });
      }
    }

    return { created, errors, total: nonEmptyRows };
  }

  /** 生成「供应商账号批量导入」模板：6 列表头 + 1 行示例。 */
  buildAccountImportTemplate(): Buffer {
    const h = (k: string) => this.i18n.t(`supplierAccountImport.headers.${k}`);
    const e = (k: string) => this.i18n.t(`supplierAccountImport.example.${k}`);
    const rows = [
      [h('businessId'), h('email'), h('password'), h('displayName'), h('phone'), h('locale')],
      [e('businessId'), e('email'), e('password'), e('displayName'), e('phone'), e('locale')],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, this.safeSheetName(this.i18n.t('supplierAccountImport.sheet')));
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /**
   * 批量导入供应商账号：每行一个登录账号，关联到对应供应商。
   * 逐行独立事务（User + SupplierAccount 同时建），失败的行不影响成功的行。
   * 同一供应商可多个账号（首个建的若该供应商尚无账号，则标 isPrimary=true）。
   */
  async bulkImportSupplierAccounts(buffer: Buffer | undefined, ctx: AuditContext) {
    if (!buffer?.length) throw new BadRequestException('error.tender.import_file_required');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException('error.tender.import_empty_workbook');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length < 2) throw new BadRequestException('error.tender.import_requires_header_and_rows');

    type ImportError = { row: number; value: string; reason: string };
    const errors: ImportError[] = [];
    const seenEmails = new Set<string>();
    const VALID_LOCALES = new Set(['zh-CN', 'en', 'id-ID']);
    const MAX_EMAIL_LENGTH = 100;
    const MAX_DISPLAY_NAME_LENGTH = 100;
    const MAX_PHONE_LENGTH = 30;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let nonEmptyRows = 0;

    type Candidate = {
      rowNo: number; businessId: string; email: string; password: string;
      displayName: string; phone: string; locale: string;
    };
    const candidates: Candidate[] = [];

    rows.slice(1).forEach((raw, idx) => {
      const rowNo = idx + 2;
      const cells = raw as unknown[];
      const businessId = String(cells[0] ?? '').trim().toUpperCase();
      const email = String(cells[1] ?? '').trim().toLowerCase();
      const password = String(cells[2] ?? '');
      const displayName = String(cells[3] ?? '').trim();
      const phone = String(cells[4] ?? '').trim();
      let locale = String(cells[5] ?? '').trim();

      if (!businessId && !email && !password && !displayName && !phone && !locale) return;
      nonEmptyRows += 1;

      const value = email || businessId || `row-${rowNo}`;
      if (!businessId) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.missingBusinessId') });
        return;
      }
      if (!email) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.missingEmail') });
        return;
      }
      if (email.length > MAX_EMAIL_LENGTH) {
        errors.push({ row: rowNo, value: email, reason: this.i18n.t('supplierAccountImport.reason.emailTooLong') });
        return;
      }
      if (!emailRe.test(email)) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.invalidEmail') });
        return;
      }
      if (!password) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.missingPassword') });
        return;
      }
      if (password.length < 6) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.weakPassword') });
        return;
      }
      if (seenEmails.has(email)) {
        errors.push({ row: rowNo, value, reason: this.i18n.t('supplierAccountImport.reason.duplicateInFile') });
        return;
      }
      if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        errors.push({ row: rowNo, value: displayName, reason: this.i18n.t('supplierAccountImport.reason.displayNameTooLong') });
        return;
      }
      if (phone.length > MAX_PHONE_LENGTH) {
        errors.push({ row: rowNo, value: phone, reason: this.i18n.t('supplierAccountImport.reason.phoneTooLong') });
        return;
      }
      seenEmails.add(email);
      if (locale && !VALID_LOCALES.has(locale)) locale = '';

      candidates.push({
        rowNo, businessId, email, password,
        displayName: displayName || email.split('@')[0],
        phone, locale: locale || 'zh-CN',
      });
    });

    // 批量预查：邮箱已存在 / 供应商不存在 / 供应商非正常状态
    if (candidates.length) {
      const emails = candidates.map((c) => c.email);
      const businessIds = Array.from(new Set(candidates.map((c) => c.businessId)));
      const [existingUsers, suppliers] = await Promise.all([
        this.userRepo.find({ where: [{ email: In(emails) }, { loginName: In(emails) }] }),
        this.repo.find({ where: { businessId: In(businessIds) } }),
      ]);
      const existEmails = new Set([
        ...existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean),
        ...existingUsers.map((u) => u.loginName?.toLowerCase()).filter(Boolean),
      ] as string[]);
      const supplierMap = new Map(suppliers.map((s) => [s.businessId.toUpperCase(), s]));

      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const c = candidates[i];
        if (existEmails.has(c.email)) {
          errors.push({ row: c.rowNo, value: c.email, reason: this.i18n.t('supplierAccountImport.reason.emailExists') });
          candidates.splice(i, 1);
          continue;
        }
        const supplier = supplierMap.get(c.businessId);
        if (!supplier) {
          errors.push({ row: c.rowNo, value: c.businessId, reason: this.i18n.t('supplierAccountImport.reason.supplierNotFound') });
          candidates.splice(i, 1);
          continue;
        }
        if (supplier.status !== SupplierStatus.ACTIVE) {
          errors.push({ row: c.rowNo, value: c.businessId, reason: this.i18n.t('supplierAccountImport.reason.supplierNotEligible') });
          candidates.splice(i, 1);
        }
      }
    }

    // 逐行事务创建：User + SupplierAccount。首个账号若该供应商尚无 active 主账号则 isPrimary=true。
    const created: Array<{ id: string; email: string; supplierBusinessId: string }> = [];
    const supplierPrimaryKnown = new Map<string, boolean>();

    for (const c of candidates) {
      try {
        const result = await this.ds.transaction(async (em) => {
          // 同一批内重复邮箱由 seenEmails 防护；并发并行写时靠 DB 唯一索引兜底
          const passwordHash = await argon2.hash(c.password);
          const user = await em.save(em.create(User, {
            email: c.email,
            loginName: c.email,
            phone: c.phone || undefined,
            passwordHash,
            accountType: AccountType.SUPPLIER_ACCOUNT,
            registerSource: RegisterSource.INTERNAL_CREATED,
            tokenVersion: 0,
            role: UserRole.SUPPLIER,
            displayName: c.displayName,
            locale: c.locale,
            status: UserStatus.ACTIVE,
          }));

          const supplier = (await em.findOne(Supplier, { where: { businessId: c.businessId } }))!;
          let hasPrimary = supplierPrimaryKnown.get(supplier.id);
          if (hasPrimary === undefined) {
            const existingPrimary = await em.findOne(SupplierAccount, {
              where: { supplierId: supplier.id, status: 'active', isPrimary: true },
            });
            hasPrimary = Boolean(existingPrimary);
          }
          const isPrimary = !hasPrimary;
          supplierPrimaryKnown.set(supplier.id, true);

          await em.save(em.create(SupplierAccount, {
            authUserId: user.id,
            supplierId: supplier.id,
            displayName: c.displayName,
            isPrimary,
            relationRole: isPrimary ? 'owner' : 'operator',
            status: 'active',
            createdByUserId: ctx.userId,
          }));
          await em.update(User, user.id, { supplierId: supplier.id });
          await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.USER_CREATE, undefined, {
            email: c.email, supplierId: supplier.id, source: 'bulk_import',
          });
          return { id: user.id, email: c.email, supplierBusinessId: supplier.businessId };
        });
        created.push(result);
      } catch (err) {
        errors.push({ row: c.rowNo, value: c.email, reason: (err as Error).message });
      }
    }

    return { created, errors, total: nonEmptyRows };
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

  async listMembers(supplierId: string, page = 1, limit = 10) {
    await this.findById(supplierId);
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const qb = this.supplierAccountRepo.createQueryBuilder('account')
      .innerJoin(User, 'user', 'user.id = account.auth_user_id')
      .where('account.supplier_id = :supplierId', { supplierId })
      .orderBy('account.is_primary', 'DESC')
      .addOrderBy('account.created_at', 'ASC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select([
        'account.id AS "id"',
        'account.auth_user_id AS "authUserId"',
        'account.supplier_id AS "supplierId"',
        'account.display_name AS "relationDisplayName"',
        'account.is_primary AS "isPrimary"',
        'account.relation_role AS "relationRole"',
        'account.status AS "relationStatus"',
        'account.created_at AS "createdAt"',
        'account.updated_at AS "updatedAt"',
        'user.email AS "email"',
        'user.login_name AS "loginName"',
        'user.display_name AS "displayName"',
        'user.phone AS "phone"',
        'user.status AS "userStatus"',
        'user.register_source AS "registerSource"',
        'user.locale AS "locale"',
        'user.supplier_id AS "userSupplierId"',
      ]);
    const [rows, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        authUserId: row.authUserId,
        supplierId: row.supplierId,
        email: row.email,
        loginName: row.loginName,
        displayName: row.displayName,
        relationDisplayName: row.relationDisplayName,
        phone: row.phone,
        userStatus: row.userStatus,
        registerSource: row.registerSource,
        locale: row.locale,
        relationRole: row.relationRole,
        isPrimary: row.isPrimary,
        status: row.relationStatus,
        userSupplierMatches: row.userSupplierId === supplierId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async ensureCanManageSupplierMembers(supplierId: string, authUserId: string) {
    const relation = await this.supplierAccountRepo.findOne({
      where: { supplierId, authUserId, status: 'active' },
    });
    if (!relation || !['owner', 'admin'].includes(relation.relationRole)) {
      throw new ForbiddenException('error.supplier.member_manage_forbidden');
    }
    return relation;
  }

  async updateMember(
    supplierId: string,
    memberId: string,
    data: {
      relationRole?: SupplierRelationRole;
      status?: SupplierMemberStatus;
      isPrimary?: boolean;
      displayName?: string;
    },
    ctx: AuditContext,
  ) {
    await this.findById(supplierId);
    const member = await this.supplierAccountRepo.findOne({ where: { id: memberId, supplierId } });
    if (!member) throw new NotFoundException('error.supplier.member_not_found');

    if (data.relationRole && !['owner', 'admin', 'operator'].includes(data.relationRole)) {
      throw new BadRequestException('error.supplier.member_role_invalid');
    }
    if (data.status && !['active', 'suspended'].includes(data.status)) {
      throw new BadRequestException('error.supplier.member_status_invalid');
    }

    const activeCount = await this.supplierAccountRepo.count({ where: { supplierId, status: 'active' } });
    if (member.status === 'active' && data.status === 'suspended' && activeCount <= 1) {
      throw new BadRequestException('error.supplier.member_last_active');
    }
    if (member.isPrimary && data.status === 'suspended') {
      throw new BadRequestException('error.supplier.member_primary_cannot_suspend');
    }
    if (member.isPrimary && data.isPrimary === false) {
      throw new BadRequestException('error.supplier.member_primary_required');
    }

    const before = { ...member };
    const updated = await this.ds.transaction(async (em) => {
      if (data.isPrimary === true && !member.isPrimary) {
        await em.update(SupplierAccount, { supplierId }, { isPrimary: false });
        member.isPrimary = true;
        member.status = 'active';
      }
      if (data.relationRole) member.relationRole = data.relationRole;
      if (data.status) member.status = data.status;
      if (data.displayName !== undefined) member.displayName = data.displayName;
      await em.save(member);
      await em.update(User, member.authUserId, { supplierId });
      return em.findOne(SupplierAccount, { where: { id: member.id } });
    });

    await this.audit.log(
      ctx,
      AuditEntityType.USER,
      member.authUserId,
      AuditAction.USER_UPDATE,
      before as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      { supplierId, source: 'supplier_member_update' },
    );
    return updated;
  }

  async resetMemberPassword(
    supplierId: string,
    memberId: string,
    password: string,
    ctx: AuditContext,
  ) {
    if (!password || password.length < 6) throw new BadRequestException('error.supplier.member_password_weak');
    await this.findById(supplierId);
    const member = await this.supplierAccountRepo.findOne({ where: { id: memberId, supplierId } });
    if (!member) throw new NotFoundException('error.supplier.member_not_found');

    const user = await this.userRepo.findOne({ where: { id: member.authUserId } });
    if (!user || user.accountType !== AccountType.SUPPLIER_ACCOUNT) {
      throw new NotFoundException('error.supplier.member_not_found');
    }
    await this.userRepo.update(user.id, {
      passwordHash: await argon2.hash(password),
      tokenVersion: user.tokenVersion + 1,
    });
    await this.audit.log(
      ctx,
      AuditEntityType.USER,
      user.id,
      AuditAction.USER_UPDATE,
      undefined,
      { passwordReset: true },
      { supplierId, source: 'supplier_member_password_reset' },
    );
    return { updated: true };
  }

  async createCompanyForAccount(authUserId: string, data: Partial<Supplier>, ctx: AuditContext) {
    const existingRelation = await this.supplierAccountRepo.findOne({ where: { authUserId, status: 'active' } });
    if (existingRelation) throw new BadRequestException('error.supplier.company_already_bound');
    if (!data.legalName || !data.shortName) throw new BadRequestException('error.supplier.company_required');

    const result = await this.ds.transaction(async (em) => {
      const countryCode = data.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE;
      const nextSeq = await this.computeNextBusinessSeq(countryCode, em);
      const businessId = nextBusinessId(nextSeq, countryCode);
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
      const countryCode = payload.countryCode ?? DEFAULT_SUPPLIER_COUNTRY_CODE;
      const nextSeq = await this.computeNextBusinessSeq(countryCode, em);
      const businessId = nextBusinessId(nextSeq, countryCode);
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
