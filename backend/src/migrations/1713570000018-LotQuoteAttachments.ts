/**
 * 文件：backend/src/migrations/1713570000018-LotQuoteAttachments.ts
 * 功能：新增标包级投标附件表，供应商在某标包某轮提交盖章报价单等附件（最多 5 个）。
 * 交互：配合 LotQuoteAttachment 实体与 quote.service.ts 的附件读写接口。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotQuoteAttachments1713570000018 implements MigrationInterface {
  name = 'LotQuoteAttachments1713570000018';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS lot_quote_attachments (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tender_id   UUID NOT NULL,
        lot_id      UUID NOT NULL,
        supplier_id UUID NOT NULL,
        round_no    INT NOT NULL DEFAULT 1,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_quote_attachments_unique
        ON lot_quote_attachments(tender_id, lot_id, supplier_id, round_no)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_lot_quote_attachments_lot
        ON lot_quote_attachments(lot_id, round_no)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS lot_quote_attachments`);
  }
}
