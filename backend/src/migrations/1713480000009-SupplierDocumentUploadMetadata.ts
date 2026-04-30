/**
 * 文件：backend/src/migrations/1713480000009-SupplierDocumentUploadMetadata.ts
 * 功能：为供应商认证资料附件补充对象存储 key、MIME 类型和文件大小。
 * 交互：由 TypeORM migration 执行；配合 upload.controller.ts 和 supplier-document.entity.ts 使用。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierDocumentUploadMetadata1713480000009 implements MigrationInterface {
  name = 'SupplierDocumentUploadMetadata1713480000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS object_key TEXT`);
    await queryRunner.query(`ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)`);
    await queryRunner.query(`ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS file_size INT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE supplier_documents DROP COLUMN IF EXISTS file_size`);
    await queryRunner.query(`ALTER TABLE supplier_documents DROP COLUMN IF EXISTS mime_type`);
    await queryRunner.query(`ALTER TABLE supplier_documents DROP COLUMN IF EXISTS object_key`);
  }
}
