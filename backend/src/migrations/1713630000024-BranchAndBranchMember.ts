/**
 * 文件：backend/src/migrations/1713630000024-BranchAndBranchMember.ts
 * 功能：建立多机构骨架——机构表与「用户×机构」成员关系表，并把现有公司用户回填到印尼机构。
 * 交互：对应 branch.entity.ts / branch-member.entity.ts；后续 auth.service.ts 将据此解析登录用户的机构范围与角色。
 * 作者：吴川
 *
 * 设计约束（刻意为之，勿擅改）：
 * 1. 固定两层 HQ / BRANCH，不设 parent_id —— 避免递归 CTE，未来若需「区域」用分组列而非树。
 * 2. 业务数据只挂 BRANCH，HQ 不持有任何招标/供应商/报价数据，仅做跨机构只读汇总。
 * 3. 角色下沉到成员关系行 —— 同一人可在印尼是采购经理、在越南是评审员。users.role 本期保留不动。
 * 4. 供应商不进 branch_members —— 供应商是机构下的业务数据，不是组织成员，其机构归属见 Phase 2。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchAndBranchMember1713630000024 implements MigrationInterface {
  name = 'BranchAndBranchMember1713630000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code         VARCHAR(20)  NOT NULL,
        name         VARCHAR(200) NOT NULL,
        type         VARCHAR(20)  NOT NULL,
        country_code CHAR(2),
        settings     JSONB        NOT NULL DEFAULT '{}'::jsonb,
        status       VARCHAR(20)  NOT NULL DEFAULT 'active',
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_branches_type CHECK (type IN ('HQ', 'BRANCH')),
        CONSTRAINT chk_branches_status CHECK (status IN ('active', 'inactive')),
        -- HQ 无国别；国家机构必须有国别，否则数据归属无从判断
        CONSTRAINT chk_branches_country CHECK (
          (type = 'HQ' AND country_code IS NULL)
          OR (type = 'BRANCH' AND country_code IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_code_idx ON branches(code)
    `);

    // 全系统只允许一个总部
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_single_hq
      ON branches(type) WHERE type = 'HQ'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branch_members (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id    UUID        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        auth_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role         VARCHAR(30) NOT NULL,
        department   VARCHAR(100),
        status       VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by   UUID,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_branch_members_status CHECK (status IN ('active', 'inactive')),
        -- supplier 角色不得出现：供应商不是组织成员
        CONSTRAINT chk_branch_members_role CHECK (
          role IN ('super_admin', 'purchase_manager', 'purchase_staff', 'evaluator')
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_members_branch_user
      ON branch_members(branch_id, auth_user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_branch_members_user
      ON branch_members(auth_user_id) WHERE status = 'active'
    `);

    // ── 种子数据 ────────────────────────────────────────────────────────────
    // settings 取当前系统的既有默认值：货币 IDR（见 tender.entity.ts baseCurrency），
    // 语言 zh-CN（见 user.entity.ts locale），保证后续读取 settings 时行为与现状一致。
    await queryRunner.query(`
      INSERT INTO branches (code, name, type, country_code, settings)
      VALUES
        ('HQ', 'Global Headquarters', 'HQ', NULL,
         '{"timezone":"UTC","defaultLocale":"zh-CN"}'::jsonb),
        ('ID', 'Indonesia', 'BRANCH', 'ID',
         '{"currency":"IDR","timezone":"Asia/Jakarta","defaultLocale":"zh-CN"}'::jsonb)
      ON CONFLICT DO NOTHING
    `);

    // ── 回填 ────────────────────────────────────────────────────────────────
    // 现有公司用户全部归属印尼机构，角色沿用 users.role，保证 Phase 3 切换时行为等价。
    // 供应商账号（account_type='supplier_account'）刻意排除。
    // super_admin 不自动授予 HQ —— 总部成员资格须在 Phase 6 显式分配。
    await queryRunner.query(`
      INSERT INTO branch_members (branch_id, auth_user_id, role)
      SELECT b.id, u.id, u.role::text
      FROM users u
      CROSS JOIN branches b
      WHERE b.code = 'ID'
        AND u.account_type = 'company_user'
        AND u.role::text <> 'supplier'
      ON CONFLICT (branch_id, auth_user_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS branch_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS branches`);
  }
}
