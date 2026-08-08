/**
 * 文件：backend/src/migrations/1713640000025-SeedHqMembership.ts
 * 功能：新增 hq_admin 机构角色，并把现有 super_admin 账号授予总部成员资格，完成总部账号初始化。
 * 交互：扩展 branch_members 的角色约束；对应 branch-member.entity.ts 的 BranchMemberRole 枚举。
 * 作者：吴川
 *
 * 说明：
 * 1. 不新建账号、不写死密码 —— 复用现有 super_admin 凭据，避免把明文口令提交进仓库。
 * 2. 总部职能限定为「跨机构只读 + 维护机构与成员」，不持有招标/供应商/报价等业务数据。
 * 3. 同一账号可同时是总部成员与印尼机构成员，这也是首个可用于验证机构切换的多机构用户。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedHqMembership1713640000025 implements MigrationInterface {
  name = 'SeedHqMembership1713640000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 放开角色约束，纳入总部管理员
    await queryRunner.query(`
      ALTER TABLE branch_members DROP CONSTRAINT IF EXISTS chk_branch_members_role
    `);
    await queryRunner.query(`
      ALTER TABLE branch_members ADD CONSTRAINT chk_branch_members_role CHECK (
        role IN ('hq_admin', 'super_admin', 'purchase_manager', 'purchase_staff', 'evaluator')
      )
    `);

    // 注：「hq_admin 只能出现在总部」无法用 CHECK 表达（PostgreSQL 的 CHECK 不支持子查询），
    // 改由 organization.service.ts 在分配成员时校验；此处不引入触发器，避免为低频管理动作增加隐式逻辑。

    // 授予现有 super_admin 总部成员资格（幂等）
    await queryRunner.query(`
      INSERT INTO branch_members (branch_id, auth_user_id, role)
      SELECT b.id, u.id, 'hq_admin'
      FROM users u
      CROSS JOIN branches b
      WHERE b.type = 'HQ'
        AND u.account_type = 'company_user'
        AND u.role::text = 'super_admin'
        AND u.status = 'active'
      ON CONFLICT (branch_id, auth_user_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM branch_members
      WHERE role = 'hq_admin'
        AND branch_id IN (SELECT id FROM branches WHERE type = 'HQ')
    `);
    await queryRunner.query(`
      ALTER TABLE branch_members DROP CONSTRAINT IF EXISTS chk_branch_members_role
    `);
    await queryRunner.query(`
      ALTER TABLE branch_members ADD CONSTRAINT chk_branch_members_role CHECK (
        role IN ('super_admin', 'purchase_manager', 'purchase_staff', 'evaluator')
      )
    `);
  }
}
