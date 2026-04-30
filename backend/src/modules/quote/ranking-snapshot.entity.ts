/**
 * 文件：backend/src/modules/quote/ranking-snapshot.entity.ts
 * 功能：定义关键节点冻结的排名快照模型，用于开标留痕与取证导出。
 * 交互：被 quote.service.ts 生成；与 tender/lot/quote 实体形成只读留痕关系；映射 ranking_snapshots 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

export enum SnapshotTrigger {
  BID_CLOSE = 'BID_CLOSE',
  CANCEL = 'CANCEL',
  EVAL_FREEZE = 'EVAL_FREEZE',
  MANUAL_EXPORT = 'MANUAL_EXPORT',
}

@Entity('ranking_snapshots')
export class RankingSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @Column({ name: 'snapshot_data', type: 'jsonb' })
  snapshotData: {
    rank: number;
    supplierId: string;
    supplierName?: string;
    totalPrice: number;
    currency: string;
    version: number;
    submittedAt: string;
  }[];

  @Column({ name: 'trigger_reason', type: 'enum', enum: SnapshotTrigger })
  triggerReason: SnapshotTrigger;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy?: string;

  @Column({ name: 'immutable', type: 'boolean', default: true })
  immutable: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
