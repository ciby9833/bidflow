import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import { BranchScope, requireWritableBranch } from '../../shared/tenant/branch-scope';
import { AuditContext } from '../../shared/audit/audit.service';
import { MailService } from '../../shared/mail/mail.service';

export interface DeadlineChangeInput {
  newDeadline: string; reason: string; announcement: string;
  expectedRound: number; expectedStatus: string; expectedUpdatedAt: string; expectedVersion: string;
  idempotencyKey: string;
}

// Exported pure validation so date and state boundaries can be tested without a database.
export function validateDeadlineChange(t: any, input: DeadlineChangeInput, now: Date) {
  if (!['published', 'open', 'closed'].includes(t.status)) throw new BadRequestException('error.tender.deadline_state');
  if (input.expectedVersion !== t.revision || input.expectedRound !== t.current_quote_round || input.expectedStatus !== t.status ||
      new Date(input.expectedUpdatedAt).getTime() !== new Date(t.updated_at).getTime()) {
    throw new ConflictException('error.tender.deadline_conflict');
  }
  const end = new Date(input.newDeadline);
  if (!Number.isFinite(end.getTime()) || end <= now ||
      (t.bid_deadline && end <= new Date(t.bid_deadline)) ||
      (t.bid_start_at && end <= new Date(t.bid_start_at))) {
    throw new BadRequestException('error.tender.deadline_extension_only');
  }
  return t.status === 'published' && t.bid_start_at && new Date(t.bid_start_at) > now ? 'published' : 'open';
}

