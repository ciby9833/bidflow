/**
 * 文件：backend/src/modules/tender/tender-notification-log.entity.ts
 * 功能：记录招标邮件通知发送结果，用于判断撤回时是否需要提醒供应商。
 * 交互：由 tender.service.ts 在发布通知、手动补发和撤回通知后写入；映射 tender_notification_logs 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

export enum TenderNotificationType {
  INVITATION = 'invitation',
  WITHDRAWAL = 'withdrawal',
}

export enum TenderNotificationTrigger {
  PUBLISH = 'publish',
  MANUAL_RESEND = 'manual_resend',
  WITHDRAW = 'withdraw',
}

@Entity('tender_notification_logs')
export class TenderNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'round_no', type: 'int', default: 1 })
  roundNo: number;

  @Column({ type: 'varchar', length: 30 })
  type: TenderNotificationType;

  @Column({ type: 'varchar', length: 30 })
  trigger: TenderNotificationTrigger;

  @Column({ name: 'supplier_count', type: 'int', default: 0 })
  supplierCount: number;

  @Column({ name: 'account_count', type: 'int', default: 0 })
  accountCount: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'skipped_count', type: 'int', default: 0 })
  skippedCount: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
