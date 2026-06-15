/**
 * 文件：backend/src/migrations/1713600000021-TenderNotificationLogs.ts
 * 功能：新增招标邮件通知发送日志表，支持撤回时判断是否提示补发撤回提醒。
 * 交互：配合 TenderNotificationLog 实体和 tender.service.ts 邮件发送流程。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderNotificationLogs1713600000021 implements MigrationInterface {
  name = 'TenderNotificationLogs1713600000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tender_notification_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tender_id UUID NOT NULL,
        round_no INT NOT NULL DEFAULT 1,
        type VARCHAR(30) NOT NULL,
        trigger VARCHAR(30) NOT NULL,
        supplier_count INT NOT NULL DEFAULT 0,
        account_count INT NOT NULL DEFAULT 0,
        sent_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        created_by UUID,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_tender_notification_logs_tender_round_type ON tender_notification_logs(tender_id, round_no, type)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_tender_notification_logs_tender_round_type');
    await queryRunner.query('DROP TABLE IF EXISTS tender_notification_logs');
  }
}
