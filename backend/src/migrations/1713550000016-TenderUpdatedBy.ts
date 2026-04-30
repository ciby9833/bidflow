/**
 * 文件：backend/src/migrations/1713550000016-TenderUpdatedBy.ts
 * 功能：为招标增加最后修改人字段，并用创建人回填历史数据。
 * 交互：支持招标列表展示创建人/修改人。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderUpdatedBy1713550000016 implements MigrationInterface {
  name = 'TenderUpdatedBy1713550000016';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id)');
    await qr.query('UPDATE tenders SET updated_by = created_by WHERE updated_by IS NULL');
    await qr.query('CREATE INDEX IF NOT EXISTS idx_tenders_updated_by ON tenders(updated_by)');
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP INDEX IF EXISTS idx_tenders_updated_by');
    await qr.query('ALTER TABLE tenders DROP COLUMN IF EXISTS updated_by');
  }
}
