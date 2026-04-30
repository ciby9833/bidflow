/**
 * 文件：backend/src/modules/tender/lot-line.entity.ts
 * 功能：定义标包下的动态线路/明细行，用于运力类按线路报价与排名。
 * 交互：被 tender.service.ts 创建与读取；被 quote.service.ts 作为线路报价粒度使用。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Tender } from './tender.entity';
import { Lot } from './lot.entity';
import { LineQuote } from '../quote/line-quote.entity';

@Entity('lot_lines')
export class LotLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @ManyToOne(() => Tender, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tender_id' })
  tender: Tender;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @ManyToOne(() => Lot, (lot) => lot.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lot_id' })
  lot: Lot;

  @Column({ name: 'line_no', type: 'varchar', length: 30 })
  lineNo: string;

  @Column({ name: 'row_no', type: 'int' })
  rowNo: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'data_json', type: 'jsonb' })
  dataJson: Record<string, unknown>;

  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => LineQuote, (quote) => quote.line, { cascade: false })
  quotes: LineQuote[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
