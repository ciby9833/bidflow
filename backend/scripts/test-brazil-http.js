/** Local-only full Nest/HTTP/PostgreSQL/Redis smoke test. Adds labeled fixtures, then disables them. */
require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
if(!['localhost','127.0.0.1','::1'].includes(new URL(process.env.DB_URL).hostname))throw Error('Local PostgreSQL required');
process.env.SMTP_HOST='';process.env.NODE_ENV='test';
require('reflect-metadata');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const argon2=require('argon2');
const {io}=require('../../frontend/node_modules/socket.io-client');
const {Test}=require('@nestjs/testing');
const {ValidationPipe}=require('@nestjs/common');
const {DataSource}=require('typeorm');
const {AppModule}=require('../dist/app.module');
const {MailService}=require('../dist/shared/mail/mail.service');
const {I18nExceptionFilter}=require('../dist/shared/i18n/i18n.exception.filter');
const {User}=require('../dist/modules/auth/user.entity');
const {Branch}=require('../dist/modules/organization/branch.entity');
const {BranchMember}=require('../dist/modules/organization/branch-member.entity');
const {Supplier}=require('../dist/modules/supplier/supplier.entity');
const {SupplierAccount}=require('../dist/modules/auth/supplier-account.entity');
const {SupplierBranchProfile}=require('../dist/modules/supplier/supplier-branch-profile.entity');

