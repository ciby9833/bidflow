/**
 * 文件：backend/src/modules/tender/lot.entity.ts
 * 功能：定义招标标包、业务规范、UI Schema、预算与排序信息。
 * 交互：被 tender.service.ts 创建；被 quote.service.ts 与 QuoteBidView.vue 读取；映射 lots 表并关联 tender/quote。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Tender } from './tender.entity';
import { Quote } from '../quote/quote.entity';
import { LotLine } from './lot-line.entity';

@Entity('lots')
export class Lot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lot_no', type: 'varchar', length: 30, unique: true })
  lotNo: string; // L-202604-0042

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @ManyToOne(() => Tender, (t) => t.lots)
  @JoinColumn({ name: 'tender_id' })
  tender: Tender;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'numeric', precision: 20, scale: 4, nullable: true })
  quantity?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit?: string;

  @Column({ name: 'pricing_mode', type: 'varchar', length: 40, default: 'total_price' })
  pricingMode: string;

  @Column({ name: 'lot_version', type: 'int', default: 1 })
  lotVersion: number;

  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion: number;

  @Column({ name: 'spec_json', type: 'jsonb', nullable: true })
  specJson?: Record<string, unknown>;

  @Column({ name: 'ui_schema', type: 'jsonb', nullable: true })
  uiSchema?: Record<string, unknown>;

  @Column({ name: 'budget_amount', type: 'numeric', precision: 20, scale: 4, nullable: true })
  budgetAmount?: number;

  @Column({ name: 'budget_currency', type: 'char', length: 3, nullable: true })
  budgetCurrency?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => Quote, (q) => q.lot, { cascade: false })
  quotes: Quote[];

  @OneToMany(() => LotLine, (line) => line.lot, { cascade: true })
  lines: LotLine[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
