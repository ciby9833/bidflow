#!/usr/bin/env node
/**
 * 修复供应商端看不到定向标的历史数据问题。
 *
 * 默认 dry-run，只统计不写库；加 --apply 后在一个事务里执行：
 * 1. 把目标供应商刷为 active + approved。
 * 2. 从 supplier_accounts 回填 users.supplier_id，保证 JWT 策略加载到正确供应商上下文。
 * 3. 给定向标当前轮次补 invitations，让供应商端列表/详情/报价权限使用同一套范围数据。
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeSuspended = args.has('--include-suspended') || args.has('--all-suppliers');
const includeBlacklisted = args.has('--include-blacklisted') || args.has('--all-suppliers');
const includeDraft = args.has('--include-draft') || args.has('--all-statuses');
const includeCancelled = args.has('--include-cancelled') || args.has('--all-statuses');
const fixMismatchedUserSupplier = args.has('--fix-user-supplier-mismatch');
const tenderId = valueOf('--tender-id');
const supplierId = valueOf('--supplier-id');
const operatorUserId = valueOf('--operator-user-id');
const reviewComment = valueOf('--comment') || 'fix_supplier_tender_visibility';
const invitationSource = valueOf('--source') || 'fix_supplier_tender_visibility';

function valueOf(flag) {
  const prefix = `${flag}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function printUsage() {
  console.log(`
Usage:
  npm run suppliers:fix-tender-visibility -- --dry-run
  npm run suppliers:fix-tender-visibility -- --apply
  npm run suppliers:fix-tender-visibility -- --apply --tender-id=<uuid>
  npm run suppliers:fix-tender-visibility -- --apply --supplier-id=<uuid>

Options:
  --dry-run                       Preview only. This is the default.
  --apply                         Run all fixes in one transaction.
  --tender-id=<uuid>              Only backfill invitations for one tender.
  --supplier-id=<uuid>            Only repair one supplier.
  --include-draft                 Also backfill draft selected tenders.
  --include-cancelled             Also backfill cancelled selected tenders.
  --all-statuses                  Include draft and cancelled selected tenders.
  --include-suspended             Convert suspended suppliers to active too.
  --include-blacklisted           Convert blacklisted suppliers to active too.
  --all-suppliers                 Include suspended and blacklisted suppliers.
  --fix-user-supplier-mismatch    Overwrite supplier_account users whose users.supplier_id points elsewhere.
  --operator-user-id=<uuid>       Set reviewed_by_user_id for newly approved suppliers.
  --comment=<text>                Supplier review_comment. Default: fix_supplier_tender_visibility
  --source=<text>                 invitations.source. Default: fix_supplier_tender_visibility
`);
}

function assertValidUuid(uuid, label) {
  if (!uuid) return;
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  if (!ok) throw new Error(`Invalid ${label}: ${uuid}`);
}

function selectedTenderStatuses() {
  const list = ['published', 'open', 'closed', 'awarded'];
  if (includeDraft) list.push('draft');
  if (includeCancelled) list.push('cancelled');
  return list;
}

function supplierScopeSql(alias = 's') {
  const clauses = [];
  if (supplierId) clauses.push(`${alias}.id = $SUPPLIER_ID`);
  if (!includeSuspended) clauses.push(`${alias}.status::text <> 'suspended'`);
  if (!includeBlacklisted) clauses.push(`${alias}.status::text <> 'blacklisted'`);
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

function supplierIdParamIndex(params) {
  if (!supplierId) return null;
  params.push(supplierId);
  return params.length;
}

function renderSupplierScope(params, alias = 's') {
  const idx = supplierIdParamIndex(params);
  return supplierScopeSql(alias).replaceAll('$SUPPLIER_ID', `$${idx}`);
}

function renderTenderFilter(params, alias = 't') {
  if (!tenderId) return '';
  params.push(tenderId);
  return `AND ${alias}.id = $${params.length}`;
}

async function countOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

async function printPreview(client) {
  const supplierStatusParams = [];
  const supplierScope = renderSupplierScope(supplierStatusParams, 's');
  const statusRows = await client.query(`
    SELECT status::text AS status, review_status, COUNT(*)::int AS count
    FROM suppliers s
    WHERE 1 = 1
      ${supplierScope}
    GROUP BY status, review_status
    ORDER BY status, review_status
  `, supplierStatusParams);

  const approveParams = [];
  const approveScope = renderSupplierScope(approveParams, 's');
  const suppliersToApprove = await countOne(client, `
    SELECT COUNT(*)::int AS count
    FROM suppliers s
    WHERE (s.status IS DISTINCT FROM 'active' OR s.review_status IS DISTINCT FROM 'approved')
      ${approveScope}
  `, approveParams);

  const userParams = [];
  const userSupplierScope = renderSupplierScope(userParams, 's');
  const mismatchClause = fixMismatchedUserSupplier ? 'OR u.supplier_id IS DISTINCT FROM ranked.supplier_id' : '';
  const usersToBackfill = await countOne(client, `
    WITH ranked AS (
      SELECT DISTINCT ON (sa.auth_user_id)
        sa.auth_user_id,
        sa.supplier_id
      FROM supplier_accounts sa
      JOIN suppliers s ON s.id = sa.supplier_id
      WHERE sa.status = 'active'
        ${userSupplierScope}
      ORDER BY sa.auth_user_id, sa.is_primary DESC, sa.created_at ASC
    )
    SELECT COUNT(*)::int AS count
    FROM users u
    JOIN ranked ON ranked.auth_user_id = u.id
    WHERE u.account_type = 'supplier_account'
      AND (u.supplier_id IS NULL ${mismatchClause})
  `, userParams);

  const inviteParams = [selectedTenderStatuses()];
  const inviteSupplierScope = renderSupplierScope(inviteParams, 's');
  const tenderFilter = renderTenderFilter(inviteParams, 't');
  const missingInvitationRows = await client.query(`
    WITH selected_tenders AS (
      SELECT id, tender_no, title, status, current_quote_round
      FROM tenders t
      WHERE t.participation_mode = 'selected'
        AND t.status::text = ANY($1::text[])
        ${tenderFilter}
    ),
    eligible_suppliers AS (
      SELECT id
      FROM suppliers s
      WHERE s.status = 'active'
        AND s.review_status = 'approved'
        ${inviteSupplierScope}
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
      CROSS JOIN eligible_suppliers s
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
  `, inviteParams);
  const missingInvitationCount = missingInvitationRows.rows.reduce((sum, row) => sum + Number(row.missingInvitations), 0);

  console.log('Supplier status in scope:');
  console.table(statusRows.rows);
  console.log(`Suppliers to approve/activate: ${suppliersToApprove}`);
  console.log(`Supplier-account users to backfill: ${usersToBackfill}`);
  console.log('Selected tender invitation gaps:');
  console.table(missingInvitationRows.rows);
  console.log(`Missing invitations: ${missingInvitationCount}`);

  return { suppliersToApprove, usersToBackfill, missingInvitationCount };
}

async function approveSuppliers(client) {
  const params = [operatorUserId || null, reviewComment];
  const scope = renderSupplierScope(params, 's');
  const result = await client.query(`
    WITH changed AS (
      UPDATE suppliers s
      SET
        status = 'active',
        review_status = 'approved',
        reviewed_by_user_id = COALESCE($1::uuid, s.reviewed_by_user_id),
        reviewed_at = NOW(),
        review_comment = $2,
        updated_at = NOW()
      WHERE (s.status IS DISTINCT FROM 'active' OR s.review_status IS DISTINCT FROM 'approved')
        ${scope}
      RETURNING s.id, s.business_id
    )
    INSERT INTO supplier_review_logs (
      supplier_id,
      action,
      review_status,
      operator_user_id,
      operator_role,
      comment,
      metadata
    )
    SELECT
      id,
      'bulk_visibility_fix_approve',
      'approved',
      $1::uuid,
      'script',
      $2,
      jsonb_build_object('businessId', business_id, 'source', 'fix-supplier-tender-visibility.js')
    FROM changed
    RETURNING supplier_id
  `, params);
  return result.rowCount;
}

async function backfillUserSupplierIds(client) {
  const params = [];
  const scope = renderSupplierScope(params, 's');
  const mismatchClause = fixMismatchedUserSupplier ? 'OR u.supplier_id IS DISTINCT FROM ranked.supplier_id' : '';
  const result = await client.query(`
    WITH ranked AS (
      SELECT DISTINCT ON (sa.auth_user_id)
        sa.auth_user_id,
        sa.supplier_id
      FROM supplier_accounts sa
      JOIN suppliers s ON s.id = sa.supplier_id
      WHERE sa.status = 'active'
        ${scope}
      ORDER BY sa.auth_user_id, sa.is_primary DESC, sa.created_at ASC
    )
    UPDATE users u
    SET
      supplier_id = ranked.supplier_id,
      updated_at = NOW()
    FROM ranked
    WHERE ranked.auth_user_id = u.id
      AND u.account_type = 'supplier_account'
      AND (u.supplier_id IS NULL ${mismatchClause})
  `, params);
  return result.rowCount;
}

async function backfillInvitations(client) {
  const params = [selectedTenderStatuses(), invitationSource];
  const sourceParam = 2;
  const supplierScope = renderSupplierScope(params, 's');
  const tenderFilter = renderTenderFilter(params, 't');
  const result = await client.query(`
    WITH selected_tenders AS (
      SELECT id, current_quote_round
      FROM tenders t
      WHERE t.participation_mode = 'selected'
        AND t.status::text = ANY($1::text[])
        ${tenderFilter}
    ),
    eligible_suppliers AS (
      SELECT id
      FROM suppliers s
      WHERE s.status = 'active'
        AND s.review_status = 'approved'
        ${supplierScope}
    ),
    expected AS (
      SELECT
        t.id AS tender_id,
        COALESCE(t.current_quote_round, 1) AS round_no,
        s.id AS supplier_id
      FROM selected_tenders t
      CROSS JOIN eligible_suppliers s
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
  `, params);
  return result.rowCount;
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
  assertValidUuid(supplierId, '--supplier-id');
  assertValidUuid(operatorUserId, '--operator-user-id');

  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();

  try {
    const preview = await printPreview(client);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to run all fixes.');
      return;
    }
    if (!preview.suppliersToApprove && !preview.usersToBackfill && !preview.missingInvitationCount) {
      console.log('Nothing to fix.');
      return;
    }

    await client.query('BEGIN');
    const approved = await approveSuppliers(client);
    const users = await backfillUserSupplierIds(client);
    const invitations = await backfillInvitations(client);
    await client.query('COMMIT');

    console.log(`Updated suppliers: ${approved}`);
    console.log(`Backfilled users.supplier_id: ${users}`);
    console.log(`Inserted invitations: ${invitations}`);
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
