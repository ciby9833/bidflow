/**
 * Locks one supplier to one original quote currency for a tender round.
 * The scope intentionally spans every lot and line in the round.
 */
import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('supplier_round_currencies')
@Index(
  'uq_supplier_round_currencies_scope',
  ['tenderId', 'roundNo', 'supplierId'],
  { unique: true },
)
export class SupplierRoundCurrency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'round_no', type: 'int' })
  roundNo: number;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
