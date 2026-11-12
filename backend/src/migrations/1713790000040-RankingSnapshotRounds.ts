import { MigrationInterface, QueryRunner } from 'typeorm';

export class RankingSnapshotRounds1713790000040 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE ranking_snapshots ADD COLUMN round_no integer NULL');
    // Preserve legacy rows verbatim, including any ambiguous or duplicate snapshots.
    await q.query("CREATE UNIQUE INDEX uq_eval_freeze_round ON ranking_snapshots(lot_id, round_no) WHERE trigger_reason = 'EVAL_FREEZE' AND round_no IS NOT NULL");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX uq_eval_freeze_round');
    await q.query('ALTER TABLE ranking_snapshots DROP COLUMN round_no');
  }
}
