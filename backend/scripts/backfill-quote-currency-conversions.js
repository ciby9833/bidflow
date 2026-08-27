#!/usr/bin/env node
/**
 * 回刷历史报价的统一币种金额。
 *
 * 策略：
 * - 同币种报价直接 exchange_rate=1、price_in_base=total_price。
 * - 跨币种报价按 submitted_at 日期查询 Frankfurter 历史汇率并回写。
 * - 默认 dry-run，只打印数量；加 --apply 才写库。
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const onlyMissing = !args.has('--all');
const API = 'https://api.frankfurter.dev';

function printUsage() {
  console.log(`
Usage:
  node scripts/backfill-quote-currency-conversions.js --dry-run
  node scripts/backfill-quote-currency-conversions.js --apply

Options:
  --apply     Update rows. Default is dry-run.
  --all       Recalculate all rows, including rows that already have price_in_base.
`);
}

function normalize(currency) {
  return String(currency || '').trim().toUpperCase();
}

function rateKey(from, to, date) {
  return `${from}:${to}:${date}`;
}

async function fetchRate(cache, from, to, date) {
  const key = rateKey(from, to, date);
  if (cache.has(key)) return cache.get(key);
  if (from === to) {
    const same = { rate: 1, date, source: 'same_currency_backfill' };
    cache.set(key, same);
    return same;
  }
  const url = `${API}/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}?date=${encodeURIComponent(date)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.rate) {
    throw new Error(`Rate unavailable: ${from}/${to} ${date} (${res.status}) ${data?.message || ''}`);
  }
  const rate = { rate: Number(data.rate), date: data.date || date, source: 'frankfurter_backfill' };
  cache.set(key, rate);
  return rate;
}

async function loadTargets(client, table) {
  const where = onlyMissing ? 'AND (q.price_in_base IS NULL OR q.exchange_rate IS NULL OR q.base_currency IS NULL)' : '';
  const result = await client.query(`
    SELECT
      q.id,
      q.total_price::numeric AS total_price,
      q.currency,
      COALESCE(q.base_currency, t.base_currency) AS base_currency,
      q.submitted_at::date::text AS rate_date
    FROM ${table} q
    JOIN tenders t ON t.id = q.tender_id
    WHERE q.currency IS NOT NULL
      AND COALESCE(q.base_currency, t.base_currency) IS NOT NULL
      ${where}
    ORDER BY q.submitted_at ASC
  `);
  return result.rows;
}

async function updateRows(client, table, rows, cache) {
  let updated = 0;
  for (const row of rows) {
    const from = normalize(row.currency);
    const to = normalize(row.base_currency);
    const fx = await fetchRate(cache, from, to, row.rate_date);
    const priceInBase = Math.round(Number(row.total_price) * fx.rate * 10000) / 10000;
    if (!apply) {
      updated += 1;
      continue;
    }
    await client.query(`
      UPDATE ${table}
      SET
        base_currency = $2,
        exchange_rate = $3,
        price_in_base = $4,
        exchange_rate_date = $5::date,
        exchange_rate_source = $6
      WHERE id = $1
    `, [row.id, to, fx.rate, priceInBase, fx.date, fx.source]);
    updated += 1;
  }
  return updated;
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }
  if (!process.env.DB_URL) {
    throw new Error('DB_URL is missing. Put it in backend/.env or export it before running this script.');
  }

  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const cache = new Map();
  try {
    const quoteRows = await loadTargets(client, 'quotes');
    const lineQuoteRows = await loadTargets(client, 'line_quotes');
    console.log(`Target quotes: ${quoteRows.length}`);
    console.log(`Target line quotes: ${lineQuoteRows.length}`);
    if (!apply) {
      console.log('Dry run only. Re-run with --apply to update.');
    }
    await client.query('BEGIN');
    const updatedQuotes = await updateRows(client, 'quotes', quoteRows, cache);
    const updatedLineQuotes = await updateRows(client, 'line_quotes', lineQuoteRows, cache);
    if (apply) await client.query('COMMIT');
    else await client.query('ROLLBACK');
    console.log(`Processed quotes: ${updatedQuotes}`);
    console.log(`Processed line quotes: ${updatedLineQuotes}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // no-op
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
