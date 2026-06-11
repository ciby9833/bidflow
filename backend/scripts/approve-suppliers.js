#!/usr/bin/env node
/**
 * 批量把供应商刷为审核通过。
 *
 * 默认 dry-run，只打印将要更新的数量；加 --apply 才写库。
 * 默认跳过 suspended/blacklisted，避免误恢复异常供应商；需要覆盖时加 --all。
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeSuspended = args.has('--include-suspended') || args.has('--all');
const includeBlacklisted = args.has('--include-blacklisted') || args.has('--all');
const operatorUserId = valueOf('--operator-user-id');
const comment = valueOf('--comment') || 'bulk_approve_suppliers_script';

function valueOf(flag) {
  const prefix = `${flag}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function printUsage() {
  console.log(`
Usage:
  npm run suppliers:approve -- --dry-run
  npm run suppliers:approve -- --apply
  npm run suppliers:approve -- --apply --all

Options:
  --dry-run                 Preview only. This is the default.
  --apply                   Update matching suppliers.
  --all                     Also convert suspended and blacklisted suppliers to active.
  --include-suspended       Also convert suspended suppliers to active.
  --include-blacklisted     Also convert blacklisted suppliers to active.
  --operator-user-id=<uuid> Set reviewed_by_user_id. Optional.
  --comment=<text>          Set review_comment. Default: bulk_approve_suppliers_script
`);
}

function assertValidUuid(uuid) {
  if (!uuid) return;
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  if (!ok) {
    throw new Error(`Invalid --operator-user-id: ${uuid}`);
  }
}

function targetWhere() {
  const excluded = [];
  if (!includeSuspended) excluded.push('suspended');
  if (!includeBlacklisted) excluded.push('blacklisted');

  const params = [];
  const clauses = ["(review_status IS DISTINCT FROM 'approved' OR status IS DISTINCT FROM 'active')"];
  if (excluded.length) {
    params.push(excluded);
    clauses.push(`status::text <> ALL($${params.length}::text[])`);
  }
  return { sql: clauses.join(' AND '), params };
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }
  if (!process.env.DB_URL) {
    throw new Error('DB_URL is missing. Put it in backend/.env or export it before running this script.');
  }
  assertValidUuid(operatorUserId);

  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();

  try {
    const statusRows = await client.query(`
      SELECT status, review_status, COUNT(*)::int AS count
      FROM suppliers
      GROUP BY status, review_status
      ORDER BY status, review_status
    `);
    console.table(statusRows.rows);

    const where = targetWhere();
    const target = await client.query(`SELECT COUNT(*)::int AS count FROM suppliers WHERE ${where.sql}`, where.params);
    const targetCount = target.rows[0]?.count ?? 0;

    const skipped = [];
    if (!includeSuspended) skipped.push('suspended');
    if (!includeBlacklisted) skipped.push('blacklisted');

    console.log(`Target suppliers: ${targetCount}`);
    if (skipped.length) console.log(`Skipped statuses: ${skipped.join(', ')} (use --all to include them)`);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to update.');
      return;
    }
    if (targetCount === 0) {
      console.log('Nothing to update.');
      return;
    }

    await client.query('BEGIN');
    const updateParams = [...where.params, operatorUserId || null, comment];
    const operatorParam = updateParams.length - 1;
    const commentParam = updateParams.length;
    const result = await client.query(`
      WITH changed AS (
        UPDATE suppliers
        SET
          status = 'active',
          review_status = 'approved',
          reviewed_by_user_id = COALESCE($${operatorParam}::uuid, reviewed_by_user_id),
          reviewed_at = NOW(),
          review_comment = $${commentParam},
          updated_at = NOW()
        WHERE ${where.sql}
        RETURNING
          id,
          business_id,
          status AS new_status,
          review_status AS new_review_status
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
        'bulk_approve',
        'approved',
        $${operatorParam}::uuid,
        'script',
        $${commentParam},
        jsonb_build_object('businessId', business_id, 'source', 'approve-suppliers.js')
      FROM changed
      RETURNING supplier_id
    `, updateParams);
    await client.query('COMMIT');

    console.log(`Updated suppliers: ${result.rowCount}`);
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
