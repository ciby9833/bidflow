/**
 * 文件：backend/src/modules/tender/invitation.entity.ts
 * 功能：定义招标邀请、可见时间与响应状态模型，用于控制供应商可见性。
 * 交互：被 tender.service.ts 创建和查询；quote.service.ts 用其校验投标权限；映射 invitations 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Tender } from './tender.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @ManyToOne(() => Tender, (t) => t.invitations)
  @JoinColumn({ name: 'tender_id' })
  tender: Tender;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'enum', enum: InvitationStatus, default: InvitationStatus.PENDING })
  status: InvitationStatus;

  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt?: Date;

  @Column({ name: 'visible_at', type: 'timestamptz', nullable: true })
  visibleAt?: Date; // null = immediately visible

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
