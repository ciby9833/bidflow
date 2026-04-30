/**
 * 文件：backend/src/migrations/1713520000013-FixTenderJoinColumns.ts
 * 功能：统一使用 tender_id 作为招标关联字段。
 * 交互：由 TypeORM migration 执行；配合 lot.entity.ts 与 invitation.entity.ts 的 @JoinColumn({ name: 'tender_id' })。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTenderJoinColumns1713520000013 implements MigrationInterface {
  name = 'FixTenderJoinColumns1713520000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lots' AND column_name = 'tenderId') THEN
          UPDATE lots SET tender_id = "tenderId" WHERE tender_id IS NULL AND "tenderId" IS NOT NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'tenderId') THEN
          UPDATE invitations SET tender_id = "tenderId" WHERE tender_id IS NULL AND "tenderId" IS NOT NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query('ALTER TABLE lots DROP COLUMN IF EXISTS "tenderId"');
    await queryRunner.query('ALTER TABLE invitations DROP COLUMN IF EXISTS "tenderId"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE lots ADD COLUMN IF NOT EXISTS "tenderId" UUID');
    await queryRunner.query('ALTER TABLE invitations ADD COLUMN IF NOT EXISTS "tenderId" UUID');
  }
}
