/**
 * 文件：backend/src/migrations/1713660000027-SupplierBranchProfile.ts
 * 功能：建立供应商机构档案表，承载供应商在各招标机构中的准入关系，并回填存量供应商到印尼机构。
 * 交互：对应 supplier-branch-profile.entity.ts；branch-context.service.ts 据此解析供应商账号的机构作用域。
 * 作者：吴川
 *
 * 背景：
 * 供应商是「机构下的业务数据」，不是组织成员，因此不进 branch_members。
 * 但供应商账号登录后同样需要机构作用域，其来源就是本表 —— 供应商能看到哪些机构的招标，
 * 取决于它在哪些机构有准入档案。
 *
 * 本期只落最小字段（准入关系 + 状态）。审核状态、评级、黑名单、机构内编号等按机构独立的字段，
 * 待供应商主档拆分阶段再从 suppliers 表迁入，避免一次性改动过大。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierBranchProfile1713660000027 implements MigrationInterface {
  name = 'SupplierBranchProfile1713660000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_branch_profiles (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        supplier_id UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        status      VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_supplier_branch_profiles_status CHECK (status IN ('active', 'inactive'))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_branch_profiles_branch_supplier
      ON supplier_branch_profiles(branch_id, supplier_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_supplier_branch_profiles_supplier
      ON supplier_branch_profiles(supplier_id) WHERE status = 'active'
    `);

    // 回填：当前仅印尼一个国家机构，存量供应商全部归属该机构。
    await queryRunner.query(`
      INSERT INTO supplier_branch_profiles (branch_id, supplier_id)
      SELECT b.id, s.id
      FROM suppliers s
      CROSS JOIN branches b
      WHERE b.code = 'ID' AND b.type = 'BRANCH'
      ON CONFLICT (branch_id, supplier_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_branch_profiles`);
  }
}
