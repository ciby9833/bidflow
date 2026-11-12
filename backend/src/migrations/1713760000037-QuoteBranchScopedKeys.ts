import { MigrationInterface, QueryRunner } from 'typeorm';
export class QuoteBranchScopedKeys1713760000037 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const table of ['quotes', 'line_quotes']) {
      await q.query(`UPDATE ${table} q SET branch_id=t.branch_id FROM tenders t WHERE t.id=q.tender_id AND q.branch_id IS NULL`);
      const [row] = await q.query(`SELECT count(*)::int AS invalid FROM ${table} q LEFT JOIN tenders t ON t.id=q.tender_id
        WHERE q.branch_id IS NULL OR t.id IS NULL OR q.branch_id<>t.branch_id`);
      if (row.invalid) throw new Error(`Cannot scope ${table}: ${row.invalid} rows have missing or inconsistent institution ownership`);
      await q.query(`ALTER TABLE ${table} ALTER COLUMN branch_id SET NOT NULL`);
      // Also handles installations whose constraints were named by TypeORM synchronize.
      const constraints = await q.query(`SELECT c.conname FROM pg_constraint c JOIN pg_attribute a
        ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.conrelid=$1::regclass AND c.contype='u' AND array_length(c.conkey,1)=1 AND a.attname='quote_no'`, [table]);
      for (const c of constraints) await q.query(`ALTER TABLE ${table} DROP CONSTRAINT "${String(c.conname).replace(/"/g, '""')}"`);
      await q.query(`CREATE UNIQUE INDEX uq_${table}_branch_quote_no ON ${table}(branch_id,quote_no)`);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    // Rollback intentionally fails if different institutions now share a number.
    for (const table of ['quotes', 'line_quotes']) {
      await q.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_quote_no_key UNIQUE(quote_no)`);
      await q.query(`DROP INDEX uq_${table}_branch_quote_no`);
      await q.query(`ALTER TABLE ${table} ALTER COLUMN branch_id DROP NOT NULL`);
    }
  }
}