@Injectable()
export class DeadlineChangeService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(DeadlineChangeService.name);
  constructor(private readonly ds: DataSource, private readonly mail: MailService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.deliver(), 30_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tender(em: EntityManager, id: string, branchId: string, lock = false) {
    const [t] = await em.query(`SELECT t.*, t.xmin::text AS revision, b.settings->>'timezone' AS timezone, b.country_code
      FROM tenders t JOIN branches b ON b.id=t.branch_id
      WHERE t.id=$1 AND t.branch_id=$2 ${lock ? 'FOR UPDATE OF t' : ''}`, [id, branchId]);
    if (!t) throw new NotFoundException('error.tender.not_found');
    t.timezone ||= ({ ID: 'Asia/Jakarta', CN: 'Asia/Shanghai', VN: 'Asia/Ho_Chi_Minh' } as any)[t.country_code] || 'UTC';
    return t;
  }

  // Public tenders notify known responders (not the entire supplier directory).
  // Directed tenders notify every invited supplier; active branch access is required in both cases.
  private async recipients(em: EntityManager, t: any) {
    return em.query(`SELECT DISTINCT lower(trim(u.email)) AS email, u.locale, s.country_code
      FROM supplier_accounts a JOIN users u ON u.id=a.auth_user_id
      JOIN suppliers s ON s.id=a.supplier_id
      JOIN supplier_branch_profiles p ON p.supplier_id=s.id AND p.branch_id=$2 AND p.status='active'
      WHERE a.status='active' AND u.status='active' AND s.status='active' AND s.review_status='approved' AND u.email IS NOT NULL AND trim(u.email)<>''
      AND (( $4='selected' AND EXISTS(SELECT 1 FROM invitations i WHERE i.tender_id=$1 AND i.round_no=$3 AND i.supplier_id=s.id))
        OR ($4='all' AND (EXISTS(SELECT 1 FROM line_quotes l WHERE l.tender_id=$1 AND l.round_no=$3 AND l.supplier_id=s.id)
          OR EXISTS(SELECT 1 FROM quotes q WHERE q.tender_id=$1 AND q.supplier_id=s.id))))`,
      [t.id, t.branch_id, t.current_quote_round, t.participation_mode]);
  }

  async preview(scope: BranchScope, id: string) {
    const t = await this.tender(this.ds.manager, id, requireWritableBranch(scope));
    const [stats] = await this.ds.query(`SELECT count(DISTINCT supplier_id)::int AS suppliers FROM (
      SELECT supplier_id FROM line_quotes WHERE tender_id=$1 AND round_no=$2
      UNION SELECT supplier_id FROM quotes WHERE tender_id=$1) q`, [id, t.current_quote_round]);
    const recipients = await this.recipients(this.ds.manager, t);
    return { tenderNo: t.tender_no, round: t.current_quote_round, status: t.status,
      updatedAt: t.updated_at, version: t.revision, deadline: t.bid_deadline, timezone: t.timezone,
      participationMode: t.participation_mode, quotedSuppliers: stats.suppliers,
      recipientCount: new Set(recipients.map((r: any) => r.email)).size };
  }

  // Controller verifies supplier visibility with TenderService before reading this feed.
  async history(id: string, supplier: boolean) {
    const rows = await this.ds.query(`SELECT c.*,
      (SELECT count(*)::int FROM tender_deadline_mail m WHERE m.change_id=c.id) AS recipients,
      (SELECT count(*)::int FROM tender_deadline_mail m WHERE m.change_id=c.id AND status='sent') AS sent,
      (SELECT count(*)::int FROM tender_deadline_mail m WHERE m.change_id=c.id AND status='failed') AS failed
      FROM tender_deadline_changes c WHERE c.tender_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [id]);
    return rows.map((r: any) => supplier ? {
      id: r.id, round_no: r.round_no, old_deadline: r.old_deadline, new_deadline: r.new_deadline,
      announcement: r.announcement, timezone: r.timezone, created_at: r.created_at,
    } : { ...r, request_hash: undefined, request_key: undefined });
  }

  async change(scope: BranchScope, id: string, input: DeadlineChangeInput, ctx: AuditContext) {
    if (!input || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000 ||
      typeof input.announcement !== 'string' || !input.announcement.trim() || input.announcement.length > 4000 ||
      typeof input.newDeadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(input.newDeadline) ||
      !Number.isInteger(input.expectedRound) || !Number.isFinite(Date.parse(input.expectedUpdatedAt)) ||
      typeof input.expectedVersion !== 'string' || !/^\d+$/.test(input.expectedVersion) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey || '')) {
      throw new BadRequestException('error.tender.deadline_input');
    }
    const branchId = requireWritableBranch(scope);
    const hash = createHash('sha256').update(JSON.stringify([
      input.newDeadline, input.reason.trim(), input.announcement.trim(), input.expectedRound,
      input.expectedStatus, input.expectedUpdatedAt, input.expectedVersion, ctx.userId,
    ])).digest('hex');
    const result = await this.ds.transaction(async em => {
      const t = await this.tender(em, id, branchId, true);
      const [existing] = await em.query('SELECT * FROM tender_deadline_changes WHERE tender_id=$1 AND request_key=$2', [id, input.idempotencyKey]);
      if (existing) {
        if (existing.request_hash !== hash) throw new ConflictException('error.tender.deadline_conflict');
        return { id: existing.id, replayed: true };
      }
      const [{ now }] = await em.query('SELECT clock_timestamp() AS now');
      const status = validateDeadlineChange(t, input, now);
      const [actor] = await em.query('SELECT display_name FROM users WHERE id=$1', [ctx.userId]);
      const [change] = await em.query(`INSERT INTO tender_deadline_changes
        (branch_id,tender_id,round_no,old_status,new_status,old_deadline,new_deadline,reason,announcement,timezone,actor_id,actor_name,request_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [branchId,id,t.current_quote_round,t.status,status,t.bid_deadline,input.newDeadline,input.reason.trim(),input.announcement.trim(),t.timezone,ctx.userId,actor?.display_name || ctx.userId,input.idempotencyKey,hash]);
      await em.query(`UPDATE tenders SET status=$2,bid_deadline=$3,updated_by=$4,updated_at=clock_timestamp() WHERE id=$1`, [id,status,input.newDeadline,ctx.userId]);
      await em.query(`INSERT INTO audit_log(branch_id,entity_type,entity_id,action,user_id,user_role,ip_address,user_agent,before_state,after_state,metadata)
        VALUES($1,'tender',$2,'TENDER_DEADLINE_CHANGE',$3,$4,$5,$6,$7,$8,$9)`,
        [branchId,id,ctx.userId,ctx.userRole,ctx.ipAddress,ctx.userAgent || null,
          JSON.stringify({status:t.status,bidDeadline:t.bid_deadline,round:t.current_quote_round}),
          JSON.stringify({status,bidDeadline:input.newDeadline,round:t.current_quote_round}),
          JSON.stringify({changeId:change.id,reason:input.reason.trim()})]);
      const recipients = await this.recipients(em, t);
      for (const r of recipients) {
        const locale = r.country_code === 'ID' ? 'id-ID' : r.country_code === 'VN' ? 'vi-VN' : r.locale || 'en';
        const labels = locale.startsWith('zh') ? ['报价截止时间已调整','原截止时间','新截止时间','已有报价及报价规则保持不变。'] : locale.startsWith('id') ? ['Batas waktu penawaran diperbarui','Batas waktu sebelumnya','Batas waktu baru','Penawaran dan aturan penawaran yang ada tetap berlaku.'] : locale.startsWith('vi') ? ['Thời hạn báo giá đã thay đổi','Thời hạn cũ','Thời hạn mới','Báo giá và quy tắc báo giá hiện có được giữ nguyên.'] : ['Bid deadline updated','Previous deadline','New deadline','Existing bids and bidding rules remain unchanged.'];
        const fmt = (d: string) => d ? new Date(d).toLocaleString(locale, {timeZone:t.timezone,hour12:false}) : '—';
        const subject = `${labels[0]} · ${t.tender_no}`;
        const body = `${t.title}\n${labels[1]}: ${fmt(t.bid_deadline)}\n${labels[2]}: ${fmt(input.newDeadline)} (${t.timezone})\n\n${input.announcement.trim()}\n\n${labels[3]}`;
        await em.query(`INSERT INTO tender_deadline_mail(change_id,recipient,subject,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [change.id,r.email,subject,body]);
      }
      return { id: change.id, replayed: false };
    });
    return result;
  }

  async retry(scope: BranchScope, id: string, changeId: string) {
    await this.tender(this.ds.manager, id, requireWritableBranch(scope));
    await this.ds.query(`UPDATE tender_deadline_mail SET status='pending',attempts=0,available_at=now()
      WHERE change_id IN (SELECT id FROM tender_deadline_changes WHERE id=$1 AND tender_id=$2) AND status='failed'`, [changeId,id]);
    return { queued: true };
  }

  async deliver() {
    if (this.running) return;
    this.running = true;
    try {
      // Atomic lease permits multiple backend replicas. Delivery is at-least-once after a crash.
      for (let i=0;i<20;i++) {
        const [jobs] = await this.ds.query(`UPDATE tender_deadline_mail SET status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes'
          WHERE id=(SELECT id FROM tender_deadline_mail WHERE status IN ('pending','sending') AND available_at<=now()
            ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
        const job = jobs[0];
        if (!job) break;
        try {
          if (!this.mail.getConfig().host) throw new Error('SMTP is not configured');
          await this.mail.send({to:job.recipient,subject:job.subject,text:job.body});
          await this.ds.query("UPDATE tender_deadline_mail SET status='sent',last_error=NULL WHERE id=$1 AND attempts=$2", [job.id,job.attempts]);
        } catch (e) {
          await this.ds.query(`UPDATE tender_deadline_mail SET status=$2,last_error=$3,available_at=now()+interval '5 minutes' WHERE id=$1 AND attempts=$4`,
            [job.id,job.attempts>=3?'failed':'pending',(e as Error).message.slice(0,1000),job.attempts]);
        }
      }
    } catch (e) { this.logger.warn(`Deadline notification delivery: ${(e as Error).message}`); }
    finally { this.running = false; }
  }
}
