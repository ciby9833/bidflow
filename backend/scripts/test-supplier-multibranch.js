// Run after npm run build. Pure service tests: no database, network or production writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');
const { SupplierService } = require('../dist/modules/supplier/supplier.service');
const { Supplier } = require('../dist/modules/supplier/supplier.entity');
const { SupplierDocument } = require('../dist/modules/supplier/supplier-document.entity');
const { supplierCountryCode } = require('../dist/modules/supplier/supplier-country');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { branchScopeFor, emptyBranchScope } = require('../dist/shared/tenant/branch-scope');
const scope = branchScopeFor('vn-branch');
const ctx = { userId: 'user', userRole: 'super_admin', ipAddress: '127.0.0.1' };
const company = { legalName: 'Example', shortName: 'Ex', contactName: 'Contact', contactPhone: '123' };
const document = { docType: 'company_registration', docLabel: 'Registration', fileUrl: '/proof' };

function fixture({ failAttach = false, inactive = false } = {}) {
  const state = { saved: [], queries: [], committed: 0, rolledBack: 0, oldDocs: [] };
  const em = {
    query: async (sql, params) => {
      state.queries.push({ sql, params });
      if (sql.includes('SELECT id FROM branches')) return inactive || params[0] !== 'vn-branch' ? [] : [{ id: params[0] }];
      if (sql.includes('SELECT country_code')) return [{ country_code: 'VN' }];
      if (sql.includes('max_seq')) return [{ max_seq: 0 }];
      if (sql.includes('INSERT INTO supplier_branch_profiles') && failAttach) throw Error('attachment failed');
      return [];
    },
    create: (Type, data) => Object.assign(new Type(), data),
    save: async value => { value.id ||= `record-${state.saved.length}`; state.saved.push(value); return value; },
    findOne: async Type => Type === Supplier ? null : { id: 'user', email: 'example@example.test' },
    find: async () => state.oldDocs,
    update: async (Type, id, data) => { state.lastUpdate = { Type, id, data }; },
    delete: async () => {},
  };
  const qb = { innerJoin() { return this; }, andWhere() { return this; }, where() { return this; }, getMany: async () => [] };
  const repo = { manager: em, createQueryBuilder: () => qb, update: em.update, findOne: async () => null };
  const accounts = { findOne: async () => null };
  const ds = { transaction: async callback => {
    const snapshot = state.saved.length;
    try { const result = await callback(em); state.committed++; return result; }
    catch (err) { state.saved.splice(snapshot); state.rolledBack++; throw err; }
  } };
  const service = new SupplierService(repo, {}, {}, {}, { find: async () => [] }, accounts, ds, { log: async () => {} }, { t: key => key });
  return { service, state, em, qb };
}

test('country: branch defaults, explicit cross-border country, normalization and invalid values', () => {
  assert.equal(supplierCountryCode(undefined, 'VN'), 'VN');
  assert.equal(supplierCountryCode(' ', 'VN'), 'VN');
  assert.equal(supplierCountryCode(' id ', 'VN'), 'ID');
  for (const code of ['ZZ', 'Indonesia', {}, 12]) assert.throws(() => supplierCountryCode(code, 'VN'));
  assert.throws(() => supplierCountryCode(undefined));
});

test('institution create defaults VN, does not accept forged review state, binds atomically', async () => {
  const { service, state } = fixture();
  const saved = await service.create(scope, false, { ...company, id: 'outside-supplier', branchId: 'other', reviewStatus: 'approved' }, ctx);
  assert.notEqual(saved.id, 'outside-supplier');
  assert.equal(saved.countryCode, 'VN');
  assert.equal(saved.businessId, 'S-VN-00001');
  assert.equal(saved.reviewStatus, 'not_submitted');
  assert.equal(state.committed, 1);
  assert.deepEqual(state.queries.find(q => q.sql.includes('INSERT INTO supplier_branch_profiles')).params, ['vn-branch', saved.id]);
  assert.ok(state.queries.some(q => q.sql.includes('pg_advisory_xact_lock')));
});

test('cross-border create preserves actual ID registration under VN institution', async () => {
  const { service } = fixture();
  const saved = await service.create(scope, false, { ...company, countryCode: 'ID' }, ctx);
  assert.equal(saved.businessId, 'S-ID-00001');
});

