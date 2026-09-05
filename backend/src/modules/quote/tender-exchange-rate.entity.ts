/** A provider response locked for one currency pair in one tender round. */
import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tender_exchange_rates')
@Index(
  'uq_tender_exchange_rates_pair',
  ['tenderId', 'roundNo', 'fromCurrency', 'toCurrency'],
  { unique: true },
)
export class TenderExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'tender_id', type: 'uuid' })
  tenderId: string;

  @Column({ name: 'round_no', type: 'int' })
  roundNo: number;

  @Column({ name: 'from_currency', type: 'char', length: 3 })
  fromCurrency: string;

  @Column({ name: 'to_currency', type: 'char', length: 3 })
  toCurrency: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 24, scale: 12 })
  exchangeRate: number;

  @Column({ name: 'rate_date', type: 'date' })
  rateDate: string;

  @Column({ type: 'varchar', length: 60 })
  source: string;

  @CreateDateColumn({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}
