/**
 * 文件：backend/src/modules/supplier/supplier-branch-profile.entity.ts
 * 功能：定义供应商在某个招标机构中的准入档案，是供应商机构归属的唯一依据。
 * 交互：被 branch-context.service.ts 用于解析供应商账号的机构作用域；映射 supplier_branch_profiles 表。
 * 作者：吴川
 *
 * 供应商是机构下的业务数据，不是组织成员，因此不进 branch_members。
 * 同一家供应商可在多个机构拥有档案（跨境供应商），各机构的准入状态相互独立。
 *
 * 注意：字段定义须与 migrations/1713660000027-SupplierBranchProfile.ts 保持一致。
 */
import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum SupplierBranchProfileStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('supplier_branch_profiles')
@Index('uq_supplier_branch_profiles_branch_supplier', ['branchId', 'supplierId'], { unique: true })
@Index('idx_supplier_branch_profiles_supplier', ['supplierId'], { where: `status = 'active'` })
@Check('chk_supplier_branch_profiles_status', `status IN ('active', 'inactive')`)
export class SupplierBranchProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'varchar', length: 20, default: SupplierBranchProfileStatus.ACTIVE })
  status: SupplierBranchProfileStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
