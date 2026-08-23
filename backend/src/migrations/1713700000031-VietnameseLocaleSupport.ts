/**
 * 文件：backend/src/migrations/1713700000031-VietnameseLocaleSupport.ts
 * 功能：将已存在的越南机构默认语言设置为 vi-VN，使机构级默认配置与新增越南语资源保持一致。
 * 交互：更新 branches.settings.defaultLocale；前后端 locale 规范化与词库均支持 vi-VN。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class VietnameseLocaleSupport1713700000031 implements MigrationInterface {
  name = 'VietnameseLocaleSupport1713700000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE branches
      SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{defaultLocale}', '"vi-VN"'::jsonb, true)
      WHERE code = 'VN' AND type = 'BRANCH'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE branches
      SET settings = settings - 'defaultLocale'
      WHERE code = 'VN' AND type = 'BRANCH' AND settings->>'defaultLocale' = 'vi-VN'
    `);
  }
}
