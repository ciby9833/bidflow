import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreRepeatableSnapshots1713800000041 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Keep all historical snapshots; recording a snapshot must not lock a round.
    await q.query('DROP INDEX IF EXISTS uq_eval_freeze_round');
  }
  async down(): Promise<void> {
    // Reintroducing uniqueness could destroy or reject valid historical snapshots.
    throw new Error('Cannot restore single-snapshot restriction without reviewing historical records');
  }
}