test('HQ requires an active country institution; invalid targets cannot leave orphan suppliers', async () => {
  for (const branchId of [undefined, 'hq', 'inactive']) {
    const { service, state } = fixture();
    await assert.rejects(service.create(emptyBranchScope(), true, { ...company, branchId }, ctx));
    assert.equal(state.saved.length, 0);
  }
  const { service, state } = fixture({ failAttach: true });
  await assert.rejects(service.create(scope, false, company, ctx), /attachment failed/);
  assert.equal(state.saved.length, 0);
  assert.equal(state.rolledBack, 1);
});

test('self-service company creation uses validated institution country', async () => {
  const { service } = fixture();
  const result = await service.createCompanyForAccount('user', { ...company, branchId: 'vn-branch' }, ctx);
  assert.equal(result.supplier.countryCode, 'VN');
});

test('first certification returns through new verified scope, not incoming empty scope', async () => {
  const { service, state } = fixture();
  service.findSupplierIdForAccount = async () => undefined;
  service.findReviewDetail = async (resolved, id) => {
    assert.deepEqual(resolved, scope);
    return state.saved.find(s => s instanceof Supplier && s.id === id);
  };
  const result = await service.submitProfileForAccount(emptyBranchScope(), 'user', { ...company, branchId: 'vn-branch', documents: [document] }, ctx);
  assert.equal(result.countryCode, 'VN');
  assert.equal(result.reviewStatus, 'pending_review');
  assert.equal(state.committed, 1);
});

test('existing company resubmission retains country and omitted legacy evidence', async () => {
  const { service, state } = fixture();
  state.oldDocs = [{ ...document, docType: 'legacy_proof' }];
  service.findById = async () => ({ id: 'supplier', countryCode: 'VN' });
  service.findReviewDetail = async () => ({});
  await service.submitProfile(scope, 'supplier', { ...company, documents: [document] }, ctx);
  assert.equal(state.lastUpdate.data.countryCode, 'VN');
  assert.deepEqual(state.saved.filter(s => s instanceof SupplierDocument).map(s => s.docType), ['company_registration', 'legacy_proof']);
});

function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Import');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

test('bulk supplier create: empty country defaults VN, invalid code is a row error', async () => {
  const { service, state } = fixture();
  const buffer = workbook([['Name', 'Short', 'Contact', 'Phone', 'Email', 'Tax', 'Country'], ['A', 'A', '', '', '', '', ''], ['B', 'B', '', '', '', '', 'ZZ']]);
  const result = await service.bulkCreateSuppliers(scope, false, undefined, buffer, ctx);
  assert.equal(result.created.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.created[0].businessId, 'S-VN-00001');
  assert.equal(state.committed, 1);
});

