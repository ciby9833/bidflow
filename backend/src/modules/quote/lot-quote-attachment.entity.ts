/**
 * 文件：backend/src/modules/quote/lot-quote-attachment.entity.ts
 * 功能：定义标包级投标附件（盖章报价单、盖章投标文件等），按 招标+标包+供应商+轮次 唯一一份。
 * 交互：被 quote.service.ts 读写；映射 lot_quote_attachments 表。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export interface QuoteAttachmentItem {
  key: string;
  name: string;
  size: number;
  mimeType?: string;
  fileUrl?: string;
}

@Entity('lot_quote_attachments')
export class LotQuoteAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId!: string;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'round_no', type: 'int', default: 1 })
  roundNo!: number;

  @Column({ name: 'attachments', type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments!: QuoteAttachmentItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
