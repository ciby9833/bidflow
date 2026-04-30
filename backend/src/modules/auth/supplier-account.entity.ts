/**
 * 文件：backend/src/modules/auth/supplier-account.entity.ts
 * 功能：定义供应商主体下的登录成员映射，支持主账号与子账号扩展。
 * 交互：由 auth.service.ts 解析供应商登录上下文；供后续供应商子账号管理和审核态跳转使用。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('supplier_accounts')
export class SupplierAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'auth_user_id', type: 'uuid' })
  authUserId: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true })
  displayName?: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'relation_role', type: 'varchar', length: 30, default: 'operator' })
  relationRole: 'owner' | 'admin' | 'operator';

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
