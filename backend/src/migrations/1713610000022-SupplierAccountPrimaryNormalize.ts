/**
 * 文件：backend/src/migrations/1713610000022-SupplierAccountPrimaryNormalize.ts
 * 功能：规范供应商账号主账号数据，并约束每个供应商最多一个活跃主账号。
 * 交互：配合 supplier.service.ts 的批量导入和成员管理逻辑，修复历史导入产生的多个主账号。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierAccountPrimaryNormalize1713610000022 implements MigrationInterface {
  name = 'SupplierAccountPrimaryNormalize1713610000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY supplier_id
            ORDER BY is_primary DESC, (relation_role = 'owner') DESC, created_at ASC, id ASC
          ) AS rn
        FROM supplier_accounts
        WHERE status = 'active'
      )
      UPDATE supplier_accounts sa
      SET
        is_primary = ranked.rn = 1,
        relation_role = CASE WHEN ranked.rn = 1 THEN 'owner' ELSE sa.relation_role END
      FROM ranked
      WHERE sa.id = ranked.id
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          auth_user_id,
          supplier_id,
          ROW_NUMBER() OVER (
            PARTITION BY auth_user_id
            ORDER BY is_primary DESC, created_at ASC, id ASC
          ) AS rn
        FROM supplier_accounts
        WHERE status = 'active'
      )
      UPDATE users u
      SET supplier_id = ranked.supplier_id
      FROM ranked
      WHERE u.id = ranked.auth_user_id
        AND ranked.rn = 1
        AND u.supplier_id IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_accounts_one_active_primary
      ON supplier_accounts(supplier_id)
      WHERE status = 'active' AND is_primary = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_accounts_one_active_primary`);
  }
}
