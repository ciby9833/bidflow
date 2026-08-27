/**
 * 文件：backend/src/migrations/1713710000032-QuoteCurrencyConversion.ts
 * 功能：补齐报价汇率快照字段，并为同币种历史报价回填统一币种金额。
 * 交互：quote.service.ts 后续按 price_in_base 做排名与评审统计；跨币种历史通过脚本按提交日回刷。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteCurrencyConversion1713710000032 implements MigrationInterface {
  name = 'QuoteCurrencyConversion1713710000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE quotes ADD COLUMN IF NOT EXISTS exchange_rate_date DATE');
    await queryRunner.query("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(60)");
    await queryRunner.query('ALTER TABLE line_quotes ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(16,6)');
    await queryRunner.query('ALTER TABLE line_quotes ADD COLUMN IF NOT EXISTS exchange_rate_date DATE');
    await queryRunner.query("ALTER TABLE line_quotes ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(60)");

    await queryRunner.query(`
      UPDATE quotes q
      SET
        base_currency = COALESCE(q.base_currency, t.base_currency),
        exchange_rate = COALESCE(q.exchange_rate, 1),
        price_in_base = COALESCE(q.price_in_base, q.total_price),
        exchange_rate_date = COALESCE(q.exchange_rate_date, q.submitted_at::date),
        exchange_rate_source = COALESCE(q.exchange_rate_source, 'same_currency_legacy')
      FROM tenders t
      WHERE q.tender_id = t.id
        AND q.currency = COALESCE(q.base_currency, t.base_currency)
    `);

    await queryRunner.query(`
      UPDATE line_quotes q
      SET
        base_currency = COALESCE(q.base_currency, t.base_currency),
        exchange_rate = COALESCE(q.exchange_rate, 1),
        price_in_base = COALESCE(q.price_in_base, q.total_price),
        exchange_rate_date = COALESCE(q.exchange_rate_date, q.submitted_at::date),
        exchange_rate_source = COALESCE(q.exchange_rate_source, 'same_currency_legacy')
      FROM tenders t
      WHERE q.tender_id = t.id
        AND q.currency = COALESCE(q.base_currency, t.base_currency)
    `);

    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_quotes_rank_base ON quotes(lot_id, price_in_base) WHERE is_latest = TRUE AND is_valid = TRUE');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_line_quotes_rank_base ON line_quotes(line_id, round_no, price_in_base) WHERE is_latest = TRUE AND is_valid = TRUE');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_line_quotes_rank_base');
    await queryRunner.query('DROP INDEX IF EXISTS idx_quotes_rank_base');
    await queryRunner.query('ALTER TABLE line_quotes DROP COLUMN IF EXISTS exchange_rate_source');
    await queryRunner.query('ALTER TABLE line_quotes DROP COLUMN IF EXISTS exchange_rate_date');
    await queryRunner.query('ALTER TABLE line_quotes DROP COLUMN IF EXISTS exchange_rate');
    await queryRunner.query('ALTER TABLE quotes DROP COLUMN IF EXISTS exchange_rate_source');
    await queryRunner.query('ALTER TABLE quotes DROP COLUMN IF EXISTS exchange_rate_date');
  }
}
