/**
 * 文件：backend/src/shared/audit/audit-log.entity.ts
 * 功能：定义不可变审计日志的枚举和实体结构。
 * 交互：被 audit.service.ts 写入；各业务服务通过 AuditAction/AuditEntityType 统一记录关键操作；映射 audit_logs 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  OTP_FAIL = 'OTP_FAIL',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_CONFIRMED = 'PASSWORD_RESET_CONFIRMED',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  QUOTE_SUBMIT = 'QUOTE_SUBMIT',
  QUOTE_REBID = 'QUOTE_REBID',
  TENDER_CREATE = 'TENDER_CREATE',
  TENDER_UPDATE = 'TENDER_UPDATE',
  TENDER_WITHDRAW = 'TENDER_WITHDRAW',
  TENDER_OPEN = 'TENDER_OPEN',
  TENDER_CLOSE = 'TENDER_CLOSE',
  TENDER_CANCEL = 'TENDER_CANCEL',
  TENDER_DELETE = 'TENDER_DELETE',
  SUPPLIER_CREATE = 'SUPPLIER_CREATE',
  SUPPLIER_PROFILE_SUBMIT = 'SUPPLIER_PROFILE_SUBMIT',
  SUPPLIER_APPROVE = 'SUPPLIER_APPROVE',
  SUPPLIER_REJECT = 'SUPPLIER_REJECT',
  SUPPLIER_REQUEST_SUPPLEMENT = 'SUPPLIER_REQUEST_SUPPLEMENT',
  SUPPLIER_SUSPEND = 'SUPPLIER_SUSPEND',
  SUPPLIER_RESUME = 'SUPPLIER_RESUME',
  EXPORT_FULL = 'EXPORT_FULL',
  EXPORT_MASKED = 'EXPORT_MASKED',
  ADMIN_UNLOCK = 'ADMIN_UNLOCK',
  INVITATION_SEND = 'INVITATION_SEND',
  EVAL_FREEZE = 'EVAL_FREEZE',
}

export enum AuditEntityType {
  USER = 'user',
  SUPPLIER = 'supplier',
  TENDER = 'tender',
  LOT = 'lot',
  QUOTE = 'quote',
  INVITATION = 'invitation',
  EXPORT = 'export',
}

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: AuditEntityType;

  @Column({ name: 'entity_id', type: 'varchar', length: 64 })
  entityId: string;

  @Column({ type: 'varchar', length: 50 })
  action: AuditAction;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'user_role', type: 'varchar', length: 50 })
  userRole: string;

  @Column({ name: 'ip_address', type: 'inet' })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState?: Record<string, unknown>;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
