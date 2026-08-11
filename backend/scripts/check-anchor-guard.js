/**
 * 文件：backend/scripts/check-anchor-guard.js
 * 功能：静态检查服务方法是否对请求传入的实体 ID（lotId / lineId / tenderId）校验了机构归属。
 * 交互：由 npm run check:anchor 调用，建议与 check:tenant 一并接入 CI。
 * 作者：吴川
 *
 * 为什么需要这个检查：
 * 方法签名接收 BranchScope 只能保证调用方传了作用域，不能保证方法体内用了它。
 * 报价域实际出现过 getQuotes 收下 scope 却直接查 quoteRepo 的情况 ——
 * 编译通过、代码审查也难发现，但跨机构可凭 lotId 直接读到排名与报价。
 *
 * 判定规则：方法参数中出现锚点 ID，则方法体内必须调用 requireLot / requireLine /
 * requireTender / resolveLotContext / findById 之一，否则视为未校验。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/**
 * 触发检查的实体 ID 参数。
 * supplierId 也在内：供应商虽是全局主档，但采购方按 ID 操作时同样需要校验其在本机构有准入档案。
 */
const ANCHOR_PARAMS = ['lotId', 'lineId', 'tenderId', 'supplierId'];

/** 视为「已消费作用域」的调用形态。任一出现即认为该方法完成了机构校验。 */
const VALIDATORS = [
  // 显式取锚点并校验归属
  'requireLot(', 'requireLine(', 'requireTender(', 'requireSupplier(', 'resolveLotContext(', '.findById(',
  // 经由 TenantRepository / 作用域辅助方法构造的查询，机构条件在查询构造时即已注入
  'createQueryBuilder(scope', 'scopeSuppliers(',
  // 写入路径：解析出可写机构并落到数据上
  'requireWritableBranch(', 'attachToBranch(',
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.service.ts')) out.push(p);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  // 仅检查已接入机构作用域的方法：签名里出现 BranchScope 才有隔离义务
  const re = /\n  (?:private )?async ([a-zA-Z]+)\(([^)]*BranchScope[^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, params] = m;
    if (!ANCHOR_PARAMS.some((a) => params.includes(a))) continue;

    const start = m.index;
    const next = src.indexOf('\n  async ', start + 1);
    const body = src.slice(start, next === -1 ? src.length : next);
    if (VALIDATORS.some((v) => body.includes(v))) continue;
    // 把作用域原样传给另一个方法，同样视为消费 —— 被调方会被本检查以同样规则覆盖，
    // 因此不必在此维护一份"哪些方法算安全"的白名单（那会随业务增长不断漏项）。
    if (/\w+\(\s*scope\s*,/.test(body)) continue;
    if (body.includes('anchor-guard: allow')) continue;

    violations.push(`${path.relative(SRC, file)} → ${name}()`);
  }
}

if (violations.length) {
  console.error(`❌ 以下方法接收了实体 ID 但未校验机构归属（${violations.length} 处）：`);
  violations.forEach((v) => console.error(`   ${v}`));
  console.error('\n请在方法开头调用 requireLot / requireLine / requireTender 校验归属。');
  console.error('确有正当理由时，在方法体内注释标注：// anchor-guard: allow <理由>');
  process.exit(1);
}

console.log('✅ 锚点校验检查通过：所有接收实体 ID 的作用域方法都已校验机构归属');
