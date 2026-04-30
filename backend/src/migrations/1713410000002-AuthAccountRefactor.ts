/**
 * 文件：backend/src/migrations/1713410000002-AuthAccountRefactor.ts
 * 功能：现有 users 表为统一认证账号表语义，并新增公司员工/供应商成员映射表。
 * 交互：由 TypeORM migration 执行；为统一登录、员工资料、供应商子账号扩展提供底层结构。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthAccountRefactor1713410000002 implements MigrationInterface {
  name = 'AuthAccountRefactor1713410000002';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_name VARCHAR(100)`);
    await qr.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(30) NOT NULL DEFAULT 'company_user'`);
    await qr.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS register_source VARCHAR(30) NOT NULL DEFAULT 'internal_created'`);
    await qr.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50)`);

    await qr.query(`UPDATE users SET login_name = email WHERE login_name IS NULL`);
    await qr.query(`
      UPDATE users
      SET account_type = CASE WHEN role = 'supplier' THEN 'supplier_account' ELSE 'company_user' END
      WHERE account_type IS NULL OR account_type = 'company_user'
    `);
    await qr.query(`
      UPDATE users
      SET register_source = CASE WHEN role = 'supplier' THEN 'external_signup' ELSE 'internal_created' END
      WHERE register_source IS NULL OR register_source = 'internal_created'
    `);

    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name ON users(login_name)`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS company_users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_user_id  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        company_name  VARCHAR(200),
        full_name     VARCHAR(100) NOT NULL,
        employee_id   VARCHAR(50) UNIQUE,
        status        VARCHAR(30) NOT NULL DEFAULT 'active',
        created_by    UUID,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS supplier_accounts (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        display_name        VARCHAR(100),
        is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
        status              VARCHAR(30) NOT NULL DEFAULT 'active',
        created_by_user_id  UUID REFERENCES users(id),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`
      INSERT INTO company_users (auth_user_id, company_name, full_name, employee_id, status, created_by)
      SELECT
        u.id,
        'BidFlow',
        u.display_name,
        COALESCE(u.employee_id, CONCAT('EMP-', LPAD(ROW_NUMBER() OVER (ORDER BY u.created_at)::TEXT, 4, '0'))),
        CASE WHEN u.status = 'suspended' THEN 'disabled' ELSE 'active' END,
        NULL
      FROM users u
      WHERE u.role <> 'supplier'
        AND NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu.auth_user_id = u.id)
    `);

    await qr.query(`
      INSERT INTO supplier_accounts (auth_user_id, supplier_id, display_name, is_primary, status, created_by_user_id)
      SELECT
        u.id,
        u.supplier_id,
        u.display_name,
        TRUE,
        CASE WHEN u.status = 'suspended' THEN 'disabled' ELSE 'active' END,
        NULL
      FROM users u
      WHERE u.supplier_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM supplier_accounts sa WHERE sa.auth_user_id = u.id)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS supplier_accounts`);
    await qr.query(`DROP TABLE IF EXISTS company_users`);
    await qr.query(`DROP INDEX IF EXISTS idx_users_employee_id`);
    await qr.query(`DROP INDEX IF EXISTS idx_users_login_name`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS employee_id`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS token_version`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS register_source`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS account_type`);
    await qr.query(`ALTER TABLE users DROP COLUMN IF EXISTS login_name`);
  }
}
