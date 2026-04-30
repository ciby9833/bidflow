/**
 * 文件：backend/src/modules/quote/quote.entity.ts
 * 功能：定义报价版本、金额、幂等键、提交来源与结构化明细的数据模型。
 * 交互：被 quote.service.ts、export.service.ts 与排名逻辑读取；映射 quotes 表并关联 lot.entity.ts。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Lot } from '../tender/lot.entity';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'quote_no', type: 'varchar', length: 30, unique: true })
  quoteNo: string; // Q-202604-000123

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @ManyToOne(() => Lot, (l) => l.quotes)
  lot: Lot;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'is_latest', type: 'boolean', default: true })
  isLatest: boolean;

  @Column({ name: 'is_valid', type: 'boolean', default: true })
  isValid: boolean;

  @Column({ name: 'total_price', type: 'numeric', precision: 20, scale: 4 })
  totalPrice: number;

  @Column({ name: 'currency', type: 'char', length: 3, default: 'CNY' })
  currency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 16, scale: 6, nullable: true })
  exchangeRate?: number;

  @Column({ name: 'base_currency', type: 'char', length: 3, nullable: true })
  baseCurrency?: string;

  @Column({ name: 'price_in_base', type: 'numeric', precision: 20, scale: 4, nullable: true })
  priceInBase?: number;

  @Column({ name: 'lot_schema_version', type: 'int' })
  lotSchemaVersion: number;

  @Column({ name: 'items', type: 'jsonb', nullable: true })
  items?: Record<string, unknown>[];

  @Column({ name: 'attachments', type: 'jsonb', nullable: true })
  attachments?: { key: string; name: string; size: number }[];

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, nullable: true })
  idempotencyKey?: string;

  @Column({ name: 'submit_ip', type: 'inet', nullable: true })
  submitIp?: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark?: string;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;
}
