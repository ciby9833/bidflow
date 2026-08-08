/**
 * 文件：backend/scripts/check-tenant-guard.js
 * 功能：静态检查服务层是否直接注入了租户实体的裸 Repository，防止绕过 TenantRepository 造成跨机构泄漏。
 * 交互：由 npm run check:tenant 调用，建议接入 CI；配套基线文件 scripts/tenant-guard-baseline.json。
 * 作者：吴川
 *
 * 采用棘轮策略：存量违规记录在基线文件中允许存在，但数量只减不增。
 * 这样机构隔离改造可以分模块推进，而不必让 CI 在整个改造期间保持红色。
 * 单行豁免：在 @InjectRepository 上一行写 `// tenant-guard: allow <理由>`。
 */
const fs = require('fs');
const path = require('path');

/** 带 branch_id 的租户实体。注入这些实体的裸 Repository 意味着可以无机构条件地读写。 */
const TENANT_ENTITIES = [
  'Tender', 'Lot', 'LotLine', 'Invitation', 'TenderNotificationLog',
  'Quote', 'LineQuote', 'LotQuoteAttachment', 'RankingSnapshot', 'AuditLog',
];

const SRC = path.join(__dirname, '..', 'src');
const BASELINE = path.join(__dirname, 'tenant-guard-baseline.json');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, out);
    else if (name.endsWith('.service.ts')) out.push(p);
  }
  return out;
}

const pattern = new RegExp(`@InjectRepository\\(\\s*(${TENANT_ENTITIES.join('|')})\\s*\\)`);
const violations = [];

for (const file of walk(SRC)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(pattern);
    if (!m) return;
    const prev = lines[i - 1] ?? '';
    if (prev.includes('tenant-guard: allow')) return;
    violations.push(`${path.relative(SRC, file)}:${i + 1} ${m[1]}`);
  });
}

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { count: Number.MAX_SAFE_INTEGER, entries: [] };

console.log(`租户仓储检查：发现 ${violations.length} 处裸仓储注入，基线 ${baseline.count} 处`);

if (violations.length > baseline.count) {
  const added = violations.filter((v) => !baseline.entries.includes(v));
  console.error('\n❌ 新增了未受保护的租户表访问：');
  added.forEach((v) => console.error(`   ${v}`));
  console.error('\n请改用 TenantRepository（见 src/shared/tenant/tenant-repository.ts）。');
  console.error('确有正当理由时，在上一行标注：// tenant-guard: allow <理由>');
  process.exit(1);
}

if (violations.length < baseline.count) {
  console.log(`\n✅ 违规数下降（${baseline.count} → ${violations.length}），请更新基线：`);
  console.log(`   npm run check:tenant -- --update-baseline`);
}

if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ count: violations.length, entries: violations }, null, 2)}\n`);
  console.log(`\n基线已更新为 ${violations.length} 处`);
}

if (violations.length) {
  console.log('\n待迁移清单：');
  violations.forEach((v) => console.log(`   ${v}`));
}