test('account import cannot bind a supplier outside the selected institution', async () => {
  const { service, state, qb } = fixture();
  let scoped = false;
  qb.innerJoin = (_table, _alias, condition, params) => { scoped = condition.includes('branch_id') && params.__scope[0] === 'vn-branch'; return qb; };
  const buffer = workbook([['Supplier', 'Email', 'Password'], ['S-ID-00001', 'new@example.test', 'test-password']]);
  const result = await service.bulkImportSupplierAccounts(scope, false, undefined, buffer, ctx);
  assert.ok(scoped);
  assert.equal(result.created.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(state.committed, 0);
});

test('login: one branch enters directly; multiple require selection or reuse accessible last branch', () => {
  const resolve = AuthService.prototype.resolveEntryBranch;
  assert.deepEqual(resolve([{ branchId: 'VN' }]), { branchId: 'VN', needsSelection: false });
  const branches = [{ branchId: 'ID' }, { branchId: 'VN' }];
  assert.equal(resolve(branches).needsSelection, true);
  assert.equal(resolve(branches, 'removed').needsSelection, true);
  assert.deepEqual(resolve(branches, 'VN'), { branchId: 'VN', needsSelection: false });
});

test('switch rejects institutions not in the supplier access list', async () => {
  const auth = Object.create(AuthService.prototype);
  auth.buildProfile = async () => ({ user: { supplierId: 'supplier' } });
  auth.branchContext = { resolve: async () => ({ branches: [{ branchId: 'VN' }] }) };
  await assert.rejects(auth.switchBranch({ id: 'user' }, 'ID', ctx), /not_accessible/);
});

test('frontend templates: VN is not ID; uploaded legacy files survive country changes', () => {
  const file = path.resolve(__dirname, '../../frontend/src/composables/supplierDocuments.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports });
  const build = module.exports.buildSupplierDocuments;
  const docs = build('VN', [{ ...document, docType: 'legacy_proof' }]);
  assert.equal(docs[0].docType, 'company_registration');
  assert.ok(docs.some(d => d.docType === 'legacy_proof'));
  assert.ok(!docs.some(d => d.docType === 'nib'));
});

test('country correction never renumbers the supplier or changes certification through generic PATCH', async () => {
  const { service, state } = fixture();
  service.findById = async () => ({ id: 'supplier', countryCode: 'VN', businessId: 'S-ID-00001' });
  await service.update(scope, 'supplier', { countryCode: '', businessId: 'forged', reviewStatus: 'approved', status: 'suspended' }, ctx);
  // The fixture captures repo.update(id, changes) in its second argument.
  assert.deepEqual(state.lastUpdate.id, { countryCode: 'VN' });
});

test('bulk creation rolls back a supplier when institution attachment fails', async () => {
  const { service, state } = fixture({ failAttach: true });
  const buffer = workbook([['Name'], ['Example']]);
  const result = await service.bulkCreateSuppliers(scope, false, undefined, buffer, ctx);
  assert.equal(result.created.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(state.saved.length, 0);
});

test('frontend auth: Google selection response does not save an undefined access token', () => {
  const filename = path.resolve(__dirname, '../../frontend/src/stores/auth.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const writes = [];
  const routes = [];
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    localStorage: { getItem: () => null, setItem: (...args) => writes.push(args) },
    require: id => {
      if (id === 'vue') return { ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }) };
      if (id === 'pinia') return { defineStore: (_id, setup) => setup };
      if (id === '../router') return { router: { replace: path => routes.push(path) } };
      if (id === '../composables/useApi') return { api: {} };
      throw Error(id);
    },
  });
  const auth = exports.useAuthStore();
  auth.applyAuthSession({ requiresBranchSelection: true, selectionToken: 'restricted', branches: [{ branchId: 'VN' }, { branchId: 'ID' }] });
  assert.equal(writes.length, 0);
  assert.equal(auth.pendingSelection.value.selectionToken, 'restricted');
  assert.deepEqual(routes, ['/select-branch']);
});

test('country selector defaults follow institution only for untouched new companies', async () => {
  const frontend = path.resolve(__dirname, '../../frontend');
  const { parse, compileScript } = require(path.join(frontend, 'node_modules/@vue/compiler-sfc'));
  const vue = require(path.join(frontend, 'node_modules/vue'));
  const filename = path.join(frontend, 'src/components/SupplierCountrySelect.vue');
  const source = compileScript(parse(fs.readFileSync(filename, 'utf8')).descriptor, { id: 'test-country' }).content;
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  async function mount(props) {
    const exports = {};
    let mounted;
    vm.runInNewContext(output, { exports, Intl, require: id => {
      if (id === 'vue') return { ...vue, onMounted: fn => { mounted = fn; } };
      if (id === 'vue-i18n') return { useI18n: () => ({ t: key => key, locale: vue.ref('en') }) };
      if (id.endsWith('/stores/auth')) return { useAuthStore: () => ({ activeBranchId: 'vn' }) };
      if (id.endsWith('/useApi')) return { api: { get: async () => ({ data: { data: [{ id: 'vn', countryCode: 'VN' }, { id: 'id', countryCode: 'ID' }] } }) } };
      throw Error(id);
    } });
    const bindings = exports.default.setup(props, { expose: () => {}, emit: (_event, value) => { props.modelValue = value; } });
    await mounted();
    await vue.nextTick();
    return bindings;
  }
  const props = vue.reactive({ modelValue: '', branchId: 'vn', autoDefault: true });
  const bindings = await mount(props);
  assert.equal(props.modelValue, 'VN');
  props.branchId = 'id';
  await vue.nextTick();
  assert.equal(props.modelValue, 'ID');
  bindings.select('CN');
  props.branchId = 'vn';
  await vue.nextTick();
  assert.equal(props.modelValue, 'CN');
  const existing = vue.reactive({ modelValue: 'VN', branchId: 'id', autoDefault: false });
  await mount(existing);
  assert.equal(existing.modelValue, 'VN');
});
