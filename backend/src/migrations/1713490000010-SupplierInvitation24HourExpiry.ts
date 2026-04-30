/**
 * 文件：backend/src/migrations/1713490000010-SupplierInvitation24HourExpiry.ts
 * 功能：将供应商成员邀请码有效期统一调整为创建后 24 小时，并标记历史过期邀请码。
 * 交互：由 TypeORM migration 执行；配合 supplier.service.ts 的邀请码创建、查询和作废逻辑。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierInvitation24HourExpiry1713490000010 implements MigrationInterface {
  name = 'SupplierInvitation24HourExpiry1713490000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE supplier_invitations
      SET expires_at = created_at + INTERVAL '24 hours'
      WHERE status = 'pending'
        AND (expires_at IS NULL OR expires_at > created_at + INTERVAL '24 hours')
    `);
    await queryRunner.query(`
      UPDATE supplier_invitations
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
    `);
  }

  public async down(): Promise<void> {
    // 数据有效期策略迁移不可安全回滚，保留当前邀请码状态。
  }
}
