/**
 * 文件：backend/src/migrations/1713530000014-TenderBidStartAt.ts
 * 功能：新增报价开始时间字段，区分供应商可报价时间与开标/评审时间。
 * 交互：由 TypeORM migration 执行；配合 tender.entity.ts、tender.service.ts 和 TenderCreateView.vue。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderBidStartAt1713530000014 implements MigrationInterface {
  name = 'TenderBidStartAt1713530000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS bid_start_at TIMESTAMPTZ');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenders DROP COLUMN IF EXISTS bid_start_at');
  }
}
