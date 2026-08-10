/**
 * 文件：backend/src/migrations/1713670000028-TenderLotBranchScopedKeys.ts
 * 功能：把招标号与标包号的唯一性从全局收敛到机构内，并对这两张表的 branch_id 加非空约束。
 * 交互：配合 tender.service.ts 的按机构编号生成器；是开设第二个国家机构的前置条件。
 * 作者：吴川
 *
 * 为什么必须做：
 * tender_no 全局唯一意味着两个国家机构共用一个编号空间，越南机构建标时会与印尼撞键，
 * 直接复现历史上那次生产事故（duplicate key value violates unique constraint "tenders_tender_no_key"）。
 *
 * 为什么只做 tenders 和 lots：
 * quotes 的写入路径尚未接入机构作用域，其 branch_id 仍会是 NULL。
 * PostgreSQL 的唯一索引把 NULL 视为互不相同，此时改成 (branch_id, quote_no) 反而会让重复的
 * quote_no 变得合法 —— 约束不升反降。待报价域迁移完成后再单独收口。
 *
 * NOT NULL 的前提：
 * 已确认 Tender / Lot 的全部创建路径都会写入 branch_id，且存量数据无缺失，因此可安全收口。
 * 加上后，"忘记填机构"会变成插入失败的硬错误，而不是静默产生任何人都看不到的无主数据。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderLotBranchScopedKeys1713670000028 implements MigrationInterface {
  name = 'TenderLotBranchScopedKeys1713670000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 收口前置校验：存在无主数据时立即中止，避免加约束失败留下半截状态。
    const [{ orphans }] = await queryRunner.query(`
      SELECT (SELECT COUNT(*) FROM tenders WHERE branch_id IS NULL)
           + (SELECT COUNT(*) FROM lots WHERE branch_id IS NULL) AS orphans
    `);
    if (Number(orphans) > 0) {
      throw new Error(`存在 ${orphans} 行无机构归属的招标/标包数据，请先回填后再执行本迁移`);
    }

    await queryRunner.query(`ALTER TABLE tenders ALTER COLUMN branch_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE lots ALTER COLUMN branch_id SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE tenders DROP CONSTRAINT IF EXISTS tenders_tender_no_key`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tenders_branch_tender_no
      ON tenders(branch_id, tender_no)
    `);

    await queryRunner.query(`ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_lot_no_key`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_branch_lot_no
      ON lots(branch_id, lot_no)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_lots_branch_lot_no`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_tenders_branch_tender_no`);
    // 还原全局唯一：仅在数据确实无跨机构重号时才能成功，符合回滚语义。
    await queryRunner.query(`ALTER TABLE lots ADD CONSTRAINT lots_lot_no_key UNIQUE (lot_no)`);
    await queryRunner.query(`ALTER TABLE tenders ADD CONSTRAINT tenders_tender_no_key UNIQUE (tender_no)`);
    await queryRunner.query(`ALTER TABLE lots ALTER COLUMN branch_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE tenders ALTER COLUMN branch_id DROP NOT NULL`);
  }
}
