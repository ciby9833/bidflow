import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreOptionalTaxIdentity1713810000042 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Restore the original tax-id policy without changing or deleting supplier records.
    await q.query('DROP INDEX IF EXISTS uq_supplier_br_cnpj');
  }
  async down(): Promise<void> {
    throw new Error('Restoring tax-id uniqueness requires business approval and a duplicate audit');
  }
}
