import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Tender } from '../tender/tender.entity';

/** Hold a shared tender lock until the bid transaction commits. Lifecycle writes
 * must wait, and a bid that waited for a lifecycle change must recheck admission. */
export async function lockQuoteAdmission(em: EntityManager, tender: Pick<Tender, 'id' | 'branchId' | 'currentQuoteRound'>) {
  const [live] = await em.query(`SELECT status,current_quote_round,bid_deadline,bid_start_at
    FROM tenders WHERE id=$1 AND branch_id=$2 FOR SHARE`, [tender.id,tender.branchId]);
  const [{ now }] = await em.query('SELECT clock_timestamp() AS now');
  if (!live || live.current_quote_round !== (tender.currentQuoteRound ?? 1) ||
      live.status !== 'open' || (live.bid_deadline && live.bid_deadline <= now) ||
      (live.bid_start_at && live.bid_start_at > now)) {
    throw new ForbiddenException('error.quote.tender_not_open');
  }
}
