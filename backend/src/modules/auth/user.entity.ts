/**
 * 文件：backend/src/modules/auth/user.entity.ts
 * 功能：定义统一认证账号、角色、注册来源与账号启停状态的数据模型。
 * 交互：被 auth.service.ts、jwt.strategy.ts、rbac.guard.ts 与审计链路使用；映射 users 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  PURCHASE_MANAGER = 'purchase_manager',
  PURCHASE_STAFF = 'purchase_staff',
  EVALUATOR = 'evaluator',
  SUPPLIER = 'supplier',
}

export enum AccountType {
  COMPANY_USER = 'company_user',
  SUPPLIER_ACCOUNT = 'supplier_account',
}

export enum RegisterSource {
  INTERNAL_CREATED = 'internal_created',
  EXTERNAL_SIGNUP = 'external_signup',
  GOOGLE = 'google',
  WECHAT = 'wechat',
  APPLE = 'apple',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING_VERIFY = 'pending_verify',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ name: 'login_name', type: 'varchar', length: 100, unique: true, nullable: true })
  loginName?: string;

  @Column({ name: 'phone', type: 'varchar', length: 30, nullable: true })
  phone?: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'account_type', type: 'varchar', length: 30, default: AccountType.COMPANY_USER })
  accountType: AccountType;

  @Column({ name: 'register_source', type: 'varchar', length: 30, default: RegisterSource.INTERNAL_CREATED })
  registerSource: RegisterSource;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  @Column({ name: 'employee_id', type: 'varchar', length: 50, nullable: true })
  employeeId?: string;

  @Column({ name: 'locale', type: 'varchar', length: 10, default: 'zh-CN' })
  locale: string;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId?: string;

  @Column({ name: 'otp_code', type: 'varchar', length: 10, nullable: true })
  otpCode?: string;

  @Column({ name: 'otp_expires_at', type: 'timestamptz', nullable: true })
  otpExpiresAt?: Date;

  @Column({ name: 'otp_fail_count', type: 'int', default: 0 })
  otpFailCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
