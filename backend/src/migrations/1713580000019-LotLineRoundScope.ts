/**
 * 文件：backend/src/migrations/1713580000019-LotLineRoundScope.ts
 * 功能：为标包线路增加轮次维度，使每一轮的线路结构独立存储、互不覆盖。
 * 交互：配合 LotLine.roundNo；发起下一轮时克隆线路，评审/导出按轮次读取。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class LotLineRoundScope1713580000019 implements MigrationInterface {
  name = 'LotLineRoundScope1713580000019';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE lot_lines ADD COLUMN IF NOT EXISTS round_no INT NOT NULL DEFAULT 1`);
    // 存量线路代表各招标的“当前结构”，把它们归到所属招标的当前轮次。
    await qr.query(`
      UPDATE lot_lines ll
      SET round_no = t.current_quote_round
      FROM tenders t
      WHERE ll.tender_id = t.id AND t.current_quote_round > 1
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_lot_lines_lot_round ON lot_lines(lot_id, round_no, is_active)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_lot_lines_lot_round`);
    await qr.query(`ALTER TABLE lot_lines DROP COLUMN IF EXISTS round_no`);
  }
}
