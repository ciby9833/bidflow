/** Build first. Uses an isolated local PostgreSQL schema, removed in finally. */
require('dotenv').config({path: require('path').resolve(__dirname, '../.env')});
require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DataSource}=require('typeorm');
const {marketSettings,currencyCode}=require('../dist/shared/config/market-policy');
const {normalizeSupplierTaxId}=require('../dist/modules/supplier/supplier-tax-id');
const {convertAmount,checkedAmount,decreaseLimit}=require('../dist/modules/quote/money');
const {validateAttachmentReferences}=require('../dist/shared/upload/attachment-reference');
const {scopesForAccount}=require('../dist/shared/rbac/scope-map');
const {UploadAccessService}=require('../dist/shared/upload/upload-access.service');
const {BrazilTaxIdentity1713750000036}=require('../dist/migrations/1713750000036-BrazilTaxIdentity');
const {RestoreOptionalTaxIdentity1713810000042}=require('../dist/migrations/1713810000042-RestoreOptionalTaxIdentity');
const {TenderTimezone1713740000035}=require('../dist/migrations/1713740000035-TenderTimezone');
const {QuoteBranchScopedKeys1713760000037}=require('../dist/migrations/1713760000037-QuoteBranchScopedKeys');
const {QuoteService}=require('../dist/modules/quote/quote.service');
const {WsGateway}=require('../dist/modules/notification/ws.gateway');
const {buildTenderInvitationEmail}=require('../dist/shared/mail/templates/tender-invitation.template');

test('Portuguese dictionaries cover English keys with identical interpolation parameters',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const flatten=(obj,prefix='')=>Object.entries(obj).flatMap(([k,v])=>typeof v==='object'?flatten(v,prefix+k+'.'):[[prefix+k,v]]);
  for(const base of ['../../frontend/src/i18n','../src/shared/i18n/locales']){
    const read=locale=>JSON.parse(fs.readFileSync(path.resolve(__dirname,base,locale+'.json'),'utf8'));
    const pt=new Map(flatten(read('pt-BR')));
    for(const [key,value] of flatten(read('en'))){
      assert.equal(typeof pt.get(key),'string',key);
      assert.deepEqual((value.match(/\{[^}]+\}/g)||[]).sort(),(pt.get(key).match(/\{[^}]+\}/g)||[]).sort(),key);
    }
  }
});
test('FX provider errors and non-positive rates fail closed; a locked round rate avoids provider access',async()=>{
  const svc=Object.create(QuoteService.prototype),originalFetch=global.fetch;
  let saved=0;
  const em={query:async()=>[],findOne:async()=>null,create:(_,v)=>v,save:async v=>{saved++;return v}};
  svc.ds={transaction:fn=>fn(em)};
  try{
    for(const rate of [null,0,-1,'NaN']){
      global.fetch=async()=>({ok:true,json:async()=>({rate})});
      await assert.rejects(()=>svc.getOrCreateTenderRoundRate({id:'t',branchId:'br'},'USD','BRL','2026-11-12'));
    }
    assert.equal(saved,0);
    global.fetch=async()=>{throw Error('must not fetch')};
    em.findOne=async()=>({exchangeRate:'5.123',rateDate:'2026-11-12'});
    assert.equal((await svc.getOrCreateTenderRoundRate({id:'t',branchId:'br'},'USD','BRL','2026-11-12')).exchangeRate,'5.123');
  }finally{global.fetch=originalFetch}
});

