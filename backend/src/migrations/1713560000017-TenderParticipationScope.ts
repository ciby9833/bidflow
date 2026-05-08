/**
 * 文件：backend/src/migrations/1713560000017-TenderParticipationScope.ts
 * 功能：为招标增加按轮次的供应商参与范围。
 * 交互：配合 Tender.participationMode 与 Invitation.roundNo 控制公开/定向参与。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderParticipationScope1713560000017 implements MigrationInterface {
  name = 'TenderParticipationScope1713560000017';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS participation_mode VARCHAR(20) NOT NULL DEFAULT 'all'`);
    await qr.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS round_no INT NOT NULL DEFAULT 1`);
    await qr.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual'`);
    await qr.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'invitations'
          AND tc.constraint_type = 'UNIQUE'
          AND tc.constraint_name LIKE '%tender_id%supplier_id%'
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE invitations DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_tender_round_supplier ON invitations(tender_id, round_no, supplier_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_invitations_supplier_round ON invitations(supplier_id, round_no)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_invitations_supplier_round`);
    await qr.query(`DROP INDEX IF EXISTS idx_invitations_tender_round_supplier`);
    await qr.query(`ALTER TABLE invitations DROP COLUMN IF EXISTS source`);
    await qr.query(`ALTER TABLE invitations DROP COLUMN IF EXISTS round_no`);
    await qr.query(`ALTER TABLE tenders DROP COLUMN IF EXISTS participation_mode`);
  }
}
