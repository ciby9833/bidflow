/**
 * 文件：backend/src/modules/supplier/supplier.entity.ts
 * 功能：定义供应商主数据、联系人、状态与防串标指纹字段。
 * 交互：被 supplier.service.ts、export.service.ts、invitation/quote 业务读取；映射 suppliers 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum SupplierStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BLACKLISTED = 'blacklisted',
}

export enum SupplierReviewStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING_REVIEW = 'pending_review',
  SUPPLEMENT_REQUIRED = 'supplement_required',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum SupplierCategory {
  ENGINEERING = 'engineering',
  TRANSPORT = 'transport',
  ROUTINE = 'routine',
  GENERAL = 'general',
}

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'varchar', length: 30, unique: true })
  businessId: string; // S-ID-00017

  @Column({ name: 'legal_name', type: 'varchar', length: 200, nullable: true })
  legalName?: string;

  @Column({ name: 'short_name', type: 'varchar', length: 100, nullable: true })
  shortName?: string;

  @Column({ type: 'enum', enum: SupplierStatus, default: SupplierStatus.ACTIVE })
  status: SupplierStatus;

  @Column({ name: 'review_status', type: 'varchar', length: 30, default: SupplierReviewStatus.NOT_SUBMITTED })
  reviewStatus: SupplierReviewStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId?: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment?: string;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'CN' })
  countryCode: string;

  @Column({ name: 'region', type: 'varchar', length: 10, nullable: true })
  region?: string;

  @Column({ type: 'jsonb', nullable: true })
  categories?: SupplierCategory[];

  @Column({ name: 'contact_name', type: 'varchar', length: 100, nullable: true })
  contactName?: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 150, nullable: true })
  contactEmail?: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 30, nullable: true })
  contactPhone?: string;

  @Column({ name: 'bank_account_encrypted', type: 'text', nullable: true })
  bankAccountEncrypted?: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId?: string;

  @Column({ name: 'rating', type: 'numeric', precision: 3, scale: 2, nullable: true })
  rating?: number;

  @Column({ name: 'suspended_reason', type: 'text', nullable: true })
  suspendedReason?: string;

  @Column({ name: 'fingerprint_hash', type: 'varchar', length: 64, nullable: true })
  fingerprintHash?: string;

  @Column({ name: 'anti_collusion_flagged', type: 'boolean', default: false })
  antiCollusionFlagged: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
