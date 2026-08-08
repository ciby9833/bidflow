/**
 * 文件：backend/src/modules/organization/branch.entity.ts
 * 功能：定义机构主体（总部与国家机构），承载机构级配置与启停状态。
 * 交互：由 branch-member.entity.ts 关联成员；后续 auth.service.ts 据此解析登录用户的机构范围；映射 branches 表。
 * 作者：吴川
 *
 * 注意：字段定义须与 migrations/1713630000024-BranchAndBranchMember.ts 严格一致，
 * 否则开发环境的 synchronize 会自动改表，导致 dev 与生产 schema 漂移。
 */
import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum BranchType {
  /** 总部：不持有业务数据，仅跨机构只读汇总 */
  HQ = 'HQ',
  /** 国家机构：所有招标、供应商、报价数据的归属层 */
  BRANCH = 'BRANCH',
}

export enum BranchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface BranchSettings {
  /** 机构基础货币，如 IDR。HQ 不设。 */
  currency?: string;
  timezone?: string;
  defaultLocale?: string;
  contactEmail?: string;
  contactPhone?: string;
}

@Entity('branches')
// 全系统仅允许一个总部。必须在实体声明，否则开发环境 synchronize 会把迁移建的部分索引删掉。
@Index('uq_branches_single_hq', ['type'], { unique: true, where: `type = 'HQ'` })
@Check('chk_branches_type', `type IN ('HQ', 'BRANCH')`)
@Check('chk_branches_status', `status IN ('active', 'inactive')`)
@Check(
  'chk_branches_country',
  `(type = 'HQ' AND country_code IS NULL) OR (type = 'BRANCH' AND country_code IS NOT NULL)`,
)
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 机构代码，如 HQ / ID / VN。后续迁移以此定位机构，避免硬编码 UUID。 */
  @Index('uq_branches_code_idx', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: BranchType;

  /** ISO 3166-1 alpha-2。HQ 为空，国家机构必填（由 chk_branches_country 约束）。 */
  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode?: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  settings: BranchSettings;

  @Column({ type: 'varchar', length: 20, default: BranchStatus.ACTIVE })
  status: BranchStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
