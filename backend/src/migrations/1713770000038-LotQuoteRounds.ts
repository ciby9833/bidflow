import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotQuoteRounds1713770000038 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Legacy ordinary quotes never recorded a round: preserve them in round 1.
    // Do not silently relabel historical offers as the tender's current round.
    await q.query('ALTER TABLE quotes ADD COLUMN round_no integer NOT NULL DEFAULT 1');
    await q.query('CREATE INDEX idx_quotes_lot_round_supplier ON quotes(lot_id, round_no, supplier_id)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX idx_quotes_lot_round_supplier');
    await q.query('ALTER TABLE quotes DROP COLUMN round_no');
  }
}
