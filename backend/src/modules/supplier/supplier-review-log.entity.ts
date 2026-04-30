/**
 * 文件：backend/src/modules/supplier/supplier-review-log.entity.ts
 * 功能：定义供应商认证审核日志，记录提交、补件、通过、驳回和冻结等动作。
 * 交互：被 supplier.service.ts 写入；供公司审核详情页和供应商查看进度使用。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('supplier_review_logs')
export class SupplierReviewLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'action', type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'review_status', type: 'varchar', length: 30, nullable: true })
  reviewStatus?: string;

  @Column({ name: 'operator_user_id', type: 'uuid', nullable: true })
  operatorUserId?: string;

  @Column({ name: 'operator_role', type: 'varchar', length: 50, nullable: true })
  operatorRole?: string;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment?: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
