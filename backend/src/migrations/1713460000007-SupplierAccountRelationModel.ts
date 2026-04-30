/**
 * 文件：backend/src/migrations/1713460000007-SupplierAccountRelationModel.ts
 * 功能：把 supplier_accounts 明确调整为账号与供应商主体的关系表，支持一个账号绑定多个供应商。
 * 交互：由 TypeORM migration 执行；配合 supplier-account.entity.ts 和供应商入驻流程使用。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierAccountRelationModel1713460000007 implements MigrationInterface {
  name = 'SupplierAccountRelationModel1713460000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE supplier_accounts ADD COLUMN IF NOT EXISTS relation_role VARCHAR(30) NOT NULL DEFAULT 'operator'`);
    await queryRunner.query(`UPDATE supplier_accounts SET relation_role = CASE WHEN is_primary THEN 'owner' ELSE 'operator' END WHERE relation_role IS NULL OR relation_role = 'operator'`);
    await queryRunner.query(`ALTER TABLE supplier_accounts DROP CONSTRAINT IF EXISTS supplier_accounts_auth_user_id_key`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_accounts_user_supplier ON supplier_accounts(auth_user_id, supplier_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_supplier_accounts_auth_user_id ON supplier_accounts(auth_user_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_supplier_accounts_supplier_id ON supplier_accounts(supplier_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_accounts_supplier_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_accounts_auth_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_accounts_user_supplier`);
    await queryRunner.query(`ALTER TABLE supplier_accounts ADD CONSTRAINT supplier_accounts_auth_user_id_key UNIQUE (auth_user_id)`);
    await queryRunner.query(`ALTER TABLE supplier_accounts DROP COLUMN IF EXISTS relation_role`);
  }
}
