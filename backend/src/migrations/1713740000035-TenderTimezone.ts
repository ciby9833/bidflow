import { MigrationInterface, QueryRunner } from 'typeorm';
export class TenderTimezone1713740000035 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS timezone varchar(100)`);
    await q.query(`UPDATE tenders t SET timezone=COALESCE(b.settings->>'timezone', CASE b.country_code
      WHEN 'ID' THEN 'Asia/Jakarta' WHEN 'VN' THEN 'Asia/Ho_Chi_Minh' WHEN 'CN' THEN 'Asia/Shanghai'
      WHEN 'BR' THEN 'America/Sao_Paulo' ELSE 'UTC' END)
      FROM branches b WHERE b.id=t.branch_id AND t.timezone IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('ALTER TABLE tenders DROP COLUMN IF EXISTS timezone'); }
}
