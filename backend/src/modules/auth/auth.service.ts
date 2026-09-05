/**
 * 文件：backend/src/modules/auth/auth.service.ts
 * 功能：处理登录、OTP 校验、JWT 能力映射与用户创建，是认证域的核心服务。
 * 交互：被 auth.controller.ts 调用；依赖 user.entity.ts 持久化用户，依赖 audit.service.ts 记录安全审计；由 jwt.strategy.ts 复用 JwtPayload。
 * 作者：吴川
 */
import {
  BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  AccountType, RegisterSource, User, UserRole, UserStatus,
} from './user.entity';
import { CompanyUser } from './company-user.entity';
import { SupplierAccount } from './supplier-account.entity';
import { Supplier, SupplierReviewStatus, SupplierStatus } from '../supplier/supplier.entity';
import { Branch, BranchStatus, BranchType } from '../organization/branch.entity';
import {
  BranchMember, BranchMemberRole, BranchMemberStatus,
} from '../organization/branch-member.entity';
import { BranchContextService } from '../organization/branch-context.service';
import { BranchScope } from '../../shared/tenant/branch-scope';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import { scopesForAccount } from '../../shared/rbac/scope-map';
import { RedisService } from '../../shared/config/redis.config';
import { MailService } from '../../shared/mail/mail.service';
import { buildVerificationCodeEmail } from '../../shared/mail/templates/verification-code.template';

export interface JwtPayload {
  sub: string;
  accountType: AccountType;
  /**
   * 当前登录主体的身份 ID：供应商账号为 supplier.id，公司用户为 company_user.id。
   * 注意：这不是「机构 / 组织」ID —— 多机构改造时机构 ID 会以独立的 branchId 字段引入，切勿复用本字段。
   */
  principalId: string;
  scope: string[];
  tokenVersion: number;
  role?: UserRole;
  email?: string;
  supplierId?: string;

  // ── 多机构字段（Phase 3 起写入，尚无消费方）─────────────────────────────
  // 均为可选：存量 Token 不含这些字段仍可正常校验，发布期间不会把在线用户踢下线。
  /** 当前激活机构。切换机构须重新签发 Token —— 绝不接受客户端通过 Header/Query 指定机构。 */
  activeBranchId?: string;
  /** 机构内角色，与全局 users.role 解耦 */
  branchRole?: BranchMemberRole;
  /** 是否总部成员。总部的可访问机构范围不入 Token，每次请求在服务端解析。 */
  isHq?: boolean;

  /**
   * 令牌用途。branch_selection 表示这是一枚只能用于"选择机构"的受限令牌：
   * 多机构用户登录后尚未确定进入哪个机构，此时不能发放正式令牌 ——
   * 正式令牌即便机构作用域为空，也仍能访问那些尚未接入机构隔离的接口。
   * jwt.strategy.ts 对该用途的令牌一律拒绝，选择机构的接口自行校验它。
   */
  purpose?: 'branch_selection';
}

/** 选择机构令牌的有效期。仅用于完成登录，无需长时有效。 */
const BRANCH_SELECTION_TOKEN_TTL = '10m';

