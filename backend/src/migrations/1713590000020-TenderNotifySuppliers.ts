/**
 * 文件：backend/src/migrations/1713590000020-TenderNotifySuppliers.ts
 * 功能：为招标草稿增加发布时是否邮件通知供应商的显式开关。
 * 交互：配合 Tender.notifySuppliers、TenderCreateView.vue 和发布邮件逻辑使用。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderNotifySuppliers1713590000020 implements MigrationInterface {
  name = 'TenderNotifySuppliers1713590000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS notify_suppliers BOOLEAN NOT NULL DEFAULT false');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenders DROP COLUMN IF EXISTS notify_suppliers');
  }
}
