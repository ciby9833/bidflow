/** Local-only HTTP regression. Creates an isolated schema; never imports or modifies existing business data. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
require('reflect-metadata');
const originalUrl = process.env.DB_URL;
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(new URL(originalUrl).hostname)) throw Error('Local non-production database required');
const schema = 'test_employees_' + randomUUID().replaceAll('-', '');
const url = new URL(originalUrl); url.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DB_URL = url.toString(); process.env.NODE_ENV = 'test'; process.env.SMTP_HOST = '';
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { MailService } = require('../dist/shared/mail/mail.service');
const { I18nExceptionFilter } = require('../dist/shared/i18n/i18n.exception.filter');
const { User } = require('../dist/modules/auth/user.entity');
const { CompanyUser } = require('../dist/modules/auth/company-user.entity');
const { Branch } = require('../dist/modules/organization/branch.entity');
const { BranchMember } = require('../dist/modules/organization/branch-member.entity');

async function main() {
  const admin = new Client({ connectionString: originalUrl }); await admin.connect();
  let app, migrationDb;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    // Copy only the existing local schema definition, through TypeORM metadata, into our private schema.
    // Migrations are exercised elsewhere; no production or local business rows are copied.
    migrationDb = new DataSource({ type: 'postgres', url: process.env.DB_URL, schema,
      entities: [require('path').resolve(__dirname, '../dist/**/*.entity.js')], synchronize: true });
    await migrationDb.initialize(); await migrationDb.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService)
      .useValue({ getConfig: () => ({}), send: async () => { throw Error('No external mail in employee tests'); } }).compile();
    app = module.createNestApplication({ logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(app.get(I18nExceptionFilter));
    await app.listen(process.env.EMPLOYEE_UI === '1' ? 3012 : 0, '127.0.0.1');
    const ds = app.get(DataSource);
    // Verify isolation before creating any fixture.
    assert.equal((await ds.query('SELECT current_schema() AS schema'))[0].schema, schema);
    const existing = await ds.getRepository(User).count(); assert.equal(existing, 0, 'isolated database must be empty');
    const base = await app.getUrl();
    const password = 'Local-Employee-' + randomUUID();
    const hash = await require('argon2').hash(password);
    const branches = {};
    for (const [code, type, countryCode] of [['HQ','HQ',null],['BR','BRANCH','BR'],['VN','BRANCH','VN']]) {
      branches[code] = await ds.getRepository(Branch).save({ code, name: 'Employee test '+code, type, countryCode,
        status: 'active', settings: { currency: code==='BR'?'BRL':'VND', timezone: code==='BR'?'America/Sao_Paulo':'Asia/Ho_Chi_Minh' } });
    }
    const fixture = async (name, memberships, globalRole='super_admin') => {
      const u=await ds.getRepository(User).save({email:name+'@employee.example.invalid',loginName:name+'@employee.example.invalid',passwordHash:hash,displayName:name,accountType:'company_user',registerSource:'internal_created',role:globalRole,status:'active',tokenVersion:0});
      await ds.getRepository(CompanyUser).save({authUserId:u.id,fullName:name,status:'active'});
      for(const [branch,role] of memberships) await ds.getRepository(BranchMember).save({authUserId:u.id,branchId:branches[branch].id,role,status:'active'});
      return u;
    };
    const hq=await fixture('hq',[['HQ','hq_admin']]);
    const br=await fixture('br-admin',[['BR','super_admin']]);
    const vn=await fixture('vn-admin',[['VN','super_admin']]);
    const manager=await fixture('manager',[['BR','purchase_manager']]);
    const staff=await fixture('staff',[['BR','purchase_staff']]);
    const evaluator=await fixture('evaluator',[['BR','evaluator']]);
    const multi=await fixture('multi',[['BR','purchase_manager'],['VN','evaluator']]);
    const hqMulti=await fixture('hq-multi',[['HQ','hq_admin'],['BR','purchase_staff']]);
    async function call(method,path,body,token,status=200) {
      const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Locale':'en',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const result=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(result)}`);return result.data;
    }
    const login=async(name,branch)=>{
      let s=await call('POST','/api/auth/login',{login:name+'@employee.example.invalid',password},null,201);
      if(s.requiresBranchSelection)s=await call('POST','/api/auth/branches/select',{selectionToken:s.selectionToken,branchId:branches[branch].id},null,201);
      return s;
    };
    const h=await login('hq'), b=await login('br-admin'), v=await login('vn-admin'), m=await login('manager'), st=await login('staff'), ev=await login('evaluator');
    const make=(name,role,branchId)=>({email:name+'@employee.example.invalid',password,fullName:name,role,...(branchId?{branchId}:{})});
    const hb=await call('GET','/api/company-users/branches',null,h.accessToken);
    assert.deepEqual(hb.map(x=>x.code).sort(),['BR','HQ','VN']); assert.equal(h.user.role,'hq_admin');
    await call('POST','/api/company-users',make('no-target','purchase_staff'),h.accessToken,400);
    const hqCreated=await call('POST','/api/company-users',make('created-hq','hq_admin',branches.HQ.id),h.accessToken,201);
    const created=await call('POST','/api/company-users',make('created-br','purchase_staff',branches.BR.id),h.accessToken,201);
    const hqLogin=await login('created-hq'); assert.equal(hqLogin.user.role,'hq_admin'); assert.ok(hqLogin.scopes.includes('org:manage'));
    await call('POST','/api/company-users',make('invalid-hq','purchase_staff',branches.HQ.id),h.accessToken,400);
    await call('POST','/api/company-users',make('invalid-br','hq_admin',branches.BR.id),h.accessToken,400);
    const own=await call('POST','/api/company-users',make('manager-created','evaluator'),m.accessToken,201);assert.equal(own.branchId,branches.BR.id);
    await call('POST','/api/company-users',make('cross-branch','purchase_staff',branches.VN.id),b.accessToken,403);
    await call('POST','/api/company-users',make('escalation','super_admin'),m.accessToken,403);
    await call('PATCH','/api/company-users/'+br.id,{branchId:branches.BR.id,role:'evaluator'},m.accessToken,403);
    for(const denied of [st,ev]) await call('POST','/api/company-users',make('denied','purchase_staff'),denied.accessToken,403);
    await call('PATCH','/api/company-users/'+vn.id,{role:'purchase_staff'},b.accessToken,403);
    await call('PATCH','/api/company-users/'+vn.id,{branchId:branches.VN.id,role:'purchase_staff'},b.accessToken,403);
    console.log('PASS HQ creates headquarters/branch users; branch creation locked to own institution; staff/evaluator denied; manager cannot elevate');
    const multiSession=await login('multi','BR');
    const brRows=await call('GET','/api/company-users',null,b.accessToken);
    assert.equal(brRows.find(x=>x.id===multi.id).role,'purchase_manager');assert.ok(brRows.every(x=>x.branch.id===branches.BR.id));
    await call('PATCH','/api/company-users/'+multi.id,{role:'purchase_staff',fullName:'stolen-global-profile'},b.accessToken,403);
    await call('PATCH','/api/company-users/'+multi.id,{role:'purchase_staff'},b.accessToken);
    await call('GET','/api/auth/me',null,multiSession.accessToken,401);
    let relog=await login('multi','BR');assert.equal(relog.user.role,'purchase_staff');assert.ok(!relog.scopes.includes('user:create'));
    const switched=await call('POST','/api/auth/branches/switch',{branchId:branches.VN.id},relog.accessToken,201);
    assert.equal(switched.user.role,'evaluator');await call('GET','/api/auth/me',null,relog.accessToken,401);
    await call('POST','/api/auth/branches/switch',{branchId:branches.HQ.id},switched.accessToken,403);
    await call('PATCH','/api/company-users/'+multi.id,{status:'suspended'},b.accessToken);
    await call('GET','/api/auth/me',null,switched.accessToken,401);
    relog=await login('multi','VN');assert.equal(relog.user.role,'evaluator');assert.equal(relog.branches.length,1);
    await call('PATCH','/api/company-users/'+multi.id,{status:'active'},b.accessToken);
    await call('GET','/api/auth/me',null,relog.accessToken,401);
    relog=await login('multi','BR');
    await call('POST','/api/auth/logout',{},relog.accessToken,201);
    await call('GET','/api/auth/me',null,relog.accessToken,401);
    const both=await call('GET','/api/company-users',null,h.accessToken);
    assert.equal(both.filter(x=>x.id===multi.id).length,2); assert.ok(both.some(x=>x.id===hqCreated.id&&x.branch.type==='HQ'));
    await call('PATCH','/api/company-users/'+br.id,{status:'suspended'},b.accessToken,400);
    await call('PATCH','/api/company-users/'+created.id,{branchId:branches.BR.id,role:'purchase_manager'},h.accessToken);
    const createdLogin=await login('created-br');assert.equal(createdLogin.user.role,'purchase_manager');assert.ok(createdLogin.scopes.includes('user:create'));
    let hs=await login('hq-multi','HQ');if(hs.activeBranchId!==branches.HQ.id)hs=await call('POST','/api/auth/branches/switch',{branchId:branches.HQ.id},hs.accessToken,201);
    hs=await call('POST','/api/auth/branches/switch',{branchId:branches.BR.id},hs.accessToken,201);assert.equal(hs.user.role,'purchase_staff');assert.ok(!hs.scopes.includes('org:manage'));
    hs=await call('POST','/api/auth/branches/switch',{branchId:branches.HQ.id},hs.accessToken,201);assert.equal(hs.user.role,'hq_admin');assert.ok(hs.scopes.includes('user:create'));
    const legacy=await fixture('legacy-suspended',[['BR','purchase_staff'],['VN','evaluator']]);
    await ds.getRepository(User).update(legacy.id,{status:'suspended'});
    await call('PATCH','/api/company-users/'+legacy.id,{status:'active'},b.accessToken,403);
    await call('PATCH','/api/company-users/'+legacy.id,{branchId:branches.BR.id,status:'active'},h.accessToken);
    const restored=await login('legacy-suspended','BR');
    assert.equal(restored.branches.length,1);assert.equal(restored.activeBranchId,branches.BR.id);
    await call('POST','/api/auth/branches/switch',{branchId:branches.VN.id},restored.accessToken,403);
    console.log('PASS membership roles/statuses isolated; list matches auth; old tokens revoked on edits, logout and switch; last admin protected');
    if(process.env.EMPLOYEE_UI==='1'){
      const file='/tmp/bidflow-employee-ui.json';require('fs').writeFileSync(file,JSON.stringify({base,password,branches,accounts:{hq:hq.email,admin:br.email,manager:manager.email,multi:multi.email,hqMulti:hqMulti.email,staff:staff.email}},null,2),{mode:0o600});
      console.log('READY local browser fixtures at '+file);
      await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
    }
  }finally{
    if(app)await app.close();if(migrationDb?.isInitialized)await migrationDb.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
