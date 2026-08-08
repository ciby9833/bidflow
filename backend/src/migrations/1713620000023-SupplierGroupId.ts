/**
 * 文件：backend/src/migrations/1713620000023-SupplierGroupId.ts
 * 功能：为供应商主档预置集团归属列，支撑同集团不同法人的串标检测与未来的集团级统计。
 * 交互：对应 supplier.entity.ts 的 groupId 字段；多机构改造中本表将演进为供应商法人实体主档，本列随之保留。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierGroupId1713620000023 implements MigrationInterface {
  name = 'SupplierGroupId1713620000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 可空、无默认值、无外键：存量行不受影响，旧代码无感知。
    // 现在不建 supplier_groups 表，仅预留归属列——事后回填需人工判断数千家供应商的集团关系，成本远高于现在加列。
    await queryRunner.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS group_id UUID
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN suppliers.group_id IS
        '集团归属（可空）。用于关联同集团不同法人（如 Bosch 中国 / PT Bosch Indonesia），支撑跨法人串标检测。supplier_groups 表暂不建立，待集团级统计需求出现时增量补充。'
    `);

    // 部分索引：当前全为 NULL 时不占空间，待数据落库后直接支撑按集团聚合的串标检测。
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_group_id
      ON suppliers(group_id)
      WHERE group_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_group_id`);
    await queryRunner.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS group_id`);
  }
}
