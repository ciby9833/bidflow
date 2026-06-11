#!/usr/bin/env node
/**
 * 给历史定向招标回填邀请关系。
 *
 * 默认 dry-run，只统计缺失邀请；加 --apply 才写 invitations。
 * 默认只处理供应商端可见状态：published/open/closed/awarded，且只处理当前轮次。
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeDraft = args.has('--include-draft') || args.has('--all-statuses');
const includeCancelled = args.has('--include-cancelled') || args.has('--all-statuses');
const tenderId = valueOf('--tender-id');
const source = valueOf('--source') || 'bulk_approved_backfill';

function valueOf(flag) {
  const prefix = `${flag}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function printUsage() {
  console.log(`
Usage:
  npm run tenders:invite-approved -- --dry-run
  npm run tenders:invite-approved -- --apply
  npm run tenders:invite-approved -- --apply --tender-id=<uuid>

Options:
  --dry-run             Preview only. This is the default.
  --apply               Insert missing invitations.
  --tender-id=<uuid>    Only backfill one selected tender.
  --include-draft       Also include draft tenders.
  --include-cancelled   Also include cancelled tenders.
  --all-statuses        Include draft and cancelled tenders too.
  --source=<text>       invitations.source value. Default: bulk_approved_backfill
`);
}

function assertValidUuid(uuid, label) {
  if (!uuid) return;
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  if (!ok) throw new Error(`Invalid ${label}: ${uuid}`);
}

function statuses() {
  const list = ['published', 'open', 'closed', 'awarded'];
  if (includeDraft) list.push('draft');
  if (includeCancelled) list.push('cancelled');
  return list;
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }
  if (!process.env.DB_URL) {
    throw new Error('DB_URL is missing. Put it in backend/.env or export it before running this script.');
  }
  assertValidUuid(tenderId, '--tender-id');

  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();

  const statusList = statuses();
  const baseParams = [statusList];
  const tenderFilter = tenderId ? `AND t.id = $${baseParams.push(tenderId)}` : '';
  const selectedWhere = `
    t.participation_mode = 'selected'
    AND t.status::text = ANY($1::text[])
    ${tenderFilter}
  `;

  try {
    const summary = await client.query(`
      WITH selected_tenders AS (
        SELECT id, tender_no, title, status, current_quote_round
        FROM tenders t
        WHERE ${selectedWhere}
      ),
      approved_suppliers AS (
        SELECT id
        FROM suppliers
        WHERE status = 'active' AND review_status = 'approved'
      ),
      expected AS (
        SELECT
          t.id AS tender_id,
          t.tender_no,
          t.title,
          t.status::text AS status,
          COALESCE(t.current_quote_round, 1) AS round_no,
          s.id AS supplier_id
        FROM selected_tenders t
        CROSS JOIN approved_suppliers s
      ),
      missing AS (
        SELECT e.*
        FROM expected e
        LEFT JOIN invitations i
          ON i.tender_id = e.tender_id
          AND i.round_no = e.round_no
          AND i.supplier_id = e.supplier_id
        WHERE i.id IS NULL
      )
      SELECT
        tender_id AS "tenderId",
        tender_no AS "tenderNo",
        title,
        status,
        round_no AS "roundNo",
        COUNT(*)::int AS "missingInvitations"
      FROM missing
      GROUP BY tender_id, tender_no, title, status, round_no
      ORDER BY tender_no
    `, baseParams);

    const approvedSupplierCount = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM suppliers
      WHERE status = 'active' AND review_status = 'approved'
    `);
    const selectedTenderCount = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM tenders t
      WHERE ${selectedWhere}
    `, baseParams);

    console.log(`Approved active suppliers: ${approvedSupplierCount.rows[0].count}`);
    console.log(`Selected tenders in scope: ${selectedTenderCount.rows[0].count}`);
    console.table(summary.rows);

    const totalMissing = summary.rows.reduce((sum, row) => sum + Number(row.missingInvitations), 0);
    console.log(`Missing invitations: ${totalMissing}`);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to insert missing invitations.');
      return;
    }
    if (totalMissing === 0) {
      console.log('Nothing to backfill.');
      return;
    }

    await client.query('BEGIN');
    const insertParams = [...baseParams, source];
    const sourceParam = insertParams.length;
    const result = await client.query(`
      WITH selected_tenders AS (
        SELECT id, current_quote_round
        FROM tenders t
        WHERE ${selectedWhere}
      ),
      approved_suppliers AS (
        SELECT id
        FROM suppliers
        WHERE status = 'active' AND review_status = 'approved'
      ),
      expected AS (
        SELECT
          t.id AS tender_id,
          COALESCE(t.current_quote_round, 1) AS round_no,
          s.id AS supplier_id
        FROM selected_tenders t
        CROSS JOIN approved_suppliers s
      )
      INSERT INTO invitations (
        tender_id,
        supplier_id,
        round_no,
        source,
        status,
        invited_at
      )
      SELECT
        tender_id,
        supplier_id,
        round_no,
        $${sourceParam},
        'pending',
        NOW()
      FROM expected
      ON CONFLICT (tender_id, round_no, supplier_id) DO NOTHING
    `, insertParams);
    await client.query('COMMIT');

    console.log(`Inserted invitations: ${result.rowCount}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors when no transaction has started.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
