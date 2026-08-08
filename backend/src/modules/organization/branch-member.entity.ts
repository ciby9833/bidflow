/**
 * 文件：backend/src/modules/organization/branch-member.entity.ts
 * 功能：定义「用户 × 机构」成员关系，角色按机构独立存放，支撑同一人在不同机构拥有不同权限。
 * 交互：关联 branch.entity.ts 与 auth/user.entity.ts；后续 rbac.guard.ts 将改为读取本表解析出的角色而非 users.role。
 * 作者：吴川
 *
 * 注意：
 * 1. 字段定义须与 migrations/1713630000024-BranchAndBranchMember.ts 严格一致，避免 dev synchronize 漂移。
 * 2. 供应商账号不入本表 —— 供应商是机构下的业务数据，不是组织成员，其机构归属见供应商机构档案。
 */
import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/** 机构内角色。刻意不含 supplier —— 由 chk_branch_members_role 在库级兜底。 */
export enum BranchMemberRole {
  /** 总部管理员：跨机构只读 + 维护机构与成员。只应出现在 type='HQ' 的机构下。 */
  HQ_ADMIN = 'hq_admin',
  SUPER_ADMIN = 'super_admin',
  PURCHASE_MANAGER = 'purchase_manager',
  PURCHASE_STAFF = 'purchase_staff',
  EVALUATOR = 'evaluator',
}

export enum BranchMemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('branch_members')
@Index('uq_branch_members_branch_user', ['branchId', 'authUserId'], { unique: true })
@Index('idx_branch_members_user', ['authUserId'], { where: `status = 'active'` })
@Check('chk_branch_members_status', `status IN ('active', 'inactive')`)
@Check(
  'chk_branch_members_role',
  `role IN ('hq_admin', 'super_admin', 'purchase_manager', 'purchase_staff', 'evaluator')`,
)
export class BranchMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'auth_user_id', type: 'uuid' })
  authUserId: string;

  /** 该用户在该机构内的角色，与 users.role 解耦 */
  @Column({ type: 'varchar', length: 30 })
  role: BranchMemberRole;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department?: string;

  @Column({ type: 'varchar', length: 20, default: BranchMemberStatus.ACTIVE })
  status: BranchMemberStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
