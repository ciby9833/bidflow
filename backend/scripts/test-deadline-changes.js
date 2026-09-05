/** npm run build && node scripts/test-deadline-changes.js
 * Creates and removes a uniquely named test schema. Never modifies application tables.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { DeadlineChangeService, validateDeadlineChange } = require('../dist/modules/tender/deadline-change.service');
const { TenderDeadlineChanges1713730000034 } = require('../dist/migrations/1713730000034-TenderDeadlineChanges');
const { lockQuoteAdmission } = require('../dist/modules/quote/quote-admission');

async function main() {
  const schema = 'test_deadline_' + randomUUID().replaceAll('-', '');
  const admin = new Client({ connectionString: process.env.DB_URL });
  await admin.connect();
  let ds;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ type: 'postgres', url: process.env.DB_URL, extra: { options: `-c search_path=${schema}` } });
    await ds.initialize();
    await ds.query(`CREATE TABLE branches(id uuid PRIMARY KEY,settings jsonb,country_code text);
      CREATE TABLE tenders(id uuid PRIMARY KEY,branch_id uuid,tender_no text,title text,status text,
        bid_deadline timestamptz,bid_start_at timestamptz,current_quote_round int,participation_mode text,
        updated_at timestamptz DEFAULT now(),updated_by uuid,max_rebid_count int DEFAULT 10,min_decrement_pct numeric DEFAULT 0.5,cooldown_seconds int DEFAULT 60);
      CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text,locale text,status text DEFAULT 'active');
      CREATE TABLE suppliers(id uuid PRIMARY KEY,status text,review_status text,country_code text);
      CREATE TABLE supplier_accounts(auth_user_id uuid,supplier_id uuid,status text);
      CREATE TABLE supplier_branch_profiles(branch_id uuid,supplier_id uuid,status text);
      CREATE TABLE invitations(tender_id uuid,round_no int,supplier_id uuid);
      CREATE TABLE quotes(tender_id uuid,supplier_id uuid,price numeric);
      CREATE TABLE line_quotes(tender_id uuid,round_no int,supplier_id uuid,price numeric);
      CREATE TABLE audit_log(branch_id uuid,entity_type text,entity_id text,action text,user_id uuid,user_role text,ip_address inet,user_agent text,before_state jsonb,after_state jsonb,metadata jsonb);`);
    const runner = ds.createQueryRunner();
    await runner.connect();
    await new TenderDeadlineChanges1713730000034().up(runner);
    await runner.release();
    const branch=randomUUID(), other=randomUUID(), actor=randomUUID(), id=randomUUID(), supplier=randomUUID(), account=randomUUID();
    await ds.query("INSERT INTO branches VALUES($1,'{\"timezone\":\"Asia/Jakarta\"}','ID')",[branch]);
    await ds.query("INSERT INTO users(id,display_name) VALUES($1,'Buyer')",[actor]);
    await ds.query("INSERT INTO users(id,display_name,email,locale) VALUES($1,'Supplier','supplier@example.invalid','id-ID')",[account]);
    await ds.query("INSERT INTO suppliers VALUES($1,'active','approved','ID')",[supplier]);
    await ds.query("INSERT INTO supplier_accounts VALUES($1,$2,'active')",[account,supplier]);
    await ds.query("INSERT INTO supplier_branch_profiles VALUES($1,$2,'active')",[branch,supplier]);
    await ds.query(`INSERT INTO tenders(id,branch_id,tender_no,title,status,bid_deadline,current_quote_round,participation_mode)
      VALUES($1,$2,'TEST-001','Test tender','closed',now()-interval '1 day',1,'all')`,[id,branch]);
    await ds.query('INSERT INTO line_quotes VALUES($1,1,$2,123)',[id,supplier]);
    let failMail=true; const delivered=[];
    const svc = new DeadlineChangeService(ds,{getConfig:()=>({host:'test'}),send:async input=>{if(failMail)throw new Error('test failure'); delivered.push(input);}});
    const scope={readable:[branch],writable:branch}, ctx={userId:actor,userRole:'purchase_manager',ipAddress:'127.0.0.1'};
    const body = async (days=2) => {
      const p=await svc.preview(scope,id);
      return {newDeadline:new Date(Date.now()+days*86400000).toISOString(),reason:'Supplier needs more time',announcement:'Extended deadline',expectedRound:p.round,expectedStatus:p.status,expectedUpdatedAt:p.updatedAt.toISOString(),expectedVersion:p.version,idempotencyKey:randomUUID()};
    };
    const initial=(await ds.query('SELECT * FROM tenders WHERE id=$1',[id]))[0];
    const input=await body();
    await assert.rejects(()=>svc.change({readable:[other],writable:other},id,input,ctx));
    await assert.rejects(()=>svc.change({readable:[branch]},id,input,ctx));
    await assert.rejects(()=>svc.change(scope,id,{...input,reason:''},ctx));
    await assert.rejects(()=>svc.change(scope,id,{...input,newDeadline:new Date(Date.now()-1000).toISOString()},ctx));
    const changed=await svc.change(scope,id,input,ctx);
    assert.equal((await svc.change(scope,id,input,ctx)).replayed,true);
    await assert.rejects(()=>svc.change(scope,id,{...input,reason:'different'},ctx));
    const current=(await ds.query('SELECT * FROM tenders WHERE id=$1',[id]))[0];
    assert.equal(current.status,'open');
    await ds.transaction(em=>lockQuoteAdmission(em,{id,branchId:branch,currentQuoteRound:1}));
    await assert.rejects(()=>ds.transaction(em=>lockQuoteAdmission(em,{id,branchId:branch,currentQuoteRound:2})));
    for(const key of ['current_quote_round','participation_mode','max_rebid_count','min_decrement_pct','cooldown_seconds']) assert.equal(current[key],initial[key]);
    assert.equal((await ds.query('SELECT price FROM line_quotes'))[0].price,'123');
    assert.equal((await ds.query('SELECT count(*)::int AS n FROM audit_log'))[0].n,1);
    assert.equal((await svc.history(id,false))[0].recipients,1);
    assert.equal((await svc.history(id,true))[0].reason,undefined);
    assert.equal((await svc.history(id,true))[0].actor_id,undefined);

    const a=await body(3),b={...a,idempotencyKey:randomUUID(),newDeadline:new Date(Date.now()+4*86400000).toISOString()};
    const concurrent=await Promise.allSettled([svc.change(scope,id,a,ctx),svc.change(scope,id,b,ctx)]);
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
    const stale=await body(5);
    await ds.query('UPDATE tenders SET current_quote_round=2 WHERE id=$1',[id]);
    await assert.rejects(()=>svc.change(scope,id,stale,ctx));
    await assert.rejects(()=>ds.transaction(em=>lockQuoteAdmission(em,{id,branchId:branch,currentQuoteRound:1})));
    for(const status of ['awarded','cancelled','draft']) {
      await ds.query('UPDATE tenders SET status=$2 WHERE id=$1',[id,status]);
      await assert.rejects(()=>ds.transaction(em=>lockQuoteAdmission(em,{id,branchId:branch,currentQuoteRound:2})));
      const blocked=await body(6);
      await assert.rejects(()=>svc.change(scope,id,blocked,ctx));
    }
    // Scheduled publication retains the original start time and does not open early.
    const start=new Date(Date.now()+86400000);
    await ds.query("UPDATE tenders SET status='published',bid_start_at=$2,bid_deadline=$3 WHERE id=$1",[id,start,new Date(Date.now()+2*86400000)]);
    await svc.change(scope,id,await body(7),ctx);
    assert.equal((await ds.query('SELECT status FROM tenders WHERE id=$1',[id]))[0].status,'published');
    const pure={status:'open',current_quote_round:1,updated_at:new Date(),bid_deadline:new Date(Date.now()+86400000)};
    assert.throws(()=>validateDeadlineChange(pure,{expectedRound:1,expectedStatus:'open',expectedUpdatedAt:pure.updated_at.toISOString(),newDeadline:pure.bid_deadline.toISOString()},new Date()));
    // Directed round with no bids still emails invited suppliers, but not other branches.
    await ds.query("UPDATE tenders SET participation_mode='selected' WHERE id=$1",[id]);
    await ds.query('INSERT INTO invitations VALUES($1,2,$2)',[id,supplier]);
    assert.equal((await svc.preview(scope,id)).recipientCount,1);
    await ds.query("UPDATE supplier_branch_profiles SET status='inactive'");
    assert.equal((await svc.preview(scope,id)).recipientCount,0);
    await ds.query("UPDATE supplier_branch_profiles SET status='active'");
    // Failure retries stop after 3 attempts; manual retry sends successfully.
    for(let i=0;i<3;i++) { await ds.query("UPDATE tender_deadline_mail SET available_at=now()-interval '1 second'"); await svc.deliver(); }
    assert.ok((await svc.history(id,false)).some(r=>r.failed>0));
    failMail=false;
    await svc.retry(scope,id,changed.id); await svc.deliver();
    assert.ok(delivered.length>0);
    assert.ok(delivered[0].text.includes('Asia/Jakarta'));
    // Any outbox insertion failure must roll back the deadline and audit together.
    const prior=(await ds.query('SELECT * FROM tenders WHERE id=$1',[id]))[0];
    await ds.query("ALTER TABLE tender_deadline_mail ADD CONSTRAINT fail_insert CHECK(subject='forbidden') NOT VALID");
    const rollbackInput=await body(8);
    await assert.rejects(()=>svc.change(scope,id,rollbackInput,ctx));
    assert.equal((await ds.query('SELECT bid_deadline FROM tenders WHERE id=$1',[id]))[0].bid_deadline.toISOString(),prior.bid_deadline.toISOString());
    console.log('PASS: state/date validation, branch isolation, replay, concurrency, round conflict, unchanged bids/rules, scheduled start, notification audience, retry, transaction rollback');
  } finally {
    if(ds?.isInitialized) await ds.destroy();
    // schema is generated locally above, never from an environment variable or user input.
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
