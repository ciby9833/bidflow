/**
 * 文件：backend/src/migrations/1713680000029-UserLastBranch.ts
 * 功能：记录用户上次进入的机构，使多机构用户再次登录时无需重复选择。
 * 交互：由 auth.service.ts 在登录与切换机构时写入；对应 user.entity.ts 的 lastBranchId。
 * 作者：吴川
 *
 * 存放在服务端而非浏览器：机构上下文由 jwt.strategy.ts 在服务端解析，默认进哪个机构必须服务端可知。
 * 放 localStorage 会随设备丢失，且客户端值仍需服务端校验，徒增一次往返与不一致的可能。
 *
 * ON DELETE SET NULL：机构被删除时清空该偏好，用户下次登录回到选择页，
 * 而不是留着一个悬空 ID 让登录流程走进无法解析的分支。
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLastBranch1713680000029 implements MigrationInterface {
  name = 'UserLastBranch1713680000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_branch_id UUID
        REFERENCES branches(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN users.last_branch_id IS
        '上次进入的机构。多机构用户再次登录时直接进入该机构；为空或已失去权限时回到机构选择页。'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS last_branch_id`);
  }
}
