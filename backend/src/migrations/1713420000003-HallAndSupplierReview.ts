/**
 * 文件：backend/src/migrations/1713420000003-HallAndSupplierReview.ts
 * 功能：补充供应商审核字段和大厅公开展示字段，支撑供应商注册审核与公开大厅。
 * 交互：由 TypeORM migration 执行；为 hall 接口、供应商审核流与前端大厅/注册页提供数据基础。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class HallAndSupplierReview1713420000003 implements MigrationInterface {
  name = 'HallAndSupplierReview1713420000003';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review'`);
    await qr.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID`);
    await qr.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
    await qr.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS review_comment TEXT`);
    await qr.query(`
      UPDATE suppliers
      SET review_status = CASE
        WHEN status = 'active' THEN 'approved'
        WHEN status = 'pending' THEN 'pending_review'
        ELSE 'rejected'
      END
      WHERE review_status IS NULL OR review_status = 'pending_review'
    `);

    await qr.query(`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS is_hall_visible BOOLEAN NOT NULL DEFAULT FALSE`);
    await qr.query(`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS hall_summary TEXT`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenders DROP COLUMN IF EXISTS hall_summary`);
    await qr.query(`ALTER TABLE tenders DROP COLUMN IF EXISTS is_hall_visible`);
    await qr.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS review_comment`);
    await qr.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS reviewed_at`);
    await qr.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS reviewed_by_user_id`);
    await qr.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS review_status`);
  }
}
