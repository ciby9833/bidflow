import { MigrationInterface, QueryRunner } from 'typeorm';
export class BrazilTaxIdentity1713750000036 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // No new tax-identity policy: existing suppliers may share a tax identifier.
    // Keep the migration identity for installations which already ran it;
    // migration 42 removes their index. Fresh upgrades must not create it first.
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP INDEX IF EXISTS uq_supplier_br_cnpj'); }
}
