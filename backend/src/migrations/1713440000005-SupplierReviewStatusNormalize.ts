/**
 * 文件：backend/src/migrations/1713440000005-SupplierReviewStatusNormalize.ts
 * 功能：规范供应商认证状态，未提交资料的供应商调整为 not_submitted。
 * 交互：由 TypeORM migration 执行；为注册后先填资料、提交后再审核的流程提供数据兼容。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierReviewStatusNormalize1713440000005 implements MigrationInterface {
  name = 'SupplierReviewStatusNormalize1713440000005';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE suppliers s
      SET review_status = 'not_submitted'
      WHERE s.review_status = 'pending_review'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_documents d WHERE d.supplier_id = s.id
        )
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE suppliers
      SET review_status = 'pending_review'
      WHERE review_status = 'not_submitted'
    `);
  }
}
