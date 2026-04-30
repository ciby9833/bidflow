/**
 * 文件：backend/src/modules/quote/line-quote.entity.ts
 * 功能：定义运力线路维度报价版本，支持按线路、按轮次独立排名。
 * 交互：被 quote.service.ts 写入与排名读取；关联 lot-line.entity.ts。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { LotLine } from '../tender/lot-line.entity';

@Entity('line_quotes')
export class LineQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'quote_no', type: 'varchar', length: 30, unique: true })
  quoteNo: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @Column({ name: 'line_id', type: 'uuid' })
  lineId: string;

  @ManyToOne(() => LotLine, (line) => line.quotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'line_id' })
  line: LotLine;

  @Column({ name: 'round_no', type: 'int', default: 1 })
  roundNo: number;

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

  @Column({ name: 'currency', type: 'char', length: 3, default: 'IDR' })
  currency: string;

  @Column({ name: 'base_currency', type: 'char', length: 3, nullable: true })
  baseCurrency?: string;

  @Column({ name: 'price_in_base', type: 'numeric', precision: 20, scale: 4, nullable: true })
  priceInBase?: number;

  @Column({ name: 'line_schema_version', type: 'int' })
  lineSchemaVersion: number;

  @Column({ name: 'items', type: 'jsonb', nullable: true })
  items?: Record<string, unknown>;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, nullable: true })
  idempotencyKey?: string;

  @Column({ name: 'submit_ip', type: 'inet', nullable: true })
  submitIp?: string;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark?: string;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;
}
