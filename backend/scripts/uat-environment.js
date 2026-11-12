/** Local real-application UAT bootstrap. Only account fixtures and local console-code observation are test helpers. */
require('dotenv').config({path:require('path').resolve(__dirname,'../.env')});
if(!['localhost','127.0.0.1','::1'].includes(new URL(process.env.DB_URL).hostname))throw Error('UAT requires local PostgreSQL');
process.env.NODE_ENV='development';
process.env.SMTP_HOST='';
process.env.SUPPLIER_REGISTER_EMAIL_MODE='console';
require('reflect-metadata');
const {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {ValidationPipe}=require('@nestjs/common');
const {DataSource}=require('typeorm');
const argon2=require('argon2');
const {AppModule}=require('../dist/app.module');
const {AuthService}=require('../dist/modules/auth/auth.service');
const {I18nExceptionFilter}=require('../dist/shared/i18n/i18n.exception.filter');
const {User}=require('../dist/modules/auth/user.entity');
const {CompanyUser}=require('../dist/modules/auth/company-user.entity');
const {Branch}=require('../dist/modules/organization/branch.entity');
const {BranchMember}=require('../dist/modules/organization/branch-member.entity');
const {Supplier}=require('../dist/modules/supplier/supplier.entity');

exports.start=async()=>{
  await new Promise((resolve,reject)=>{
    const probe=require('node:net').createServer();
    probe.once('error',()=>reject(new Error('UAT needs port 3011 free; it never stops an existing backend')));
    probe.listen(3011,()=>probe.close(resolve));
  });
  const mod=await Test.createTestingModule({imports:[AppModule]}).compile();
  const app=mod.createNestApplication({logger:['error']});
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  app.useGlobalFilters(app.get(I18nExceptionFilter));
  app.enableCors({origin:true,credentials:true});
  const ds=app.get(DataSource);ds.setOptions({logging:false});ds.logger=new (require('typeorm').AdvancedConsoleLogger)(false);
  const codes=new Map(),auth=app.get(AuthService);
  auth.logger.log=message=>{const m=/email=(\S+) code=(\d+)/.exec(String(message));if(m)codes.set(m[1],m[2]);};
  const tag=randomUUID().slice(0,8),password='Uat-'+randomUUID(),hash=await argon2.hash(password);
  const users={};
  for(const name of ['hq','buyer','staff','evaluator','outsider']){
    const u=await ds.getRepository(User).save({email:`uat-${tag}-${name}@example.invalid`,loginName:`uat-${tag}-${name}@example.invalid`,passwordHash:hash,displayName:`UAT ${tag} ${name}`,role:'super_admin',accountType:'company_user',status:'active',registerSource:'internal_created',locale:'pt-BR',tokenVersion:0});
    await ds.getRepository(CompanyUser).save({authUserId:u.id,fullName:u.displayName,status:'active'});users[name]=u;
  }
  const hq=await ds.getRepository(Branch).findOneByOrFail({type:'HQ'});
  await ds.getRepository(BranchMember).save({branchId:hq.id,authUserId:users.hq.id,role:'hq_admin',status:'active'});
  const vn=await ds.getRepository(Branch).save({code:'UAT-VN-'+tag,name:'UAT Vietnã '+tag,type:'BRANCH',countryCode:'VN',status:'active',settings:{currency:'VND',timezone:'Asia/Ho_Chi_Minh',defaultLocale:'vi-VN'}});
  const isolated=await ds.getRepository(Branch).save({code:'UAT-ID-'+tag,name:'UAT Indonesia '+tag,type:'BRANCH',countryCode:'ID',status:'active',settings:{currency:'IDR',timezone:'Asia/Jakarta',defaultLocale:'id-ID'}});
  await ds.getRepository(BranchMember).save([{branchId:vn.id,authUserId:users.buyer.id,role:'purchase_manager',status:'active'},{branchId:isolated.id,authUserId:users.outsider.id,role:'purchase_manager',status:'active'}]);
  await app.listen(3011);
  return {app,ds,tag,password,users,hq,vn,codes,
    async bindRoles(br){
      for(const [name,role]of [['staff','purchase_staff'],['evaluator','evaluator']])await ds.getRepository(BranchMember).save({branchId:br.id,authUserId:users[name].id,role,status:'active'});
    },
    async stop(){
      await ds.getRepository(User).createQueryBuilder().update().set({status:'suspended'}).where('email LIKE :p',{p:'uat-'+tag+'-%@example.invalid'}).execute();
      await ds.getRepository(Branch).createQueryBuilder().update().set({status:'inactive'}).where('code IN (:...codes)',{codes:['UAT-ID-'+tag,'UAT-VN-'+tag,('UAT-BR-'+tag).toUpperCase()]}).execute();
      await app.close();
      console.log('UAT fixtures suspended/inactive:',tag);
    }};
};
