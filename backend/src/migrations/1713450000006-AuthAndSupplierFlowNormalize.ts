/**
 * 文件：backend/src/migrations/1713450000006-AuthAndSupplierFlowNormalize.ts
 * 功能：按当前业务规则规范账号与供应商默认状态，并允许供应商注册后再补充主体资料。
 * 交互：修正 users 与 suppliers 表默认值；供后续统一注册与认证流程使用。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthAndSupplierFlowNormalize1713450000006 implements MigrationInterface {
  name = 'AuthAndSupplierFlowNormalize1713450000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active'`);
    await queryRunner.query(`UPDATE users SET status = 'active' WHERE status = 'pending_verify'`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN legal_name DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN short_name DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN status SET DEFAULT 'active'`);
    await queryRunner.query(`UPDATE suppliers SET status = 'active' WHERE status = 'pending'`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN review_status SET DEFAULT 'not_submitted'`);
    await queryRunner.query(`
      UPDATE suppliers s
      SET review_status = 'not_submitted'
      WHERE s.review_status = 'pending_review'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_documents d WHERE d.supplier_id = s.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending_verify'`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN legal_name SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN short_name SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN status SET DEFAULT 'pending'`);
    await queryRunner.query(`ALTER TABLE suppliers ALTER COLUMN review_status SET DEFAULT 'pending_review'`);
    await queryRunner.query(`
      UPDATE suppliers
      SET review_status = 'pending_review'
      WHERE review_status = 'not_submitted'
    `);
  }
}
