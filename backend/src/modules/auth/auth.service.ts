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
import { DataSource, Repository } from 'typeorm';
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
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';
import { RedisService } from '../../shared/config/redis.config';
import { MailService } from '../../shared/mail/mail.service';
import { buildVerificationCodeEmail } from '../../shared/mail/templates/verification-code.template';

export interface JwtPayload {
  sub: string;
  accountType: AccountType;
  orgId: string;
  scope: string[];
  tokenVersion: number;
  role?: UserRole;
  email?: string;
  supplierId?: string;
}

const SCOPE_MAP: Record<UserRole, string[]> = {
  super_admin: ['*'],
  purchase_manager: [
    'tender:view', 'tender:create', 'tender:edit', 'tender:publish', 'tender:close',
    'supplier:view', 'supplier:create', 'supplier:edit',
    'quote:view_all', 'export:full', 'export:masked',
    'admin:unlock', 'eval:freeze', 'user:view',
  ],
  purchase_staff: [
    'tender:view', 'tender:create', 'tender:edit', 'supplier:view', 'supplier:create',
    'quote:view_all', 'export:masked',
  ],
  evaluator: ['tender:view', 'quote:view_all', 'eval:freeze', 'export:masked'],
  supplier: ['tender:view', 'quote:submit', 'quote:rebid', 'quote:view_own', 'tender:view_invited'],
};

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

    const profile = await this.buildProfile(user);
    const payload: JwtPayload = {
      sub: user.id,
      accountType: user.accountType,
      orgId: profile.orgId,
      scope: profile.scopes,
      tokenVersion: user.tokenVersion,
      role: user.role,
      email: user.email,
      supplierId: profile.user.supplierId,
    };
    const token = this.jwt.sign(payload);
    return {
      accessToken: token,
      accountType: user.accountType,
      redirect: profile.redirect,
      scopes: profile.scopes,
      user: profile.user,
    };
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

    const profile = await this.buildProfile(user);
    const payload: JwtPayload = {
      sub: user.id,
      accountType: user.accountType,
      orgId: profile.orgId,
      scope: profile.scopes,
      tokenVersion: user.tokenVersion,
      role: user.role,
      email: user.email,
      supplierId: profile.user.supplierId,
    };
    const token = this.jwt.sign(payload);
    return {
      accessToken: token,
      accountType: user.accountType,
      redirect: profile.redirect,
      scopes: profile.scopes,
      user: profile.user,
    };
  }

  async logout(user: User, ctx: AuditContext) {
    await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.LOGOUT);
    return { loggedOut: true };
  }

  getCapabilities(user: Pick<User, 'role' | 'accountType'>) {
    if (user.accountType === AccountType.COMPANY_USER) {
      return SCOPE_MAP[user.role] ?? [];
    }
    return ['tender:view', 'tender:view_invited', 'quote:view_own', 'quote:submit', 'quote:rebid'];
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
    await this.mail.send(buildVerificationCodeEmail({
      to: normalizedEmail,
      code,
      expiresInMinutes: Math.floor(ttlSeconds / 60),
      productName: 'BidFlow',
    }));

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

  async listCompanyUsers() {
    const users = await this.userRepo.find({
      where: { accountType: AccountType.COMPANY_USER },
      order: { createdAt: 'DESC' },
    });
    const profiles = await this.companyUserRepo.find();
    const profileMap = new Map(profiles.map((profile) => [profile.authUserId, profile]));

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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  async createCompanyUser(data: {
    email: string;
    password: string;
    role: UserRole;
    fullName: string;
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
      return { user: savedUser, companyUser: savedCompanyUser };
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
          orgId: 'unbound-supplier-account',
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
        orgId: supplier.id,
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
      orgId: companyUser?.id ?? 'internal-company',
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

  private async issueSession(user: User) {
    const profile = await this.buildProfile(user);
    const payload: JwtPayload = {
      sub: user.id,
      accountType: user.accountType,
      orgId: profile.orgId,
      scope: profile.scopes,
      tokenVersion: user.tokenVersion,
      role: user.role,
      email: user.email,
      supplierId: profile.user.supplierId,
    };
    const token = this.jwt.sign(payload);
    return {
      accessToken: token,
      accountType: user.accountType,
      redirect: profile.redirect,
      scopes: profile.scopes,
      user: profile.user,
    };
  }

  async requestPasswordReset(email: string, ctx: AuditContext) {
    try {
      this.logger.log(`[requestPasswordReset] Starting for email: ${email}`);
      const normalizedEmail = this.normalizeEmail(email);
      this.logger.log(`[requestPasswordReset] Normalized email: ${normalizedEmail}`);

      const user = await this.userRepo.findOne({
        where: [{ email: normalizedEmail }, { loginName: normalizedEmail }],
      });
      if (!user) throw new BadRequestException('error.auth.email_not_found');
      this.logger.log(`[requestPasswordReset] Found user: ${user.id}`);

      const cooldownSeconds = this.config.get<number>('PASSWORD_RESET_COOLDOWN_SECONDS', 60);
      const cooldownKey = `${PASSWORD_RESET_COOLDOWN_PREFIX}:${normalizedEmail}`;
      const allowed = await this.redis.setnx(cooldownKey, '1', cooldownSeconds);
      if (!allowed) throw new BadRequestException('error.auth.password_reset_too_frequent');
      this.logger.log(`[requestPasswordReset] Cooldown check passed`);

      const ttlSeconds = this.config.get<number>('PASSWORD_RESET_EXPIRES_SECONDS', 3600);
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      await this.redis.set(
        `${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`,
        JSON.stringify({ userId: user.id, email: normalizedEmail }),
        ttlSeconds,
      );
      this.logger.log(`[requestPasswordReset] Stored token in Redis`);

      const resetUrl = this.config.get<string>('PASSWORD_RESET_URL', 'http://localhost:5180/reset-password');
      const resetLink = `${resetUrl}?token=${token}`;
      this.logger.log(`[requestPasswordReset] Reset link: ${resetLink.substring(0, 50)}...`);

      this.logger.log(`[requestPasswordReset] About to send email to ${normalizedEmail}`);
      await this.mail.send({
        to: normalizedEmail,
        subject: '[BidFlow] 重置密码',
        text: `点击下面的链接重置你的密码（有效期1小时）:\n\n${resetLink}\n\n如果你没有请求重置密码，请忽略此邮件。`,
        html: `<p>点击下面的链接重置你的密码（有效期1小时）:</p><p><a href="${resetLink}">${resetLink}</a></p><p>如果你没有请求重置密码，请忽略此邮件。</p>`,
      });
      this.logger.log(`[requestPasswordReset] Email sent successfully`);

      this.logger.log(`[requestPasswordReset] About to log audit entry`);
      await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.PASSWORD_RESET_REQUESTED, undefined, { email: normalizedEmail });
      this.logger.log(`[requestPasswordReset] Audit log completed`);

      return { message: 'password_reset_email_sent' };
    } catch (error: any) {
      this.logger.error(`[requestPasswordReset] Error:`, error);
      throw error;
    }
  }

  async confirmPasswordReset(token: string, newPassword: string, ctx: AuditContext) {
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const stored = await this.redis.get(`${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`);
      if (!stored) throw new BadRequestException('error.auth.password_reset_token_invalid');

      const { userId } = JSON.parse(stored);
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) throw new BadRequestException('error.auth.user_not_found');

      const hashedPassword = await argon2.hash(newPassword);
      user.passwordHash = hashedPassword;
      user.tokenVersion += 1;
      await this.userRepo.save(user);

      await this.redis.del(`${PASSWORD_RESET_TOKEN_PREFIX}:${tokenHash}`);
      await this.audit.log(ctx, AuditEntityType.USER, user.id, AuditAction.PASSWORD_RESET_CONFIRMED, undefined, { email: user.email });

      return { message: 'password_reset_success' };
    } catch (error: any) {
      console.error('[Auth] confirmPasswordReset error:', error.message || error);
      throw error;
    }
  }
}
