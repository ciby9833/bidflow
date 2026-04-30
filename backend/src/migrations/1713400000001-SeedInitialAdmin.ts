/**
 * 文件：backend/src/migrations/1713400000001-SeedInitialAdmin.ts
 * 功能：初始化公司管理员账号，供首次部署后进入系统使用。
 * 交互：由 TypeORM migration 命令执行；写入 users 表；密码采用 argon2 哈希保存。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';
import * as argon2 from 'argon2';

export class SeedInitialAdmin1713400000001 implements MigrationInterface {
  name = 'SeedInitialAdmin1713400000001';

  public async up(qr: QueryRunner): Promise<void> {
    const email = 'noelgfr@gmail.com';
    const passwordHash = await argon2.hash('xiaotao4vip');

    await qr.query(
      `
        INSERT INTO users (
          email,
          password_hash,
          role,
          status,
          display_name,
          locale,
          otp_code,
          otp_expires_at,
          otp_fail_count
        )
        SELECT
          CAST($1 AS VARCHAR(100)),
          CAST($2 AS TEXT),
          'super_admin',
          'active',
          CAST($3 AS VARCHAR(100)),
          'en',
          NULL,
          NULL,
          0
        WHERE NOT EXISTS (
          SELECT 1 FROM users WHERE email = CAST($1 AS VARCHAR(100))
        )
      `,
      [email, passwordHash, 'Xavier'],
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM users WHERE email = $1`, ['noelgfr@gmail.com']);
  }
}
