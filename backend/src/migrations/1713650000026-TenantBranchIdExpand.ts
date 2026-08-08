/**
 * 文件：backend/src/migrations/1713650000026-TenantBranchIdExpand.ts
 * 功能：为招标/报价域的租户表加上 branch_id 并回填存量数据到印尼机构，是机构级数据隔离的地基。
 * 交互：机构来源见 branches 表；后续查询隔离与唯一键改造依赖本列。
 * 作者：吴川
 *
 * 本迁移只做 expand + backfill，刻意不做以下动作（留待后续独立发布）：
 * - 不加 NOT NULL：存量代码尚未写入该列，加约束会让所有新增操作立即失败。
 * - 不改唯一键：tender_no 仍保持全局唯一，改成 (branch_id, tender_no) 需等写入侧就绪。
 * - 不加任何查询过滤：本迁移对现有业务行为零影响。
 *
 * 冗余设计说明：
 * 子表本可通过 join tenders 推导机构，但业务代码中存在大量 findOne({where:{id}}) 形式的按 ID 直查
 * （实测 134 处数据访问点），若依赖 join，每一处都要改写查询结构。
 * 在每张表冗余 branch_id 后，按 ID 直查只需追加一个等值条件即可闭合，代价是需保证父子写入一致。
 * suppliers 刻意不在此列 —— 供应商为全局主档，其机构归属由供应商机构档案表承载（见供应商拆表阶段）。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

/** 招标/报价域租户表。均含 tender_id，可由招标推导机构归属。 */
const CHILD_TABLES = [
  'lots',
  'lot_lines',
  'quotes',
  'line_quotes',
  'invitations',
  'lot_quote_attachments',
  'ranking_snapshots',
  'tender_notification_logs',
];

export class TenantBranchIdExpand1713650000026 implements MigrationInterface {
  name = 'TenantBranchIdExpand1713650000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['tenders', ...CHILD_TABLES, 'audit_log'];

    for (const table of tables) {
      await queryRunner.query(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id UUID
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_branch_id ON ${table}(branch_id)
      `);
    }

    // ── 回填 ────────────────────────────────────────────────────────────────
    // 当前系统仅印尼一个国家机构，存量业务数据全部归属该机构。
    const [idBranch] = await queryRunner.query(
      `SELECT id FROM branches WHERE code = 'ID' AND type = 'BRANCH'`,
    );
    if (!idBranch?.id) {
      throw new Error('印尼机构不存在，请先执行 BranchAndBranchMember 迁移');
    }

    await queryRunner.query(
      `UPDATE tenders SET branch_id = $1 WHERE branch_id IS NULL`,
      [idBranch.id],
    );

    // 子表从招标推导，而非直接写死机构：
    // 这样即使未来存在多机构数据，回填逻辑依然正确，也明确表达了「机构归属跟随招标」的语义。
    for (const table of CHILD_TABLES) {
      await queryRunner.query(`
        UPDATE ${table} c
        SET branch_id = t.branch_id
        FROM tenders t
        WHERE c.tender_id = t.id AND c.branch_id IS NULL
      `);
    }

    // 审计日志无招标关联，按当前唯一国家机构回填。
    await queryRunner.query(
      `UPDATE audit_log SET branch_id = $1 WHERE branch_id IS NULL`,
      [idBranch.id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['tenders', ...CHILD_TABLES, 'audit_log'];
    for (const table of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${table}_branch_id`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS branch_id`);
    }
  }
}