const REGISTER_EMAIL_CODE_PREFIX = 'auth:supplier-register:email-code';
const REGISTER_EMAIL_REQUEST_PREFIX = 'auth:supplier-register:email-code-request';
const REGISTER_EMAIL_COOLDOWN_PREFIX = 'auth:supplier-register:email-code-cooldown';
const REGISTER_EMAIL_FAIL_PREFIX = 'auth:supplier-register:email-code-fail';
const PASSWORD_RESET_TOKEN_PREFIX = 'auth:password-reset:token';
const PASSWORD_RESET_COOLDOWN_PREFIX = 'auth:password-reset:cooldown';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(CompanyUser) private readonly companyUserRepo: Repository<CompanyUser>,
    @InjectRepository(SupplierAccount) private readonly supplierAccountRepo: Repository<SupplierAccount>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    private readonly ds: DataSource,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly branchContext: BranchContextService,
  ) {}

  async login(loginName: string, password: string, ctx: AuditContext) {
    const user = await this.userRepo.findOne({
      where: [
        { loginName },
        { email: loginName },
      ],
    });
    if (!user) throw new UnauthorizedException('error.auth.invalid_credentials');
    if (user.status === UserStatus.SUSPENDED) throw new ForbiddenException('error.auth.suspended');

    const userAuditCtx: AuditContext = {
      ...ctx,
      userId: user.id,
      userRole: user.role,
    };

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.audit.log(userAuditCtx, AuditEntityType.USER, user.id, AuditAction.OTP_FAIL);
      throw new UnauthorizedException('error.auth.invalid_credentials');
    }

    await this.userRepo.update(user.id, {
      otpCode: undefined,
      otpExpiresAt: undefined,
      otpFailCount: 0,
      loginName: user.loginName ?? user.email,
    });
    await this.audit.log(userAuditCtx, AuditEntityType.USER, user.id, AuditAction.LOGIN);

    return this.issueSession(user);
  }

  async verifyOtp(userId: string, otp: string, ctx: AuditContext) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    if (!user.otpCode || !user.otpExpiresAt) throw new BadRequestException('error.auth.otp_not_requested');
    if (new Date() > user.otpExpiresAt) throw new BadRequestException('error.auth.otp_expired');
    if (user.otpCode !== otp) {
      await this.userRepo.update(user.id, { otpFailCount: () => 'otp_fail_count + 1' });
      await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.OTP_FAIL);
      throw new UnauthorizedException('error.auth.otp_invalid');
    }

    await this.userRepo.update(user.id, { otpCode: undefined, otpExpiresAt: undefined, otpFailCount: 0 });
    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.LOGIN);

    return this.issueSession(user);
  }

  /**
   * 登出即失效：自增 token_version 让该用户已签发的 JWT 立即作废。
   * 用 SQL 自增而非读改写，避免并发登出时版本号被覆盖。
   */
  async logout(user: User, ctx: AuditContext) {
    await this.userRepo.update(user.id, { tokenVersion: () => 'token_version + 1' });
    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.LOGOUT);
    return { loggedOut: true };
  }

  getCapabilities(user: Pick<User, 'role' | 'accountType'>) {
    return scopesForAccount(user);
  }

  async sendSupplierRegisterEmailCode(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const existing = await this.userRepo.findOne({
      where: [
        { email: normalizedEmail },
        { loginName: normalizedEmail },
      ],
    });
    if (existing) throw new BadRequestException('error.auth.email_exists');

    const cooldownSeconds = this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS', 60);
    const cooldownKey = `${REGISTER_EMAIL_COOLDOWN_PREFIX}:${normalizedEmail}`;
    const allowed = await this.redis.setnx(cooldownKey, '1', cooldownSeconds);
    if (!allowed) throw new BadRequestException('error.auth.email_code_too_frequent');

    const length = this.config.get<number>('OTP_LENGTH', 6);
    const ttlSeconds = this.config.get<number>('OTP_EXPIRES_SECONDS', 300);
    const code = this.generateNumericCode(length);
    await this.redis.set(
      `${REGISTER_EMAIL_CODE_PREFIX}:${normalizedEmail}`,
      this.hashVerificationCode(normalizedEmail, code),
      ttlSeconds,
    );
    await this.redis.set(`${REGISTER_EMAIL_REQUEST_PREFIX}:${normalizedEmail}`, '1', ttlSeconds + 86400);
    await this.redis.del(`${REGISTER_EMAIL_FAIL_PREFIX}:${normalizedEmail}`);
    // Explicitly opt in on local development only. Never expose codes in API responses or production logs.
    if (this.config.get<string>('NODE_ENV') === 'development'
      && this.config.get<string>('SUPPLIER_REGISTER_EMAIL_MODE') === 'console') {
      this.logger.log(`[DEV ONLY][supplier-register] email=${normalizedEmail} code=${code} expiresIn=${ttlSeconds}s (SMTP skipped)`);
    } else {
      await this.mail.send(buildVerificationCodeEmail({
        to: normalizedEmail,
        code,
        expiresInMinutes: Math.floor(ttlSeconds / 60),
        productName: 'BidFlow',
      }));
    }

    return { sent: true, expiresIn: ttlSeconds, resendIn: cooldownSeconds };
  }

  async createUser(data: {
    email: string;
    password: string;
    role: UserRole;
    displayName: string;
    supplierId?: string;
    employeeId?: string;
    registerSource?: RegisterSource;
  }) {
    const existing = await this.userRepo.findOne({ where: { email: data.email } });
    if (existing) throw new BadRequestException('error.auth.email_exists');

    const passwordHash = await argon2.hash(data.password);
    const user = this.userRepo.create({
      email: data.email,
      loginName: data.email,
      passwordHash,
      accountType: data.supplierId ? AccountType.SUPPLIER_ACCOUNT : AccountType.COMPANY_USER,
      registerSource: data.registerSource ?? (data.supplierId ? RegisterSource.EXTERNAL_SIGNUP : RegisterSource.INTERNAL_CREATED),
      tokenVersion: 0,
      role: data.role,
      displayName: data.displayName,
      employeeId: data.employeeId,
      supplierId: data.supplierId,
      status: UserStatus.ACTIVE,
    });
    return this.userRepo.save(user);
  }

  /**
   * 列出公司内部账号。
   *
   * 必须按机构过滤：账号本身虽是全局的，但「谁在这个机构工作」属于该机构的组织信息，
   * 印尼的管理员不应看到越南的员工名单。
   * 通过 branch_members 内联实现 —— 与供应商一样，隔离依据是成员关系而非用户表上的列。
   */
  async listCompanyUsers(scope: BranchScope) {
    if (!scope.readable.length) return [];

    const rows = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin(BranchMember, 'm', 'm.auth_user_id = u.id AND m.status = :active', { active: BranchMemberStatus.ACTIVE })
      .where('u.account_type = :type', { type: AccountType.COMPANY_USER })
      .andWhere('m.branch_id IN (:...scope)', { scope: [...scope.readable] })
      .select('u.id', 'id')
      .distinct(true)
      .getRawMany<{ id: string }>();

    const users = rows.length
      ? await this.userRepo.find({ where: { id: In(rows.map((r) => r.id)) }, order: { createdAt: 'DESC' } })
      : [];
    const profiles = await this.companyUserRepo.find();
    const profileMap = new Map(profiles.map((profile) => [profile.authUserId, profile]));

    // 附带机构信息：总部可跨机构查看，必须让它看出每个账号属于哪个机构
    const memberRows = users.length
      ? await this.userRepo.manager.query(
        // 限定在当前作用域内：同一人可能同时是总部与某国机构成员，
        // 若不限定，印尼的列表会把他显示成"越南"，与查看者的视角不符。
        `SELECT m.auth_user_id AS "userId", b.code, b.name, m.role
         FROM branch_members m JOIN branches b ON b.id = m.branch_id
         WHERE m.auth_user_id = ANY($1::uuid[]) AND m.status = 'active'
           AND m.branch_id = ANY($2::uuid[])`,
        [users.map((u) => u.id), [...scope.readable]],
      )
      : [];
    const branchMap = new Map<string, { code: string; name: string; role: string }>(
      memberRows.map((r: any) => [r.userId, { code: r.code, name: r.name, role: r.role }]),
    );

    return users.map((user) => {
      const profile = profileMap.get(user.id);
      return {
        id: user.id,
        email: user.email,
        loginName: user.loginName,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        accountType: user.accountType,
        registerSource: user.registerSource,
        employeeId: profile?.employeeId ?? user.employeeId,
        fullName: profile?.fullName ?? user.displayName,
        companyName: profile?.companyName,
        companyUserId: profile?.id,
        branch: branchMap.get(user.id) ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  /**
   * 创建公司内部账号。
   *
   * branchId 必填：公司用户的数据可见范围完全由机构成员关系决定，
   * 不分配机构的账号登录后看不到任何数据（fail-closed），属于创建即失效的坏账号。
   * 因此机构归属与账号在同一事务内建立，不允许出现"先建人、以后再分配"的中间态。
   */
  async createCompanyUser(data: {
    email: string;
    password: string;
    role: UserRole;
    fullName: string;
    branchId: string;
    employeeId?: string;
    companyName?: string;
  }, ctx: AuditContext) {
    if (data.role === UserRole.SUPPLIER) {
      throw new BadRequestException('error.company_user.role_invalid');
    }
    const existing = await this.userRepo.findOne({
      where: [
        { email: data.email },
        { loginName: data.email },
      ],
    });
    if (existing) throw new BadRequestException('error.auth.email_exists');

    if (data.employeeId) {
      const employeeExists = await this.companyUserRepo.findOne({ where: { employeeId: data.employeeId } });
      if (employeeExists) throw new BadRequestException('error.company_user.employee_id_exists');
    }

    const passwordHash = await argon2.hash(data.password);
    const result = await this.ds.transaction(async (em) => {
      const user = em.create(User, {
        email: data.email,
        loginName: data.email,
        passwordHash,
        accountType: AccountType.COMPANY_USER,
        registerSource: RegisterSource.INTERNAL_CREATED,
        tokenVersion: 0,
        role: data.role,
        displayName: data.fullName,
        employeeId: data.employeeId,
        status: UserStatus.ACTIVE,
      });
      const savedUser = await em.save(user);
      const companyUser = em.create(CompanyUser, {
        authUserId: savedUser.id,
        companyName: data.companyName,
        fullName: data.fullName,
        employeeId: data.employeeId,
        status: 'active',
        createdBy: ctx.userId,
      });
      const savedCompanyUser = await em.save(companyUser);

      // 机构归属与账号同事务建立；机构不存在或已停用时整体回滚，不留下无归属账号
      const branch = await em.findOne(Branch, {
        where: { id: data.branchId, status: BranchStatus.ACTIVE },
      });
      if (!branch) throw new BadRequestException('error.branch.not_found');

      // 角色必须与机构类型匹配：总部只能持总部角色，国家机构不得使用总部角色。
      // 与 organization.service.ts 的 assertRoleFitsBranch 同一约束，此处是建号入口的把关。
      const isHqBranch = branch.type === BranchType.HQ;
      const role = isHqBranch ? BranchMemberRole.HQ_ADMIN : (data.role as unknown as BranchMemberRole);
      await em.save(em.create(BranchMember, {
        branchId: branch.id,
        authUserId: savedUser.id,
        role,
        status: BranchMemberStatus.ACTIVE,
        createdBy: ctx.userId,
      }));

      return { user: savedUser, companyUser: savedCompanyUser, branch };
    });

    await this.audit.log(
      ctx,
      AuditEntityType.USER,
      result.user.id,
      AuditAction.USER_CREATE,
      undefined,
      {
        email: result.user.email,
        role: result.user.role,
        employeeId: result.companyUser.employeeId,
      },
    );

    return {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
      status: result.user.status,
      employeeId: result.companyUser.employeeId,
      fullName: result.companyUser.fullName,
      companyName: result.companyUser.companyName,
    };
  }

  async updateCompanyUser(id: string, data: {
    role?: UserRole;
    status?: UserStatus;
    fullName?: string;
    employeeId?: string;
    companyName?: string;
  }, ctx: AuditContext) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user || user.accountType !== AccountType.COMPANY_USER) {
      throw new BadRequestException('error.company_user.not_found');
    }
    if (data.role === UserRole.SUPPLIER) {
      throw new BadRequestException('error.company_user.role_invalid');
    }
    const profile = await this.companyUserRepo.findOne({ where: { authUserId: id } });
    const beforeState = {
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      employeeId: profile?.employeeId ?? user.employeeId,
      fullName: profile?.fullName,
      companyName: profile?.companyName,
    };

    if (data.employeeId) {
      const employeeExists = await this.companyUserRepo.findOne({ where: { employeeId: data.employeeId } });
      if (employeeExists && employeeExists.authUserId !== id) {
        throw new BadRequestException('error.company_user.employee_id_exists');
      }
    }

    await this.ds.transaction(async (em) => {
      const userPatch: Partial<User> = {};
      if (data.role) userPatch.role = data.role;
      if (data.status) {
        userPatch.status = data.status;
        userPatch.tokenVersion = user.tokenVersion + 1;
      }
      if (data.fullName) userPatch.displayName = data.fullName;
      if (data.employeeId !== undefined) userPatch.employeeId = data.employeeId;
      if (Object.keys(userPatch).length) await em.update(User, id, userPatch);

      const profilePatch: Partial<CompanyUser> = {};
      if (data.fullName) profilePatch.fullName = data.fullName;
      if (data.employeeId !== undefined) profilePatch.employeeId = data.employeeId;
      if (data.companyName !== undefined) profilePatch.companyName = data.companyName;
      if (data.status) profilePatch.status = data.status;
      if (Object.keys(profilePatch).length) await em.update(CompanyUser, { authUserId: id }, profilePatch);
    });

    await this.audit.log(
      ctx,
      AuditEntityType.USER,
      id,
      AuditAction.USER_UPDATE,
      beforeState,
      data as Record<string, unknown>,
    );

    return { updated: true };
  }

  async registerSupplier(data: {
    email: string;
    password: string;
    emailCode: string;
    contactName?: string;
    contactPhone?: string;
  }, ctx: AuditContext) {
    const email = this.normalizeEmail(data.email);
    await this.verifySupplierRegisterEmailCode(email, data.emailCode);
    const existing = await this.userRepo.findOne({
      where: [
        { email },
        { loginName: email },
      ],
    });
    if (existing) throw new BadRequestException('error.auth.email_exists');

    const passwordHash = await argon2.hash(data.password);
    const user = await this.userRepo.save(this.userRepo.create({
      email,
      loginName: email,
      passwordHash,
      accountType: AccountType.SUPPLIER_ACCOUNT,
      registerSource: RegisterSource.EXTERNAL_SIGNUP,
      tokenVersion: 0,
      role: UserRole.SUPPLIER,
      displayName: data.contactName ?? email.split('@')[0],
      phone: data.contactPhone,
      status: UserStatus.ACTIVE,
    }));

    await this.audit.log(
      {
        ...ctx,
        userId: user.id,
        userRole: user.role,
      },
      AuditEntityType.USER,
      user.id,
      AuditAction.USER_CREATE,
      undefined,
      { email: user.email, source: 'external_signup' },
    );

    return {
      userId: user.id,
      needsSupplierBinding: true,
      message: 'supplier_account_registered_bind_company',
    };
  }

  async registerSupplierWithGoogle(credential: string, ctx: AuditContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new BadRequestException('error.auth.google_not_configured');

    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = this.normalizeEmail(payload?.email ?? '');
    if (!email || !payload?.email_verified) throw new UnauthorizedException('error.auth.google_email_unverified');

    let user = await this.userRepo.findOne({
      where: [
        { email },
        { loginName: email },
      ],
    });
    if (user && user.accountType !== AccountType.SUPPLIER_ACCOUNT) {
      throw new BadRequestException('error.auth.email_exists');
    }
    if (user?.status === UserStatus.SUSPENDED) throw new ForbiddenException('error.auth.suspended');

    if (!user) {
      user = await this.userRepo.save(this.userRepo.create({
        email,
        loginName: email,
        passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
        accountType: AccountType.SUPPLIER_ACCOUNT,
        registerSource: RegisterSource.GOOGLE,
        tokenVersion: 0,
        role: UserRole.SUPPLIER,
        displayName: payload.name || email.split('@')[0],
        status: UserStatus.ACTIVE,
      }));
      await this.audit.log(
        {
          ...ctx,
          userId: user.id,
          userRole: user.role,
        },
        AuditEntityType.USER,
        user.id,
        AuditAction.USER_CREATE,
        undefined,
        { email: user.email, source: 'google' },
      );
    }

    await this.audit.log(
      { ...ctx, userId: user.id, userRole: user.role },
      AuditEntityType.USER,
      user.id,
      AuditAction.LOGIN,
      undefined,
      { source: 'google' },
    );
    return this.issueSession(user);
  }

  private async getSupplierRelation(user: User) {
    if (user.supplierId) {
      const relation = await this.supplierAccountRepo.findOne({
        where: { authUserId: user.id, supplierId: user.supplierId, status: 'active' },
      });
      const supplier = await this.supplierRepo.findOne({ where: { id: user.supplierId } });
      if (supplier) return { relation, supplier };
    }

    const relations = await this.supplierAccountRepo.find({
      where: { authUserId: user.id, status: 'active' },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    const relation = relations[0];
    if (!relation) return {};
    const supplier = await this.supplierRepo.findOne({ where: { id: relation.supplierId } });
    return { relation, supplier };
  }

  async buildProfile(user: User) {
    const safeUser = this.sanitize(user);
    if (user.accountType === AccountType.SUPPLIER_ACCOUNT) {
      const { relation, supplier } = await this.getSupplierRelation(user);
      if (!supplier) {
        return {
          principalId: 'unbound-supplier-account',
          redirect: '/supplier/profile',
          scopes: [],
          user: {
            ...safeUser,
            supplierId: undefined,
            supplierAccountId: undefined,
            supplierStatus: undefined,
            supplierReviewStatus: undefined,
            supplierRelationRole: undefined,
            needsSupplierBinding: true,
          },
        };
      }
      return {
        principalId: supplier.id,
        redirect: '/hall',
        scopes: this.getCapabilities(user),
        user: {
          ...safeUser,
          supplierId: supplier.id,
          supplierName: supplier.legalName || supplier.shortName || supplier.businessId,
          supplierAccountId: relation?.id,
          supplierStatus: supplier?.status ?? SupplierStatus.ACTIVE,
          supplierReviewStatus: supplier?.reviewStatus ?? SupplierReviewStatus.NOT_SUBMITTED,
          supplierRelationRole: relation?.relationRole,
          isPrimarySupplierAccount: relation?.isPrimary ?? false,
          needsSupplierBinding: false,
        },
      };
    }

    const companyUser = await this.companyUserRepo.findOne({ where: { authUserId: user.id } });
    return {
      principalId: companyUser?.id ?? 'internal-company',
      redirect: '/hall',
      scopes: this.getCapabilities(user),
      user: {
        ...safeUser,
        companyUserId: companyUser?.id,
        employeeId: companyUser?.employeeId ?? safeUser.employeeId,
        fullName: companyUser?.fullName ?? safeUser.displayName,
      },
    };
  }

  private sanitize(user: User) {
    const { passwordHash, otpCode, otpExpiresAt, ...safe } = user;
    return safe;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private generateNumericCode(length: number) {
    const digits = Math.max(4, Math.min(10, length));
    const max = 10 ** digits;
    return randomInt(0, max).toString().padStart(digits, '0');
  }

  private hashVerificationCode(email: string, code: string) {
    const secret = this.config.get<string>('JWT_SECRET', 'bidflow');
    return createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');
  }

  private async verifySupplierRegisterEmailCode(email: string, code: string) {
    const key = `${REGISTER_EMAIL_CODE_PREFIX}:${email}`;
    const expected = await this.redis.get(key);
    if (!expected) {
      const requested = await this.redis.exists(`${REGISTER_EMAIL_REQUEST_PREFIX}:${email}`);
      if (requested) throw new BadRequestException('error.auth.otp_expired');
      throw new BadRequestException('error.auth.otp_not_requested');
    }

    const submitted = this.hashVerificationCode(email, code);
    if (submitted !== expected) {
      const failKey = `${REGISTER_EMAIL_FAIL_PREFIX}:${email}`;
      const failCount = await this.redis.incr(failKey);
      if (failCount === 1) await this.redis.expire(failKey, this.config.get<number>('OTP_EXPIRES_SECONDS', 300));
      if (failCount >= 5) {
        await this.redis.del(key);
        throw new BadRequestException('error.auth.email_code_too_many_attempts');
      }
      throw new UnauthorizedException('error.auth.otp_invalid');
    }

    await this.redis.del(key);
    await this.redis.del(`${REGISTER_EMAIL_REQUEST_PREFIX}:${email}`);
    await this.redis.del(`${REGISTER_EMAIL_FAIL_PREFIX}:${email}`);
  }

  /**
   * 决定登录后进入哪个机构。
   * - 单机构：直接进入
   * - 多机构且上次选择仍有效：沿用上次选择
   * - 多机构且上次选择无效（从未选过 / 机构停用 / 已被移出）：回到选择页，不替用户挑一个
   */
  private resolveEntryBranch(branches: { branchId: string }[], lastBranchId?: string) {
    if (branches.length <= 1) return { branchId: branches[0]?.branchId, needsSelection: false };
    const remembered = branches.find((b) => b.branchId === lastBranchId);
    if (remembered) return { branchId: remembered.branchId, needsSelection: false };
    return { branchId: undefined, needsSelection: true };
  }

  /** 签发只能用于选择机构的受限令牌 */
  private issueBranchSelectionToken(user: User) {
    return this.jwt.sign(
      { sub: user.id, tokenVersion: user.tokenVersion, purpose: 'branch_selection' } as JwtPayload,
      { expiresIn: BRANCH_SELECTION_TOKEN_TTL },
    );
  }

  private async issueSession(user: User, preferredBranchId?: string) {
    const profile = await this.buildProfile(user);

    // 先按"可访问哪些机构"解析一次，用于判断是否需要用户选择
    const available = await this.branchContext.resolve(
      user.id,
      preferredBranchId,
      profile.user.supplierId,
    );

    // 未显式指定目标机构时，按"单机构直进 / 记住上次 / 否则让用户选"决定入口。
    // 公司用户与供应商账号走同一套规则：跨境供应商同样可能在多个机构有准入档案。
    const entry = preferredBranchId
      ? { branchId: preferredBranchId, needsSelection: false }
      : this.resolveEntryBranch(available.branches, user.lastBranchId);

    if (entry.needsSelection) {
      return {
        requiresBranchSelection: true as const,
        selectionToken: this.issueBranchSelectionToken(user),
        branches: available.branches,
      };
    }

    const branch = entry.branchId === available.activeBranchId
      ? available
      : await this.branchContext.resolve(user.id, entry.branchId, profile.user.supplierId);

    // 记住本次入口，下次登录直接进入
    if (branch.activeBranchId && branch.activeBranchId !== user.lastBranchId) {
      await this.userRepo.update(user.id, { lastBranchId: branch.activeBranchId });
    }

    const payload: JwtPayload = {
      sub: user.id,
      accountType: user.accountType,
      principalId: profile.principalId,
      scope: profile.scopes,
      tokenVersion: user.tokenVersion,
      role: user.role,
      email: user.email,
      supplierId: profile.user.supplierId,
      activeBranchId: branch.activeBranchId,
      branchRole: branch.activeRole,
      isHq: branch.isHq,
    };
    const token = this.jwt.sign(payload);
    return {
      accessToken: token,
      accountType: user.accountType,
      redirect: profile.redirect,
      scopes: profile.scopes,
      user: profile.user,
      // 供前端机构切换器使用；单机构用户长度为 1，前端不展示切换入口。
      branches: branch.branches,
      activeBranchId: branch.activeBranchId,
    };
  }

  /**
   * 切换当前激活机构，重新签发 Token。
   *
   * 机构只能来自签名的 Token —— 若允许客户端通过请求头或参数指定机构，
   * 改一个值就能读到别国数据。因此切换必须走这里：校验归属后重新签发。
   * 归属校验在 BranchContextService.resolve 内完成，不在归属范围内的 branchId 会被忽略而非报错，
   * 但这里显式校验以给出明确反馈，避免用户以为切换成功却仍停留在原机构。
   */
  /**
   * 用登录时下发的受限令牌完成机构选择，换取正式会话。
   * 该接口不走 JWT 守卫 —— 守卫会拒绝受限令牌，因此在此自行校验其签名与用途。
   */
  async selectBranch(selectionToken: string, branchId: string, ctx: AuditContext) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(selectionToken);
    } catch {
      throw new UnauthorizedException('error.auth.token_invalid');
    }
    if (payload.purpose !== 'branch_selection') throw new UnauthorizedException('error.auth.token_invalid');

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('error.auth.token_invalid');
    // 受限令牌同样受版本控制：期间若发生登出或撤权，该令牌一并失效
    if (user.tokenVersion !== payload.tokenVersion) throw new UnauthorizedException('error.auth.token_invalid');

    const profile = await this.buildProfile(user);
    const context = await this.branchContext.resolve(user.id, branchId, profile.user.supplierId);
    if (!context.branches.some((b) => b.branchId === branchId)) {
      throw new ForbiddenException('error.branch.not_accessible');
    }

    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.LOGIN, undefined, {
      selectedBranch: context.branches.find((b) => b.branchId === branchId)?.branchCode,
    });
    return this.issueSession(user, branchId);
  }

  async switchBranch(user: User, branchId: string, ctx: AuditContext) {
    const profile = await this.buildProfile(user);
    const context = await this.branchContext.resolve(user.id, branchId, profile.user.supplierId);
    const target = context.branches.find((b) => b.branchId === branchId);
    if (!target) throw new ForbiddenException('error.branch.not_accessible');

    // 终止原机构会话：自增 token_version 让此前签发的全部 Token 立即失效。
    // 不做这一步的话，切换只是"多拿了一个新 Token"，旧 Token 仍能读原机构数据 ——
    // 同一账号会同时持有多个机构的有效会话，与"登录后机构唯一"的语义相悖，
    // 旧 Token 一旦泄漏或残留在其他标签页/设备上，就是一条绕过机构隔离的通路。
    await this.userRepo.update(user.id, { tokenVersion: () => 'token_version + 1' });
    // 重新读取以拿到自增后的版本号，否则新 Token 会带着旧版本号，签发即失效
    const refreshed = await this.userRepo.findOneOrFail({ where: { id: user.id } });

    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.LOGIN, undefined, {
      switchedToBranch: target.branchCode,
      previousSessionRevoked: true,
    });
    // issueSession 内部会把本次机构写入 last_branch_id，下次登录直接进入这里
    return this.issueSession(refreshed, branchId);
  }

  async requestPasswordReset(email: string, ctx: AuditContext) {
    const normalizedEmail = this.normalizeEmail(email);

    const user = await this.userRepo.findOne({
      where: [{ email: normalizedEmail }, { loginName: normalizedEmail }],
    });
    if (!user) throw new BadRequestException('error.auth.email_not_found');

    const cooldownSeconds = this.config.get<number>('PASSWORD_RESET_COOLDOWN_SECONDS', 60);
    const cooldownKey = `${PASSWORD_RESET_COOLDOWN_PREFIX}:${normalizedEmail}`;
    const allowed = await this.redis.setnx(cooldownKey, '1', cooldownSeconds);
    if (!allowed) throw new BadRequestException('error.auth.password_reset_too_frequent');

    const ttlSeconds = this.config.get<number>('PASSWORD_RESET_EXPIRES_SECONDS', 3600);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // 只存哈希，明文 token 仅出现在邮件里，避免 Redis 被读取后可直接改密。
    await this.redis.set(
      `${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`,
      JSON.stringify({ userId: user.id, email: normalizedEmail }),
      ttlSeconds,
    );

    const resetUrl = this.config.get<string>('PASSWORD_RESET_URL', 'http://localhost:5180/reset-password');
    const resetLink = `${resetUrl}?token=${token}`;

    await this.mail.send({
      to: normalizedEmail,
      subject: '[BidFlow] 重置密码',
      text: `点击下面的链接重置你的密码（有效期1小时）:\n\n${resetLink}\n\n如果你没有请求重置密码，请忽略此邮件。`,
      html: `<p>点击下面的链接重置你的密码（有效期1小时）:</p><p><a href="${resetLink}">${resetLink}</a></p><p>如果你没有请求重置密码，请忽略此邮件。</p>`,
    });

    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.PASSWORD_RESET_REQUESTED, undefined, { email: normalizedEmail });

    return { message: 'password_reset_email_sent' };
  }

  async confirmPasswordReset(token: string, newPassword: string, ctx: AuditContext) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const stored = await this.redis.get(`${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`);
    if (!stored) throw new BadRequestException('error.auth.password_reset_token_invalid');

    const { userId } = JSON.parse(stored);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('error.auth.user_not_found');

    // 改密与 token_version 自增放在一次 update：只写这两列，避免 save(entity) 整行回写覆盖并发修改。
    await this.userRepo.update(user.id, {
      passwordHash: await argon2.hash(newPassword),
      tokenVersion: () => 'token_version + 1',
    });

    await this.redis.del(`${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`);
    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.PASSWORD_RESET_CONFIRMED, undefined, { email: user.email });

    return { message: 'password_reset_success' };
  }
}
