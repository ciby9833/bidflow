import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenderDeadlineChanges1713730000034 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE tender_deadline_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      branch_id uuid NOT NULL, tender_id uuid NOT NULL, round_no integer NOT NULL,
      old_status varchar(20) NOT NULL, new_status varchar(20) NOT NULL,
      old_deadline timestamptz, new_deadline timestamptz NOT NULL,
      reason varchar(2000) NOT NULL, announcement varchar(4000) NOT NULL,
      timezone varchar(100) NOT NULL, actor_id uuid NOT NULL, actor_name varchar(200) NOT NULL,
      request_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(tender_id, request_key)
    )`);
    await q.query('CREATE INDEX idx_deadline_changes_tender ON tender_deadline_changes(tender_id, created_at DESC)');
    await q.query(`CREATE TABLE tender_deadline_mail (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), change_id uuid NOT NULL REFERENCES tender_deadline_changes(id),
      recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(), last_error text,
      UNIQUE(change_id, recipient)
    )`);
    await q.query('CREATE INDEX idx_deadline_mail_pending ON tender_deadline_mail(status, available_at)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE tender_deadline_mail');
    await q.query('DROP TABLE tender_deadline_changes');
  }
}
