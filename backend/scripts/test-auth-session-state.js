/** Runs the real frontend auth store with deferred HTTP responses to test session races. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/stores/auth.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function setup(api) {
  const values = new Map(), routes = [], reloads = [], exports = {}, events = {};
  vm.runInNewContext(source, { exports, atob, localStorage: { getItem:k=>values.get(k), setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) },
    sessionStorage: {removeItem:()=>{}}, window:{addEventListener:(name,fn)=>events[name]=fn,location:{pathname:'/users',replace:p=>reloads.push(p)}},
    require:id=>{
      if(id==='vue')return {ref:value=>({value}),computed:fn=>({get value(){return fn();}})};
      if(id==='pinia')return {defineStore:(_id,setup)=>setup};
      if(id==='../router')return {router:{replace:p=>routes.push(p)}};
      if(id==='../composables/useApi')return {api};
      throw Error(id);
    } });
  const auth=exports.useAuthStore();
  const session=(id,role='purchase_staff')=>({accessToken:id+'.'+Buffer.from(JSON.stringify({activeBranchId:'BR'})).toString('base64url')+'.sig',
    user:{id,role},scopes:role==='hq_admin'?['user:create']:['tender:view'],activeBranchId:'BR',branches:[{branchId:'BR',branchType:'BRANCH',role}]});
  auth.applyAuthSession(session('old','hq_admin'));
  return {auth,session,values,routes,reloads,events};
}
test('late /me success or failure cannot overwrite a new account session',async()=>{
  for(const fail of [false,true]){
    const d=deferred(); const {auth,session}=setup({get:()=>d.promise});
    const pending=auth.loadMe();auth.applyAuthSession(session('new'));
    if(fail)d.reject({response:{status:401}});else d.resolve({data:{data:{user:{id:'old'},capabilities:['*']}}});
    await pending;assert.equal(auth.user.value.id,'new');assert.equal(auth.hasScope('user:create'),false);
  }
});
test('logout clears all authorization immediately; late branch switch cannot restore it',async()=>{
  const change=deferred(),logout=deferred();
  const {auth,reloads,values}=setup({post:url=>url.endsWith('logout')?logout.promise:change.promise});
  const switching=auth.switchBranch('VN');const leaving=auth.logout();
  assert.equal(auth.isLoggedIn.value,false);assert.equal(auth.user.value,null);assert.equal(auth.scopes.value.length,0);assert.equal(auth.branches.value.length,0);assert.equal(values.has('token'),false);
  change.resolve({data:{data:{accessToken:'stale',user:{id:'old'},scopes:['*']}}});await switching;
  assert.equal(auth.token.value,null);assert.equal(reloads.length,0);logout.resolve({});await leaving;
});
test('expired current session clears cached roles and pending branch selection',async()=>{
  const {auth}=setup({get:async()=>{throw {response:{status:401}};}});
  await auth.loadMe();assert.equal(auth.user.value,null);assert.equal(auth.isHq.value,false);assert.equal(auth.hasScope('user:create'),false);
});
test('late selection response cannot replace a new login',async()=>{
  const d=deferred();const {auth,session}=setup({post:()=>d.promise});
  auth.applyAuthSession({requiresBranchSelection:true,selectionToken:'restricted',branches:[]});
  assert.equal(auth.user.value,null);assert.equal(auth.hasScope('user:create'),false);
  const pending=auth.completeBranchSelection('BR');auth.applyAuthSession(session('new'));
  d.resolve({data:{data:session('old','hq_admin')}});await pending;
  assert.equal(auth.user.value.id,'new');assert.equal(auth.hasScope('user:create'),false);
});

test('other browser tabs discard cached pages on account/institution switch or logout',()=>{
  const {events,reloads}=setup({});
  events.storage({key:'token',newValue:'new-branch-token'});
  events.storage({key:'token',newValue:null});
  assert.deepEqual(reloads,['/hall','/login']);
});
