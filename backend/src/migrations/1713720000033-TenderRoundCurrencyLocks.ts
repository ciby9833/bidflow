/**
 * Adds tender-round currency locks. Existing quote snapshots remain authoritative;
 * consistent historical rows seed the locks so new submissions reuse their currency/rate.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderRoundCurrencyLocks1713720000033 implements MigrationInterface {
  name = 'TenderRoundCurrencyLocks1713720000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE branches
      SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{currency}', '"IDR"'::jsonb, true)
      WHERE type = 'BRANCH' AND country_code = 'ID' AND NOT (COALESCE(settings, '{}'::jsonb) ? 'currency')
    `);
    await queryRunner.query(`
      UPDATE branches
      SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{currency}', '"VND"'::jsonb, true)
      WHERE type = 'BRANCH' AND country_code = 'VN' AND NOT (COALESCE(settings, '{}'::jsonb) ? 'currency')
    `);

    await queryRunner.query('ALTER TABLE quotes ALTER COLUMN exchange_rate TYPE NUMERIC(24,12)');
    await queryRunner.query('ALTER TABLE line_quotes ALTER COLUMN exchange_rate TYPE NUMERIC(24,12)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_round_currencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES branches(id),
        tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
        round_no INT NOT NULL,
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        currency CHAR(3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_supplier_round_currencies_scope UNIQUE (tender_id, round_no, supplier_id)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_supplier_round_currencies_branch ON supplier_round_currencies(branch_id)');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tender_exchange_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES branches(id),
        tender_id UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
        round_no INT NOT NULL,
        from_currency CHAR(3) NOT NULL,
        to_currency CHAR(3) NOT NULL,
        exchange_rate NUMERIC(24,12) NOT NULL CHECK (exchange_rate > 0),
        rate_date DATE NOT NULL,
        source VARCHAR(60) NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_tender_exchange_rates_pair UNIQUE (tender_id, round_no, from_currency, to_currency)
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_tender_exchange_rates_branch ON tender_exchange_rates(branch_id)');

    await queryRunner.query(`
      INSERT INTO supplier_round_currencies (branch_id, tender_id, round_no, supplier_id, currency)
      SELECT MIN(branch_id::text)::uuid, tender_id, round_no, supplier_id, MIN(currency)
      FROM line_quotes
      WHERE branch_id IS NOT NULL
      GROUP BY tender_id, round_no, supplier_id
      HAVING COUNT(DISTINCT currency) = 1
      ON CONFLICT (tender_id, round_no, supplier_id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO supplier_round_currencies (branch_id, tender_id, round_no, supplier_id, currency)
      SELECT MIN(q.branch_id::text)::uuid, q.tender_id, t.current_quote_round, q.supplier_id, MIN(q.currency)
      FROM quotes q
      JOIN tenders t ON t.id = q.tender_id
      WHERE q.branch_id IS NOT NULL
      GROUP BY q.tender_id, t.current_quote_round, q.supplier_id
      HAVING COUNT(DISTINCT q.currency) = 1
      ON CONFLICT (tender_id, round_no, supplier_id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO tender_exchange_rates (
        branch_id, tender_id, round_no, from_currency, to_currency,
        exchange_rate, rate_date, source, fetched_at
      )
      SELECT DISTINCT ON (q.tender_id, q.round_no, q.currency, q.base_currency)
        q.branch_id, q.tender_id, q.round_no, q.currency, q.base_currency,
        q.exchange_rate, q.exchange_rate_date, COALESCE(q.exchange_rate_source, 'historical_snapshot'), q.submitted_at
      FROM line_quotes q
      WHERE q.exchange_rate IS NOT NULL
        AND q.exchange_rate_date IS NOT NULL
        AND q.base_currency IS NOT NULL
        AND q.branch_id IS NOT NULL
      ORDER BY q.tender_id, q.round_no, q.currency, q.base_currency, q.submitted_at ASC
      ON CONFLICT (tender_id, round_no, from_currency, to_currency) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO tender_exchange_rates (
        branch_id, tender_id, round_no, from_currency, to_currency,
        exchange_rate, rate_date, source, fetched_at
      )
      SELECT DISTINCT ON (q.tender_id, t.current_quote_round, q.currency, q.base_currency)
        q.branch_id, q.tender_id, t.current_quote_round, q.currency, q.base_currency,
        q.exchange_rate, q.exchange_rate_date, COALESCE(q.exchange_rate_source, 'historical_snapshot'), q.submitted_at
      FROM quotes q
      JOIN tenders t ON t.id = q.tender_id
      WHERE q.exchange_rate IS NOT NULL
        AND q.exchange_rate_date IS NOT NULL
        AND q.base_currency IS NOT NULL
        AND q.branch_id IS NOT NULL
      ORDER BY q.tender_id, t.current_quote_round, q.currency, q.base_currency, q.submitted_at ASC
      ON CONFLICT (tender_id, round_no, from_currency, to_currency) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS tender_exchange_rates');
    await queryRunner.query('DROP TABLE IF EXISTS supplier_round_currencies');
  }
}
