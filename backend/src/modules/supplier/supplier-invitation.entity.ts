/**
 * 文件：backend/src/modules/supplier/supplier-invitation.entity.ts
 * 功能：定义供应商成员邀请记录，用于公司创建供应商后邀请人员注册或加入。
 * 交互：被 supplier.service.ts 读写；供应商管理端创建邀请，供应商账号通过邀请码加入。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('supplier_invitations')
export class SupplierInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  token: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string;

  @Column({ name: 'relation_role', type: 'varchar', length: 30, default: 'operator' })
  relationRole: 'admin' | 'operator';

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status: 'pending' | 'accepted' | 'revoked' | 'expired';

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'accepted_by_user_id', type: 'uuid', nullable: true })
  acceptedByUserId?: string;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
