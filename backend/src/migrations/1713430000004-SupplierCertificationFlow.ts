/**
 * 文件：backend/src/migrations/1713430000004-SupplierCertificationFlow.ts
 * 功能：新增供应商认证资料与审核日志表，支撑供应商提交资料和公司审核流。
 * 交互：由 TypeORM migration 执行；供 supplier.service.ts 管理资料和审核历史。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierCertificationFlow1713430000004 implements MigrationInterface {
  name = 'SupplierCertificationFlow1713430000004';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS supplier_documents (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        doc_type    VARCHAR(50) NOT NULL,
        doc_label   VARCHAR(100) NOT NULL,
        text_value  TEXT,
        file_name   VARCHAR(200),
        file_url    TEXT,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_supplier_documents_supplier ON supplier_documents(supplier_id, sort_order)`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS supplier_review_logs (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        action           VARCHAR(50) NOT NULL,
        review_status    VARCHAR(30),
        operator_user_id UUID,
        operator_role    VARCHAR(50),
        comment          TEXT,
        metadata         JSONB,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_supplier_review_logs_supplier ON supplier_review_logs(supplier_id, created_at DESC)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS supplier_review_logs`);
    await qr.query(`DROP TABLE IF EXISTS supplier_documents`);
  }
}
