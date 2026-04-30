/**
 * 文件：backend/src/migrations/1713470000008-SupplierInvitationFlow.ts
 * 功能：新增供应商成员邀请码表，支持公司先建供应商再邀请人员注册/加入。
 * 交互：由 TypeORM migration 执行；配合 supplier-invitation.entity.ts 与供应商入驻流程使用。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierInvitationFlow1713470000008 implements MigrationInterface {
  name = 'SupplierInvitationFlow1713470000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_invitations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token               VARCHAR(80) NOT NULL UNIQUE,
        supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        email               VARCHAR(150),
        relation_role       VARCHAR(30) NOT NULL DEFAULT 'operator',
        status              VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_by_user_id  UUID NOT NULL REFERENCES users(id),
        accepted_by_user_id UUID REFERENCES users(id),
        accepted_at         TIMESTAMPTZ,
        expires_at          TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_supplier_invitations_supplier_id ON supplier_invitations(supplier_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_supplier_invitations_status ON supplier_invitations(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_invitations_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_invitations_supplier_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_invitations`);
  }
}
