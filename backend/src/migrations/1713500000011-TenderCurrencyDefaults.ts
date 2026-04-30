/**
 * 文件：backend/src/migrations/1713500000011-TenderCurrencyDefaults.ts
 * 功能：将招标基准币种和标包预算币种默认值调整为印尼盾 IDR。
 * 交互：由 TypeORM migration 执行；配合 tender.service.ts 新建/编辑招标默认币种逻辑。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderCurrencyDefaults1713500000011 implements MigrationInterface {
  name = 'TenderCurrencyDefaults1713500000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tenders ALTER COLUMN base_currency SET DEFAULT 'IDR'");
    await queryRunner.query("ALTER TABLE lots ALTER COLUMN budget_currency SET DEFAULT 'IDR'");
    await queryRunner.query("UPDATE tenders SET base_currency = 'IDR' WHERE base_currency IS NULL OR base_currency = 'CNY'");
    await queryRunner.query("UPDATE lots SET budget_currency = 'IDR' WHERE budget_currency IS NULL OR budget_currency = 'CNY'");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE tenders ALTER COLUMN base_currency SET DEFAULT 'CNY'");
    await queryRunner.query('ALTER TABLE lots ALTER COLUMN budget_currency DROP DEFAULT');
  }
}
