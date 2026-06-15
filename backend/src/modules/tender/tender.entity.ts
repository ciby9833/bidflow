/**
 * 文件：backend/src/modules/tender/tender.entity.ts
 * 功能：定义招标主实体，包括模板类型、状态、排名模式与改价控制参数。
 * 交互：被 tender.service.ts、quote.service.ts、export.service.ts 读取；映射 tenders 表并关联 lots/invitations。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Lot } from './lot.entity';
import { Invitation } from './invitation.entity';

export enum TenderStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  OPEN = 'open',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  AWARDED = 'awarded',
}

export enum TenderType {
  ENGINEERING = 'engineering',
  TRANSPORT = 'transport',
  ROUTINE = 'routine',
}

export enum RankingMode {
  INTERVAL = 'interval',
  TOP_N = 'top_n',
  LEADING_FLAG = 'leading_flag',
}

export enum ParticipationMode {
  ALL = 'all',
  SELECTED = 'selected',
}

@Entity('tenders')
export class Tender {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tender_no', type: 'varchar', length: 30, unique: true })
  tenderNo: string; // T-202604-0001

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'enum', enum: TenderType })
  type: TenderType;

  @Column({ type: 'enum', enum: TenderStatus, default: TenderStatus.DRAFT })
  status: TenderStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string;

  @Column({ name: 'base_currency', type: 'char', length: 3, default: 'IDR' })
  baseCurrency: string;

  @Column({ name: 'ranking_mode', type: 'enum', enum: RankingMode, default: RankingMode.LEADING_FLAG })
  rankingMode: RankingMode;

  @Column({ name: 'ranking_top_n', type: 'int', nullable: true })
  rankingTopN?: number;

  @Column({ name: 'bid_deadline', type: 'timestamptz', nullable: true })
  bidDeadline?: Date;

  @Column({ name: 'bid_start_at', type: 'timestamptz', nullable: true })
  bidStartAt?: Date;

  @Column({ name: 'open_time', type: 'timestamptz', nullable: true })
  openTime?: Date;

  @Column({ name: 'max_rebid_count', type: 'int', default: 3 })
  maxRebidCount: number;

  @Column({ name: 'min_decrement_pct', type: 'numeric', precision: 5, scale: 2, default: 1.00 })
  minDecrementPct: number;

  @Column({ name: 'cooldown_seconds', type: 'int', default: 60 })
  cooldownSeconds: number;

  @Column({ name: 'current_quote_round', type: 'int', default: 1 })
  currentQuoteRound: number;

  @Column({ name: 'participation_mode', type: 'varchar', length: 20, default: ParticipationMode.ALL })
  participationMode: ParticipationMode;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_hall_visible', type: 'boolean', default: false })
  isHallVisible: boolean;

  @Column({ name: 'is_public_ranking_visible', type: 'boolean', default: false })
  isPublicRankingVisible: boolean;

  @Column({ name: 'notify_suppliers', type: 'boolean', default: false })
  notifySuppliers: boolean;

  @Column({ name: 'hall_summary', type: 'text', nullable: true })
  hallSummary?: string;

  @Column({ name: 'attachments', type: 'jsonb', nullable: true })
  attachments?: { key: string; name: string; size: number; mimeType?: string; fileUrl?: string }[];

  @OneToMany(() => Lot, (lot) => lot.tender, { cascade: true })
  lots: Lot[];

  @OneToMany(() => Invitation, (inv) => inv.tender, { cascade: true })
  invitations: Invitation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
