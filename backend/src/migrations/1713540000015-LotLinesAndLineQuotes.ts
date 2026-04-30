/**
 * 文件：backend/src/migrations/1713540000015-LotLinesAndLineQuotes.ts
 * 功能：增加标包线路、线路报价与招标当前报价轮次。
 * 交互：支持运力类在线路维度报价、排名与二轮报价。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotLinesAndLineQuotes1713540000015 implements MigrationInterface {
  name = 'LotLinesAndLineQuotes1713540000015';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS current_quote_round INT NOT NULL DEFAULT 1');

    await qr.query(`
      CREATE TABLE IF NOT EXISTS lot_lines (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
        lot_id          UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        line_no         VARCHAR(30) NOT NULL,
        row_no          INT NOT NULL,
        sort_order      INT NOT NULL DEFAULT 0,
        data_json       JSONB NOT NULL,
        schema_version  INT NOT NULL DEFAULT 1,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query('CREATE INDEX IF NOT EXISTS idx_lot_lines_lot ON lot_lines(lot_id, sort_order)');
    await qr.query('CREATE INDEX IF NOT EXISTS idx_lot_lines_tender ON lot_lines(tender_id)');

    await qr.query(`
      CREATE TABLE IF NOT EXISTS line_quotes (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_no            VARCHAR(30) UNIQUE NOT NULL,
        tender_id           UUID NOT NULL REFERENCES tenders(id),
        lot_id              UUID NOT NULL REFERENCES lots(id),
        line_id             UUID NOT NULL REFERENCES lot_lines(id) ON DELETE CASCADE,
        round_no            INT NOT NULL DEFAULT 1,
        supplier_id         UUID NOT NULL REFERENCES suppliers(id),
        version             INT NOT NULL DEFAULT 1,
        is_latest           BOOLEAN NOT NULL DEFAULT TRUE,
        is_valid            BOOLEAN NOT NULL DEFAULT TRUE,
        total_price         NUMERIC(20,4) NOT NULL,
        currency            CHAR(3) NOT NULL DEFAULT 'IDR',
        base_currency       CHAR(3),
        price_in_base       NUMERIC(20,4),
        line_schema_version INT NOT NULL,
        items               JSONB,
        idempotency_key     VARCHAR(64),
        submit_ip           INET,
        remark              TEXT,
        submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_line_quotes_idempotency ON line_quotes(tender_id,line_id,round_no,supplier_id,idempotency_key) WHERE idempotency_key IS NOT NULL');
    await qr.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_line_quotes_version ON line_quotes(tender_id,line_id,round_no,supplier_id,version)');
    await qr.query('CREATE INDEX IF NOT EXISTS idx_line_quotes_latest ON line_quotes(line_id,round_no,supplier_id,is_latest) WHERE is_latest = TRUE');
    await qr.query('CREATE INDEX IF NOT EXISTS idx_line_quotes_rank ON line_quotes(line_id,round_no,total_price) WHERE is_latest = TRUE AND is_valid = TRUE');
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS line_quotes');
    await qr.query('DROP TABLE IF EXISTS lot_lines');
    await qr.query('ALTER TABLE tenders DROP COLUMN IF EXISTS current_quote_round');
  }
}
