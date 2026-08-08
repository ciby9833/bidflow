/**
 * 文件：backend/scripts/verify-tenant-isolation.js
 * 功能：对真实数据库验证 TenantRepository 的机构隔离行为，覆盖读取、QueryBuilder、按 ID 直查与写入约束。
 * 交互：读取 dist 下的编译产物，需先执行 npm run build；由 npm run verify:tenant 调用。
 * 作者：吴川
 *
 * 说明：项目当前无 jest 基建，本脚本是机构隔离机制的唯一回归验证手段。
 * 待测试基建就绪后应迁移为 jest 用例，届时可删除本文件。
 */
require('reflect-metadata');
const path = require('path');
const { DataSource } = require('typeorm');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const D = path.join(__dirname, '..', 'dist');
const { TenantRepository } = require(`${D}/shared/tenant/tenant-repository`);
const { branchScopeFor, hqBranchScope, emptyBranchScope } = require(`${D}/shared/tenant/branch-scope`);
const { Tender } = require(`${D}/modules/tender/tender.entity`);

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? '✅' : '❌'} ${name}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`);
  if (ok) pass += 1;
  else fail += 1;
}

(async () => {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DB_URL,
    entities: [`${D}/**/*.entity.js`],
  });
  await ds.initialize();

  const [{ id: idBranch }] = await ds.query(`SELECT id FROM branches WHERE code='ID'`);
  const fakeBranch = (await ds.query(`SELECT gen_random_uuid() AS id`))[0].id;
  const total = Number((await ds.query(`SELECT COUNT(*) c FROM tenders`))[0].c);

  const repo = new TenantRepository(ds.getRepository(Tender));
  const idScope = branchScopeFor(idBranch);
  const otherScope = branchScopeFor(fakeBranch);
  const hqScope = hqBranchScope([idBranch, fakeBranch]);
  const noScope = emptyBranchScope();

  console.log(`\n库中招标总数 = ${total}\n`);

  console.log('【读取隔离】');
  check('本机构 find', (await repo.find(idScope)).length, total);
  check('他机构 find', (await repo.find(otherScope)).length, 0);
  check('总部跨机构 find', (await repo.find(hqScope)).length, total);
  check('无作用域 find（fail-closed）', (await repo.find(noScope)).length, 0);
  check('无作用域 count', await repo.count(noScope), 0);

  console.log('\n【QueryBuilder 隔离】');
  check('本机构 QB', (await repo.createQueryBuilder(idScope, 't').getMany()).length, total);
  check('他机构 QB', (await repo.createQueryBuilder(otherScope, 't').getMany()).length, 0);
  check('无作用域 QB（强制空集）', (await repo.createQueryBuilder(noScope, 't').getMany()).length, 0);

  console.log('\n【按 ID 直查 —— IDOR 防护】');
  const rows = await repo.find(idScope);
  if (!rows.length) {
    console.log('  ⚠️ 库中无招标数据，跳过按 ID 直查用例');
  } else {
    const someId = rows[0].id;
    check('本机构 findById 命中', (await repo.findById(idScope, someId)) !== null, true);
    check('他机构 findById 落空', (await repo.findById(otherScope, someId)) === null, true);
    check('无作用域 findById 落空', (await repo.findById(noScope, someId)) === null, true);
    check('跨机构 update 不命中', await repo.update(otherScope, someId, { title: '越权改名' }), 0);
  }

  console.log('\n【调用方无法覆盖机构条件】');
  check('传入他机构 branchId 被忽略', (await repo.find(otherScope, { where: { branchId: idBranch } })).length, 0);

  console.log('\n【写入约束】');
  let hqBlocked = false;
  try { repo.create(hqScope, { title: 'x' }); } catch (e) { hqBlocked = e.message === 'error.branch.write_not_allowed'; }
  check('总部不可写业务数据', hqBlocked, true);

  let noScopeBlocked = false;
  try { repo.create(noScope, { title: 'x' }); } catch (e) { noScopeBlocked = true; }
  check('无归属不可写', noScopeBlocked, true);

  check('create 强制覆盖 branchId', repo.create(idScope, { title: 'x', branchId: fakeBranch }).branchId === idBranch, true);

  await ds.destroy();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('验证脚本异常:', e.message);
  process.exit(1);
});
