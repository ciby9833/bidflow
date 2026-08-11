/**
 * 文件：backend/src/migrations/1713690000030-TenderHallVisibilityScope.ts
 * 功能：为招标增加大厅公开范围（本机构 / 指定机构 / 全球），使多机构下的公开语义可控。
 * 交互：被 hall.service.ts 用于过滤公开招标；由 tender.service.ts 在创建与编辑时写入。
 * 作者：吴川
 *
 * 背景：
 * 单机构时期「大厅可见」等价于「对所有访客可见」，因为大厅无鉴权且只有一个机构。
 * 多机构下这个含义会漂移成「对全世界可见」，各国机构未必接受，因此把范围显式化。
 *
 * 回填为 global 而非默认值 branch：
 * 存量招标当前在公开大厅上确实人人可见，回填 branch 会让它们在升级当天从大厅消失 ——
 * 那是可见的业务行为变化。新建招标才采用更保守的 branch 默认值。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderHallVisibilityScope1713690000030 implements MigrationInterface {
  name = 'TenderHallVisibilityScope1713690000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenders ADD COLUMN IF NOT EXISTS hall_visibility VARCHAR(20) NOT NULL DEFAULT 'branch'
    `);
    await queryRunner.query(`
      ALTER TABLE tenders DROP CONSTRAINT IF EXISTS chk_tenders_hall_visibility
    `);
    await queryRunner.query(`
      ALTER TABLE tenders ADD CONSTRAINT chk_tenders_hall_visibility
        CHECK (hall_visibility IN ('branch', 'branches', 'global'))
    `);

    // 指定机构范围时的附加可见机构。用数组列而非关联表：
    // 该字段只被"判断某机构是否在列表内"这一种查询使用，关联表带来的连接成本与维护量并不划算。
    await queryRunner.query(`
      ALTER TABLE tenders ADD COLUMN IF NOT EXISTS hall_visible_branches UUID[] NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN tenders.hall_visibility IS
        'branch=仅本机构可见；branches=本机构加 hall_visible_branches 列出的机构；global=所有访客可见（含未登录）'
    `);

    // 存量：保持现有的公开行为不变
    await queryRunner.query(`
      UPDATE tenders SET hall_visibility = 'global' WHERE is_hall_visible = true
    `);

    // 大厅按机构筛选是高频查询，建部分索引只覆盖公开中的招标
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tenders_hall_visibility
      ON tenders(hall_visibility, branch_id) WHERE is_hall_visible = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tenders_hall_visibility`);
    await queryRunner.query(`ALTER TABLE tenders DROP CONSTRAINT IF EXISTS chk_tenders_hall_visibility`);
    await queryRunner.query(`ALTER TABLE tenders DROP COLUMN IF EXISTS hall_visible_branches`);
    await queryRunner.query(`ALTER TABLE tenders DROP COLUMN IF EXISTS hall_visibility`);
  }
}
