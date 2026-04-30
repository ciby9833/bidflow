/**
 * 文件：backend/src/migrations/1713510000012-TenderLotDetailsAndPublicRanking.ts
 * 功能：补充标包报价所需的描述、数量、单位、报价方式，并拆分公开项目与公开排名配置。
 * 交互：由 TypeORM migration 执行；配合 tender.service.ts 和 TenderCreateView.vue 的招标创建/编辑表单。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderLotDetailsAndPublicRanking1713510000012 implements MigrationInterface {
  name = 'TenderLotDetailsAndPublicRanking1713510000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS is_public_ranking_visible BOOLEAN NOT NULL DEFAULT FALSE');
    await queryRunner.query('ALTER TABLE lots ADD COLUMN IF NOT EXISTS description TEXT');
    await queryRunner.query('ALTER TABLE lots ADD COLUMN IF NOT EXISTS quantity NUMERIC(20,4)');
    await queryRunner.query('ALTER TABLE lots ADD COLUMN IF NOT EXISTS unit VARCHAR(50)');
    await queryRunner.query("ALTER TABLE lots ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(40) NOT NULL DEFAULT 'total_price'");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE lots DROP COLUMN IF EXISTS pricing_mode');
    await queryRunner.query('ALTER TABLE lots DROP COLUMN IF EXISTS unit');
    await queryRunner.query('ALTER TABLE lots DROP COLUMN IF EXISTS quantity');
    await queryRunner.query('ALTER TABLE lots DROP COLUMN IF EXISTS description');
    await queryRunner.query('ALTER TABLE tenders DROP COLUMN IF EXISTS is_public_ranking_visible');
  }
}
