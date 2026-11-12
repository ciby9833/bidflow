import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotQuoteRoundIndexes1713780000039 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IF EXISTS idx_quotes_idempotency');
    await q.query('DROP INDEX IF EXISTS idx_quotes_version');
    await q.query('CREATE UNIQUE INDEX idx_quotes_idempotency ON quotes(tender_id,lot_id,round_no,supplier_id,idempotency_key) WHERE idempotency_key IS NOT NULL');
    await q.query('CREATE UNIQUE INDEX idx_quotes_version ON quotes(tender_id,lot_id,round_no,supplier_id,version)');
  }
  async down(q: QueryRunner): Promise<void> {
    // Fail rather than delete history if multiple rounds contain matching versions.
    await q.query('DROP INDEX idx_quotes_idempotency');
    await q.query('DROP INDEX idx_quotes_version');
    await q.query('CREATE UNIQUE INDEX idx_quotes_idempotency ON quotes(tender_id,lot_id,supplier_id,idempotency_key) WHERE idempotency_key IS NOT NULL');
    await q.query('CREATE UNIQUE INDEX idx_quotes_version ON quotes(tender_id,lot_id,supplier_id,version)');
  }
}