async function main(){
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(MailService)
    .useValue({getConfig:()=>({}),send:async()=>({})}).compile();
  const app=module.createNestApplication({logger:['error']});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  app.useGlobalFilters(app.get(I18nExceptionFilter));
  await app.listen(0,'127.0.0.1');
  const base=await app.getUrl(),ds=app.get(DataSource),tag=randomUUID().slice(0,8),users=[],branches=[];
  const pwd=randomUUID(),hash=await argon2.hash(pwd);
  async function call(method,path,body,token,status=200){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Locale':'pt-BR',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await r.json();assert.equal(r.status,status,method+' '+path+' '+JSON.stringify(data));return data.data;
  }
  const makeUser=async(role,supplierId)=>{
    const repo=ds.getRepository(User),u=await repo.save(repo.create({email:tag+'-'+users.length+'@example.invalid',loginName:tag+'-'+users.length+'@example.invalid',passwordHash:hash,role,accountType:supplierId?'supplier_account':'company_user',supplierId,displayName:'Brazil HTTP test',locale:'pt-BR',tokenVersion:0,status:'active',registerSource:'internal_created'}));users.push(u.id);return u;
  };
  try{
    const brRepo=ds.getRepository(Branch);
    for(const [country,currency,timezone] of [['BR','BRL','America/Sao_Paulo'],['VN','VND','Asia/Ho_Chi_Minh']]){
      branches.push(await brRepo.save(brRepo.create({code:'TEST-'+country+'-'+tag,name:'HTTP test '+country+' '+tag,type:'BRANCH',countryCode:country,status:'active',settings:{currency,timezone,defaultLocale:country==='BR'?'pt-BR':'vi-VN'}})));
    }
    const buyer=await makeUser('super_admin');
    await ds.getRepository(BranchMember).save(branches.map((b,i)=>({branchId:b.id,authUserId:buyer.id,role:i?'evaluator':'purchase_manager',status:'active'})));
    const login=await call('POST','/api/auth/login',{login:buyer.email,password:pwd},null,201);
    assert.equal(login.requiresBranchSelection,true);
    await call('GET','/api/tenders',undefined,login.selectionToken,401);
    const session=await call('POST','/api/auth/branches/select',{selectionToken:login.selectionToken,branchId:branches[0].id},null,201);
    let buyerToken=session.accessToken;
    assert.equal(session.scopes.includes('tender:create'),true);
    const company=await call('POST','/api/suppliers',{legalName:'HTTP Brasil '+tag,shortName:'BR Test'},buyerToken,201);
    assert.equal(company.countryCode,'BR');
    const optionalTax=await call('POST','/api/suppliers',{legalName:'Original tax policy '+tag,shortName:'Original',taxId:'123'},buyerToken,201);
    assert.equal(optionalTax.taxId,'123');
    await call('POST','/api/suppliers',{legalName:'Same tax ID '+tag,shortName:'Original duplicate',taxId:'123'},buyerToken,201);
    await ds.getRepository(Supplier).update(company.id,{reviewStatus:'pending_review'});
    await call('POST','/api/suppliers/'+company.id+'/approve',{},buyerToken,201);
    await ds.getRepository(Supplier).update(company.id,{reviewStatus:'approved',status:'active'});
    await ds.getRepository(SupplierBranchProfile).save({supplierId:company.id,branchId:branches[1].id,status:'active'});
    const supplier=await makeUser('supplier',company.id);
    await ds.getRepository(SupplierAccount).save({authUserId:supplier.id,supplierId:company.id,isPrimary:true,relationRole:'owner',status:'active'});
    const sl=await call('POST','/api/auth/login',{login:supplier.email,password:pwd},null,201);
    const ss=await call('POST','/api/auth/branches/select',{selectionToken:sl.selectionToken,branchId:branches[0].id},null,201);
    let supplierToken=ss.accessToken;
    const tender=await call('POST','/api/tenders',{title:'HTTP Brazil tender '+tag,type:'routine',bidDeadline:new Date(Date.now()+86400000).toISOString(),notifySuppliers:false,participationMode:'all',lots:[{title:'Test lot',quantity:1}]},buyerToken,201);
    assert.equal(tender.baseCurrency,'BRL');assert.equal(tender.timezone,'America/Sao_Paulo');
    const detail=await call('GET','/api/tenders/'+tender.id,undefined,buyerToken);
    const lot=detail.lots[0];
    const candidates=await call('GET','/api/tenders/'+tender.id+'/participant-options',undefined,buyerToken);
    assert.equal(candidates.total,1);assert.equal(candidates.items[0].id,company.id);
    await call('POST','/api/tenders/'+tender.id+'/publish',{},buyerToken,201);
    // Public search must work across pages while preserving branch visibility.
    const { Tender } = require('../dist/modules/tender/tender.entity');
    await ds.getRepository(Tender).update(tender.id, { isHallVisible: true, hallVisibility: 'branch' });
    const hallPath = '/api/hall/tenders?search=' + encodeURIComponent(tag);
    const hall = await call('GET', hallPath + '&limit=1', undefined, buyerToken);
    assert.equal(hall.length, 1); assert.equal(hall[0].id, tender.id);
    assert.equal((await call('GET', hallPath + '&limit=1&page=2', undefined, buyerToken)).length, 0);
    assert.equal((await call('GET', '/api/hall/tenders?search=' + encodeURIComponent(tender.tenderNo), undefined, supplierToken))[0].id, tender.id);
    assert.equal((await call('GET', hallPath, undefined, undefined)).length, 0);
    const visibleSummary = await call('GET', '/api/hall/portal-summary', undefined, buyerToken);
    const anonymousSummary = await call('GET', '/api/hall/portal-summary', undefined, undefined);
    assert.equal(visibleSummary.publicTenderCount, anonymousSummary.publicTenderCount + 1);
    console.log('PASS public hall: search, pagination, branch visibility and matching summary');
    const quote=await call('POST','/api/quotes',{lotId:lot.id,totalPrice:100.01,currency:'BRL',idempotencyKey:'same-key-across-rounds'},supplierToken,201);
    assert.equal(Number(quote.quote.priceInBase),100.01);
    const rank=await call('GET','/api/quotes/lots/'+lot.id+'/my-rank',undefined,supplierToken);
    assert.equal(rank.isLeading,true);assert.equal(rank.myRank,undefined);
    await new Promise((resolve,reject)=>{
      const socket=io(base,{path:'/ws',auth:{token:supplierToken},transports:['websocket'],reconnection:false});
      const timer=setTimeout(()=>{socket.close();reject(Error('WebSocket snapshot timeout'))},5000);
      const finish=(error)=>{clearTimeout(timer);socket.close();error?reject(error):resolve()};
      socket.on('connect',()=>socket.emit('subscribe_lot',{lotId:lot.id}));
      socket.on('error',e=>finish(Error(JSON.stringify(e))));
      socket.on('connect_error',finish);
      socket.on('rank_snapshot',data=>{try{assert.equal(data.isLeading,true);assert.equal(data.myRank,undefined);assert.equal(data.supplierId,undefined);finish()}catch(e){finish(e)}});
    });
    // Ordinary lots must have independent rounds, including read, ranking and export paths.
    await call('POST','/api/tenders/'+tender.id+'/close',{},buyerToken,201);
    await call('POST','/api/tenders/'+tender.id+'/rounds/next',{},buyerToken,201);
    await call('PATCH','/api/tenders/'+tender.id,{bidDeadline:new Date(Date.now()+172800000).toISOString()},buyerToken);
    await call('POST','/api/tenders/'+tender.id+'/publish',{},buyerToken,201);
    const emptyRound=await call('GET','/api/quotes/lots/'+lot.id+'/mine',undefined,supplierToken);
    assert.equal(emptyRound.quote,null);assert.equal(emptyRound.ability.usedRebidCount,0);assert.equal(emptyRound.roundNo,2);
    await call('POST','/api/quotes',{lotId:lot.id,roundNo:1,totalPrice:200.25,currency:'BRL'},supplierToken,409);
    assert.equal((await call('GET','/api/quotes/lots/'+lot.id+'/my-rank',undefined,supplierToken)).hasQuote,false);
    const second=await call('POST','/api/quotes',{lotId:lot.id,totalPrice:200.25,currency:'BRL',idempotencyKey:'same-key-across-rounds'},supplierToken,201);
    assert.equal(second.quote.version,1);assert.equal(second.quote.roundNo,2);
    const history=await call('GET','/api/quotes/lots/'+lot.id+'/mine/history',undefined,supplierToken);
    assert.equal(history.length,1);assert.equal(history[0].roundNo,2);
    const review=await call('GET','/api/tenders/'+tender.id+'/quote-review',undefined,buyerToken);
    assert.equal(Number(review.rounds.find(r=>r.roundNo===1).lots[0].latestQuotes[0].totalPrice),100.01);
    assert.equal(Number(review.rounds.find(r=>r.roundNo===2).lots[0].latestQuotes[0].totalPrice),200.25);
    await call('POST','/api/quotes/lots/'+lot.id+'/snapshot',{trigger:'EVAL_FREEZE'},buyerToken,201);
    await call('POST','/api/tenders/'+tender.id+'/close',{},buyerToken,201);
    const frozen=await call('POST','/api/quotes/lots/'+lot.id+'/snapshot',{trigger:'EVAL_FREEZE'},buyerToken,201);
    assert.equal(frozen.snapshotData.length,1);assert.equal(frozen.snapshotData[0].roundNo,2);
    const exportResponse=await fetch(base+'/api/export/tenders/'+tender.id+'/quotes?mode=full&round=2&fields=roundNo,totalPrice,currency',{headers:{Authorization:'Bearer '+buyerToken,'X-Locale':'en'}});
    assert.equal(exportResponse.status,200);
    const workbook=new (require('exceljs').Workbook)();
    await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
    const cells=[];workbook.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>cells.push(cell.value))));
    assert.ok(cells.includes(200.25));assert.ok(!cells.includes(100.01));
    console.log('PASS ordinary lot round isolation: first quote, limits, history, ranking, review and snapshot');
    const transport=await call('POST','/api/tenders',{title:'HTTP transport freeze '+tag,type:'transport',bidDeadline:new Date(Date.now()+86400000).toISOString(),notifySuppliers:false,participationMode:'all',lots:[{title:'Transport freeze',lineColumns:[{key:'route',label:'Route'},{key:'days',label:'Days',required:true}],lines:[{data:{route:'Sao Paulo - Santos'}},{data:{route:'Rio - Campinas'}}]}]},buyerToken,201);
    const tl=transport.lots[0], freezePath='/api/quotes/lots/'+tl.id+'/snapshot';
    await call('POST','/api/tenders/'+transport.id+'/publish',{},buyerToken,201);
    for(let i=0;i<2;i++) await call('POST','/api/quotes/lines/'+tl.lines[i].id,{totalPrice:100+i*50,currency:'BRL',items:{days:String(i+2)}},supplierToken,201);
    await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:1},buyerToken,201);
    await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:1},supplierToken,403);
    await call('GET','/api/quotes/lots/'+tl.id+'/snapshots',undefined,supplierToken,403);
    await call('POST','/api/tenders/'+transport.id+'/close',{},buyerToken,201);
    await call('POST',freezePath,{trigger:'CANCEL',roundNo:1},buyerToken,201);
    await call('POST',freezePath,{trigger:'NOT_A_TRIGGER',roundNo:1},buyerToken,400);
    await call('PUT','/api/quotes/lots/'+tl.id+'/attachments',{attachments:[]},supplierToken,200);
    const concurrent=await Promise.all([call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:1},buyerToken,201),call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:1},buyerToken,201)]);
    assert.notEqual(concurrent[0].id,concurrent[1].id);
    const frozenLines=concurrent[0];assert.equal(frozenLines.roundNo,1);assert.equal(frozenLines.snapshotData.length,2);
    const reopenPreview=await call('GET','/api/tenders/'+transport.id+'/deadline-changes/preview',undefined,buyerToken);
    await call('POST','/api/tenders/'+transport.id+'/deadline-changes',{
      newDeadline:new Date(Date.now()+172800000).toISOString(), reason:'Restore existing reopen workflow', announcement:'Local test reopening',
      expectedRound:reopenPreview.round, expectedStatus:reopenPreview.status, expectedUpdatedAt:reopenPreview.updatedAt,
      expectedVersion:reopenPreview.version, idempotencyKey:randomUUID(),
    },buyerToken,201);
    const preserved=await call('GET','/api/quotes/lots/'+tl.id+'/snapshots',undefined,buyerToken);
    assert.deepEqual(preserved.find(s=>s.id===frozenLines.id),frozenLines);
    await call('POST','/api/tenders/'+transport.id+'/close',{},buyerToken,201);
    assert.ok(frozenLines.snapshotData.every(q=>q.rank===1&&q.lineId&&q.quoteId&&q.items.days&&q.lineData.route));
    await call('POST','/api/quotes/lines/'+tl.lines[0].id,{totalPrice:90,currency:'BRL',items:{days:'1'}},supplierToken,403);
    await call('POST','/api/tenders/'+transport.id+'/rounds/next',{},buyerToken,201);
    await call('PATCH','/api/tenders/'+transport.id,{bidDeadline:new Date(Date.now()+172800000).toISOString()},buyerToken);
    await call('POST','/api/tenders/'+transport.id+'/publish',{},buyerToken,201);
    await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:1},buyerToken,409);
    const t2=await call('GET','/api/tenders/'+transport.id,undefined,buyerToken);
    assert.ok(t2.lots[0].lines.every(l=>!tl.lines.some(old=>old.id===l.id)));
    await call('POST','/api/quotes/lines/'+t2.lots[0].lines[0].id,{totalPrice:200,currency:'BRL',items:{days:'5'}},supplierToken,201);
    await call('POST','/api/tenders/'+transport.id+'/close',{},buyerToken,201);
    const f2=await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:2},buyerToken,201);
    assert.equal(f2.snapshotData.length,1);assert.equal(f2.snapshotData[0].totalPrice,200);assert.equal(f2.snapshotData[0].roundNo,2);
    const saved=await call('GET','/api/quotes/lots/'+tl.id+'/snapshots',undefined,buyerToken);
    assert.equal(saved.length,4);assert.deepEqual(saved.find(s=>s.id===frozenLines.id),frozenLines);
    const staff=await makeUser('purchase_staff');
    await ds.getRepository(BranchMember).save({branchId:branches[0].id,authUserId:staff.id,role:'purchase_staff',status:'active'});
    const staffSession=await call('POST','/api/auth/login',{login:staff.email,password:pwd},null,201);
    await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:2},staffSession.accessToken,403);
    await call('GET','/api/export/tenders/'+transport.id+'/quotes?mode=full',undefined,staffSession.accessToken,403);
    await call('GET','/api/export/tenders/'+transport.id+'/quotes?mode=FULL',undefined,staffSession.accessToken,400);
    await call('GET','/api/export/tenders/'+transport.id+'/quotes?mode=anything',undefined,staffSession.accessToken,400);
    console.log('PASS transport snapshots: two lines, repeatable immutable history, reopening preserved, stale round, two rounds, supplier/staff denied');
    const bidRecords = await call('GET','/api/supplier/bids?limit=100',undefined,supplierToken);
    const transportRecords = bidRecords.filter(record => record.tenderId === transport.id);
    assert.equal(transportRecords.length, 2);
    assert.ok(transportRecords.every(record => record.totalLineCount === 2));
    assert.equal(transportRecords.find(record => record.roundNo === 2).submittedLineCount, 1);
    assert.equal(transportRecords.find(record => record.roundNo === 2).timezone, t2.timezone);
    console.log('PASS bid records: per-round progress and project timezone');
    await call('POST','/api/tenders/'+transport.id+'/rounds/next',{},staffSession.accessToken,201);
    await call('POST','/api/tenders/'+transport.id+'/publish',{},staffSession.accessToken,403);
    console.log('PASS original role policy: staff may prepare next round but cannot publish it');
    await require('./quote-cooldown-cases')({ call, buyerToken, supplierToken, tag });
    const switched=await call('POST','/api/auth/branches/switch',{branchId:branches[1].id},supplierToken,201);
    await call('GET','/api/quotes/lots/'+lot.id+'/my-rank',undefined,switched.accessToken,404);
    const after=await call('GET','/api/auth/me',undefined,switched.accessToken);assert.equal(after.user.supplierId,company.id);
    assert.equal((await ds.getRepository(Supplier).findOneBy({id:company.id})).countryCode,'BR');
    await call('DELETE','/api/suppliers/'+company.id+'/branch-access',undefined,buyerToken);
    await call('GET','/api/auth/me',undefined,switched.accessToken,401);
    const stillAdmitted=await call('POST','/api/auth/login',{login:supplier.email,password:pwd},null,201);
    assert.equal(stillAdmitted.activeBranchId,branches[1].id);
    assert.equal(stillAdmitted.branches.length,1);
    const evaluator=await call('POST','/api/auth/branches/switch',{branchId:branches[1].id},buyerToken,201);
    await call('GET','/api/quotes/lots/'+tl.id+'/snapshots',undefined,evaluator.accessToken,404);
    await call('POST',freezePath,{trigger:'EVAL_FREEZE',roundNo:2},evaluator.accessToken,404);
    assert.equal(evaluator.scopes.includes('tender:create'),false);
    await call('POST','/api/tenders/'+tender.id+'/rounds/next',{},evaluator.accessToken,403);
    await call('GET','/api/export/tenders/'+tender.id+'/quotes?mode=full',undefined,evaluator.accessToken,403);
    await call('POST','/api/tenders',{title:'forbidden',type:'routine'},evaluator.accessToken,403);
    await ds.getRepository(BranchMember).update({branchId:branches[1].id,authUserId:buyer.id},{status:'inactive'});
    await call('GET','/api/auth/me',undefined,evaluator.accessToken,401);
    await call('GET','/api/uploads/preview/'+encodeURIComponent('supplier-documents/'+supplier.id+'/guessed.pdf'),undefined,undefined,404);
    console.log('PASS full HTTP: restricted login, Brazil defaults, original optional tax policy, tender publish, BRL quote, rank privacy, multi-institution supplier switch, effective evaluator role, live membership revocation');
  }finally{
    for(const id of users)await ds.getRepository(User).update(id,{status:'suspended'});
    for(const b of branches)await ds.getRepository(Branch).update(b.id,{status:'inactive'});
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
