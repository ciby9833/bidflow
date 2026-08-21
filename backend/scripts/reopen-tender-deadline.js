#!/usr/bin/env node

/**
 * Safely reopen one closed tender and extend its bid deadline.
 *
 * Dry-run is the default. The transaction is committed only with --apply.
 * Example:
 *   node scripts/reopen-tender-deadline.js \
 *     --tender-id 0bf9e061-df22-4bdc-80e2-c5b105963260 \
 *     --deadline 2026-08-24T17:00:00+07:00 \
 *     --operator-user-id <admin-user-uuid> \
 *     --expected-tender-no T-202604-0010 \
 *     --expected-branch-id <branch-uuid> \
 *     --expected-current-deadline 2026-05-20T17:00:00Z
 *
 * Add --apply after checking the preview output.
 */

const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    args[arg.slice(2)] = value;
    i += 1;
  }
  return args;
}

function requireUuid(name, value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) {
    throw new Error(`${name} must be a valid UUID`);
  }
}

function parseDeadline(value) {
  // Requiring an explicit offset prevents a server-timezone-dependent deadline.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value || '')) {
    throw new Error('--deadline must be ISO 8601 with an explicit timezone, e.g. 2026-08-24T17:00:00+07:00');
  }
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) throw new Error('--deadline is invalid');
  if (deadline <= new Date()) throw new Error('--deadline must be in the future');
  return deadline;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireUuid('--tender-id', args['tender-id']);
  requireUuid('--operator-user-id', args['operator-user-id']);
  if (args['expected-branch-id']) requireUuid('--expected-branch-id', args['expected-branch-id']);
  const deadline = parseDeadline(args.deadline);
  if (!process.env.DB_URL) throw new Error('DB_URL is missing from backend/.env');

  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    const tenderResult = await client.query(
      `SELECT id, branch_id, tender_no, title, status, bid_start_at, bid_deadline,
              current_quote_round, updated_by, updated_at
         FROM tenders
        WHERE id = $1
        FOR UPDATE`,
      [args['tender-id']],
    );
    if (tenderResult.rowCount !== 1) throw new Error('Tender not found');
    const before = tenderResult.rows[0];
    if (before.status !== 'closed') {
      throw new Error(`Refusing to update: expected status closed, got ${before.status}`);
    }
    if (args['expected-tender-no'] && before.tender_no !== args['expected-tender-no']) {
      throw new Error(`Refusing to update: expected tender number ${args['expected-tender-no']}, got ${before.tender_no}`);
    }
    if (args['expected-branch-id'] && before.branch_id !== args['expected-branch-id']) {
      throw new Error(`Refusing to update: expected branch ${args['expected-branch-id']}, got ${before.branch_id}`);
    }
    if (args['expected-current-deadline']) {
      const expectedCurrentDeadline = new Date(args['expected-current-deadline']);
      if (Number.isNaN(expectedCurrentDeadline.getTime())) {
        throw new Error('--expected-current-deadline is invalid');
      }
      const actualTimestamp = before.bid_deadline ? new Date(before.bid_deadline).getTime() : null;
      if (actualTimestamp !== expectedCurrentDeadline.getTime()) {
        throw new Error(`Refusing to update: expected current deadline ${expectedCurrentDeadline.toISOString()}, got ${before.bid_deadline}`);
      }
    }

    const operatorResult = await client.query(
      'SELECT id, role, login_name, display_name FROM users WHERE id = $1',
      [args['operator-user-id']],
    );
    if (operatorResult.rowCount !== 1) throw new Error('Operator user not found');
    const operator = operatorResult.rows[0];

    const updateResult = await client.query(
      `UPDATE tenders
          SET status = 'open',
              bid_deadline = $2,
              updated_by = $3,
              updated_at = now()
        WHERE id = $1
          AND status = 'closed'
      RETURNING id, branch_id, tender_no, title, status, bid_start_at, bid_deadline,
                current_quote_round, updated_by, updated_at`,
      [args['tender-id'], deadline.toISOString(), operator.id],
    );
    if (updateResult.rowCount !== 1) throw new Error('Tender changed concurrently; nothing was updated');
    const after = updateResult.rows[0];

    await client.query(
      `INSERT INTO audit_log
        (branch_id, entity_type, entity_id, action, user_id, user_role,
         ip_address, user_agent, before_state, after_state, metadata)
       VALUES ($1, 'tender', $2, 'TENDER_OPEN', $3, $4,
               '127.0.0.1', 'manual-script/reopen-tender-deadline', $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        before.branch_id,
        before.id,
        operator.id,
        operator.role,
        JSON.stringify({ status: before.status, bidDeadline: before.bid_deadline }),
        JSON.stringify({ status: after.status, bidDeadline: after.bid_deadline }),
        JSON.stringify({
          reason: 'Manual deadline extension for suppliers that have not submitted quotes',
          script: 'backend/scripts/reopen-tender-deadline.js',
          roundNo: before.current_quote_round,
        }),
      ],
    );

    console.log(JSON.stringify({
      mode: args.apply ? 'APPLY' : 'DRY_RUN',
      tender: { id: before.id, tenderNo: before.tender_no, title: before.title },
      operator: { id: operator.id, loginName: operator.login_name, displayName: operator.display_name, role: operator.role },
      before: { status: before.status, bidDeadline: before.bid_deadline },
      after: { status: after.status, bidDeadline: after.bid_deadline },
    }, null, 2));

    if (args.apply) {
      await client.query('COMMIT');
      console.log('Committed. The tender is open until the new deadline.');
    } else {
      await client.query('ROLLBACK');
      console.log('Dry-run complete. Transaction rolled back; no data was changed.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