test('Brazil defaults, explicit Brazilian regional timezone, invalid configuration fail closed',()=>{
  assert.deepEqual(marketSettings('BR'),{currency:'BRL',timezone:'America/Sao_Paulo',defaultLocale:'pt-BR'});
  assert.equal(marketSettings('BR',{timezone:'America/Manaus'}).timezone,'America/Manaus');
  assert.equal(currencyCode(' brl '),'BRL');
  for(const settings of [{currency:'INVALID'},{timezone:'Brazil/Invalid'}]) assert.throws(()=>marketSettings('BR',settings));
  assert.equal(currencyCode('eur'),'EUR');
  assert.deepEqual(marketSettings('SG'),{});
  assert.equal(marketSettings('BR',{defaultLocale:'pt-PT'}).defaultLocale,'pt-PT');
  assert.equal(marketSettings('VN').currency,'VND');
});
test('CNPJ old numeric and new official alphanumeric example; checksum, case and punctuation',()=>{
  assert.equal(normalizeSupplierTaxId('BR','12.abc.345/01de-35',true),'12ABC34501DE35');
  assert.equal(normalizeSupplierTaxId('BR','11.222.333/0001-81',true),'11222333000181');
  for(const v of ['', '00000000000000','12ABC34501DE34','12ABC34501DE3X','12ABC34501DE35<script>'])assert.throws(()=>normalizeSupplierTaxId('BR',v,true));
  assert.equal(normalizeSupplierTaxId('VN','VN-123'),'VN-123');
});
test('Decimal conversion and decrement boundaries; reject NaN, negative, excess precision and overflow',()=>{
  assert.equal(convertAmount(1.005,1),1.005);
  assert.equal(convertAmount(0.1,0.2),0.02);
  assert.equal(convertAmount(10,5.123456789),51.2346);
  assert.equal(decreaseLimit(100.01,0.5),99.5099);
  assert.equal(checkedAmount(100_000_000_001).toNumber(),100_000_000_001);
  for(const v of [NaN,Infinity,-1,0,1e16,0.00001,'10'])assert.throws(()=>checkedAmount(v));
  assert.throws(()=>convertAmount(0.0001,0.0001));
  assert.throws(()=>convertAmount(1,Infinity));
});
test('Attachment write references reject stolen objects, URL/key mismatch and traversal; retain teammate files',()=>{
  const own={key:'quote-attachments/u/a.pdf',fileUrl:'/api/uploads/preview/quote-attachments%2Fu%2Fa.pdf'};
  validateAttachmentReferences([own],[],'u','quote-attachments');
  validateAttachmentReferences([own],[own],'teammate','quote-attachments');
  assert.throws(()=>validateAttachmentReferences([own],[],'other','quote-attachments'));
  assert.throws(()=>validateAttachmentReferences([{...own,fileUrl:'/api/uploads/preview/quote-attachments%2Fvictim%2Fb.pdf'}],[],'u','quote-attachments'));
  assert.throws(()=>validateAttachmentReferences([{key:'quote-attachments/u/../a.pdf'}],[],'u','quote-attachments'));
  assert.throws(()=>validateAttachmentReferences([{fileUrl:'https://evil.example/x'}],[],'u','quote-attachments'));
});
test('Role capabilities use current institution membership, not global admin role',()=>{
  const user={role:'super_admin',accountType:'company_user',branch:{isHq:false,activeRole:'evaluator'}};
  assert.equal(scopesForAccount(user).includes('tender:create'),false);
  assert.equal(scopesForAccount(user).includes('quote:view_all'),true);
  assert.equal(scopesForAccount({...user,branch:{isHq:false,activeRole:'purchase_staff'}}).includes('tender:publish'),false);
  const hq=scopesForAccount({...user,branch:{isHq:true,activeRole:'hq_admin'}});
  assert.equal(hq.includes('tender:create'),false);
  assert.equal(hq.includes('supplier:create'),true);
  assert.equal(scopesForAccount({...user,accountType:'supplier_account'}).includes('*'),false);
  assert.deepEqual(scopesForAccount({...user,branch:{isHq:false}}),[]);
});
test('Directed tender: future, declined, expired invitations cannot bid or obtain realtime rank',async()=>{
  const svc=Object.create(QuoteService.prototype),t={id:'t',participationMode:'selected',currentQuoteRound:2};
  for(const inv of [null,{status:'declined'},{status:'expired'},{status:'pending',visibleAt:new Date(Date.now()+60000)}]){
    svc.invRepo={findOne:async()=>inv};
    await assert.rejects(()=>svc.ensureCanParticipate(t,'s'));
  }
  svc.invRepo={findOne:async()=>({status:'accepted'})};
  await svc.ensureCanParticipate(t,'s');
  svc.resolveLotContext=async()=>({roundNo:2});
  svc.redis={exists:async()=>true,zrank:async()=>2,zcard:async()=>10};
  assert.deepEqual(await svc.getMyRank({},'lot','s','leading_flag'),{hasQuote:true,rankingMode:'leading_flag',isLeading:false,total:10});
});
test('Portuguese notification includes tender timezone, not host timezone',()=>{
  const mail=buildTenderInvitationEmail({to:'test@example.invalid',locale:'pt-BR',tenderNo:'BR-1',tenderTitle:'Teste',timezone:'America/Sao_Paulo',bidDeadline:'2026-11-12T15:00:00Z'});
  assert.match(mail.subject,/Convite/);
  assert.match(mail.text,/12:00/);
  assert.match(mail.text,/America\/Sao_Paulo/);
});
test('WebSocket rejects restricted tokens; snapshots use live permissions and never raw broadcasts',async()=>{
  let revoked=false,handler;const channels=new Set();
  const subscriber={on:(e,h)=>{handler=h},subscribe:async c=>channels.add(c),unsubscribe:async c=>channels.delete(c),disconnect:()=>{}};
  const principal={accountType:'supplier_account',supplierId:'s',branch:{activeBranchId:'br',scope:{readable:['br'],writable:'br'}}};
  const gateway=new WsGateway({verify:t=>t==='restricted'?{purpose:'branch_selection'}:{activeBranchId:'br'}},{raw:{duplicate:()=>subscriber}},
    {validate:async()=>{if(revoked)throw Error('revoked');return principal}},
    {getMyRankForSupplier:async(scope,lot)=>{if(lot.startsWith('0'))throw Error('foreign');return {hasQuote:true,isLeading:true}}});
  const socket=(id,token)=>({id,handshake:{auth:{token}},events:[],emit(event,data){this.events.push({event,data})},disconnect(){this.closed=true}});
  try{
    const denied=socket('denied','restricted');await gateway.handleConnection(denied);assert.equal(denied.closed,true);
    const s=socket('good','valid');await gateway.handleConnection(s);
    const lot='11111111-1111-4111-8111-111111111111';
    await gateway.subscribeLot(s,{lotId:lot});
    assert.equal(channels.size,1);assert.equal(s.events[0].event,'rank_snapshot');
    assert.equal(s.events[0].data.supplierId,undefined);
    revoked=true;handler('lot:'+lot+':channel','{"supplierId":"victim","price":10}');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.closed,true);assert.equal(channels.size,0);
  }finally{gateway.onModuleDestroy()}
});
test('Real PostgreSQL: tax policy restoration, migration backfill, attachment access across roles and institutions',async()=>{
  const schema='test_brazil_'+randomUUID().replaceAll('-','');
  const admin=new DataSource({type:'postgres',url:process.env.DB_URL});await admin.initialize();let db;
  try{
    await admin.query('CREATE SCHEMA "'+schema+'"');
    db=new DataSource({type:'postgres',url:process.env.DB_URL,extra:{options:'-c search_path='+schema}});await db.initialize();
    await db.query(`CREATE TABLE branches(id text,status text,country_code text,settings jsonb);
      CREATE TABLE suppliers(id text,country_code text,tax_id text);
      CREATE TABLE supplier_documents(supplier_id text,object_key text,file_url text);
      CREATE TABLE supplier_branch_profiles(supplier_id text,branch_id text,status text);
      CREATE TABLE tenders(id text,branch_id text,status text,is_hall_visible bool,hall_visibility text,hall_visible_branches jsonb,participation_mode text,current_quote_round int,attachments jsonb);
      CREATE TABLE invitations(id text,tender_id text,supplier_id text,round_no int,status text,visible_at timestamptz);
      CREATE TABLE lot_quote_attachments(branch_id text,supplier_id text,attachments jsonb);
      CREATE TABLE quotes(branch_id text,tender_id text,quote_no text UNIQUE);
      CREATE TABLE line_quotes(branch_id text,tender_id text,quote_no text UNIQUE);`);
    await db.query(`INSERT INTO branches VALUES('br','active','BR','{}'),('vn','active','VN','{}');
      INSERT INTO suppliers VALUES('s','BR','12ABC34501DE35');
      INSERT INTO supplier_branch_profiles VALUES('s','br','active');
      INSERT INTO tenders VALUES('t','br','open',false,'branch','[]','selected',1,'[]');`);
    const runner=db.createQueryRunner();await runner.connect();
    await new BrazilTaxIdentity1713750000036().up(runner);
    await new TenderTimezone1713740000035().up(runner);
    await new QuoteBranchScopedKeys1713760000037().up(runner);await runner.release();
    for(const table of ['quotes','line_quotes']) {
      await db.query(`INSERT INTO ${table} VALUES('br','t','Q-1'),('vn','t','Q-1')`);
      await assert.rejects(()=>db.query(`INSERT INTO ${table} VALUES('br','t','Q-1')`), e=>e.code==='23505');
      await assert.rejects(()=>db.query(`INSERT INTO ${table} VALUES(NULL,'t','Q-2')`), e=>e.code==='23502');
    }
    assert.equal((await db.query("SELECT timezone FROM tenders"))[0].timezone,'America/Sao_Paulo');
    // Simulate the superseded index on an already-upgraded installation.
    await db.query(`CREATE UNIQUE INDEX uq_supplier_br_cnpj ON suppliers
      (upper(regexp_replace(tax_id,'[^A-Za-z0-9]','','g')))
      WHERE country_code='BR' AND tax_id IS NOT NULL AND trim(tax_id)<>''`);
    await assert.rejects(()=>db.query("INSERT INTO suppliers VALUES('duplicate','BR','12.abc.345/01de-35')"),e=>e.code==='23505');
    const restoreRunner=db.createQueryRunner();await restoreRunner.connect();
    await new RestoreOptionalTaxIdentity1713810000042().up(restoreRunner);await restoreRunner.release();
    await db.query("INSERT INTO suppliers VALUES('duplicate','BR','12.abc.345/01de-35')");
    const freshRunner=db.createQueryRunner();await freshRunner.connect();
    await new BrazilTaxIdentity1713750000036().up(freshRunner);await freshRunner.release();
    await db.query("INSERT INTO suppliers VALUES('crossborder','VN','12ABC34501DE35')");
    const key='supplier-documents/u/proof.pdf';
    await db.query("INSERT INTO supplier_documents VALUES('s',$1,NULL)",[key]);
    const access=new UploadAccessService(db);
    const user=(branch,role='purchase_manager',supplierId)=>({id:'u2',role,accountType:supplierId?'supplier_account':'company_user',supplierId,branch:{activeBranchId:branch,isHq:false,activeRole:role,scope:{readable:[branch]}}});
    await access.authorize(key,user('br'));
    await access.authorize(key,user('br','supplier','s'));
    await assert.rejects(()=>access.authorize(key));
    await assert.rejects(()=>access.authorize(key,user('vn')));
    await assert.rejects(()=>access.authorize(key,user('br','supplier','other')));
    await assert.rejects(()=>access.authorize(key,user('br','evaluator')));
    const tkey='tender-attachments/u/t.pdf';
    await db.query("UPDATE tenders SET attachments=$1",[JSON.stringify([{key:tkey}])]);
    await assert.rejects(()=>access.authorize(tkey,user('br','supplier','s')));
    await db.query("INSERT INTO invitations VALUES('i','t','s',1,'accepted',NULL)");
    await access.authorize(tkey,user('br','supplier','s'));
    await db.query("UPDATE invitations SET status='expired'");
    await assert.rejects(()=>access.authorize(tkey,user('br','supplier','s')));
    await db.query("UPDATE tenders SET is_hall_visible=true,hall_visibility='global'");
    await access.authorize(tkey);
    await db.query("UPDATE tenders SET status='draft'");
    await assert.rejects(()=>access.authorize(tkey));
    const qkey='quote-attachments/u/q.pdf';
    await db.query("INSERT INTO lot_quote_attachments VALUES('br','s',$1)",[JSON.stringify([{key:qkey}])]);
    await access.authorize(qkey,user('br','evaluator'));
    await assert.rejects(()=>access.authorize(qkey,user('vn','evaluator')));
    await assert.rejects(()=>access.authorize(qkey,user('br','supplier','other')));
  }finally{
    if(db?.isInitialized)await db.destroy();
    await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.destroy();
  }
});
