/** Explicitly local, reusable manual-test accounts. Never run against a remote database. */
require('dotenv').config();
if (!['localhost','127.0.0.1','::1'].includes(new URL(process.env.DB_URL).hostname)) throw Error('Local database required');
require('reflect-metadata');
const ds=require('../dist/shared/config/typeorm.config').default;
const argon2=require('argon2');
const {Branch}=require('../dist/modules/organization/branch.entity');
const {BranchMember}=require('../dist/modules/organization/branch-member.entity');
const {Supplier}=require('../dist/modules/supplier/supplier.entity');
const {SupplierBranchProfile}=require('../dist/modules/supplier/supplier-branch-profile.entity');
const {User}=require('../dist/modules/auth/user.entity');
const {CompanyUser}=require('../dist/modules/auth/company-user.entity');
const {SupplierAccount}=require('../dist/modules/auth/supplier-account.entity');
const password=process.env.LOCAL_DEMO_PASSWORD || 'BidFlow-Local-1126!';
function cnpj(base){let s=base;for(let n=0;n<2;n++){let sum=0,w=2;for(let i=s.length-1;i>=0;i--){sum+=Number(s[i])*w;w=w===9?2:w+1}const r=sum%11;s+=r<2?0:11-r}return s}
async function main(){
  ds.setOptions({logging:false});ds.logger=new (require('typeorm').AdvancedConsoleLogger)(false);await ds.initialize();
  const hash=await argon2.hash(password);
  await ds.transaction(async em=>{
    async function put(entity,where,data){const r=em.getRepository(entity),old=await r.findOneBy(where);return r.save({...old,...where,...data})}
    const markets=[['BR','Brasil','BRL','America/Sao_Paulo','pt-BR'],['VN','Vietnam','VND','Asia/Ho_Chi_Minh','vi-VN'],['ID','Indonesia','IDR','Asia/Jakarta','id-ID']];
    const branches={};
    for(const [code,name,currency,timezone,defaultLocale]of markets)branches[code]=await put(Branch,{code:'DEV-'+code},{name:'DEV '+name+' 测试机构',type:'BRANCH',countryCode:code,status:'active',settings:{currency,timezone,defaultLocale}});
    async function user(name,supplier){const email='dev.'+name+'@example.invalid';const old=await em.getRepository(User).findOneBy({email});const u=await put(User,{email},{loginName:email,passwordHash:hash,displayName:'DEV '+name,role:supplier?'supplier':'purchase_manager',accountType:supplier?'supplier_account':'company_user',supplierId:supplier?.id,status:'active',registerSource:'internal_created',locale:'pt-BR',tokenVersion:(old?.tokenVersion??0)+1});
      if(supplier)await put(SupplierAccount,{authUserId:u.id},{supplierId:supplier.id,isPrimary:true,relationRole:'owner',status:'active'});
      else await put(CompanyUser,{authUserId:u.id},{fullName:u.displayName,status:'active'});return u;
    }
    for(const [code,name]of markets){
      const buyer=await user(code.toLowerCase()+'.buyer');await put(BranchMember,{branchId:branches[code].id,authUserId:buyer.id},{role:'purchase_manager',status:'active'});
      const supplier=await put(Supplier,{businessId:'S-DEV-'+code},{legalName:'DEV '+name+' Supplier',shortName:'DEV '+code,status:'active',reviewStatus:'approved',countryCode:code,taxId:code==='BR'?cnpj('987654320001'):'DEV-'+code+'-TAX',contactName:'DEV Contact',contactEmail:'dev.'+code.toLowerCase()+'.supplier@example.invalid',contactPhone:code==='BR'?'+5511999999999':'+628123456789',reviewComment:'Local manual-test fixture, not a real certification'});
      await put(SupplierBranchProfile,{branchId:branches[code].id,supplierId:supplier.id},{status:'active'});await user(code.toLowerCase()+'.supplier',supplier);
    }
    const multiBuyer=await user('multi.buyer');
    const multiCompany=await put(Supplier,{businessId:'S-DEV-MULTI'},{legalName:'DEV Brasil Global Supplier',shortName:'DEV Global',status:'active',reviewStatus:'approved',countryCode:'BR',taxId:cnpj('987654330001'),contactName:'DEV Global Contact',reviewComment:'Local cross-institution fixture'});
    await user('multi.supplier',multiCompany);
    for(const branch of Object.values(branches)){await put(BranchMember,{branchId:branch.id,authUserId:multiBuyer.id},{role:'purchase_manager',status:'active'});await put(SupplierBranchProfile,{branchId:branch.id,supplierId:multiCompany.id},{status:'active'});}
    const hq=await em.getRepository(Branch).findOneByOrFail({type:'HQ'}),admin=await user('hq');await put(BranchMember,{branchId:hq.id,authUserId:admin.id},{role:'hq_admin',status:'active'});
  });
  console.log('Ready: DEV-BR / DEV-VN / DEV-ID. Accounts remain active.');
  console.log('Accounts: dev.{br,vn,id}.{buyer,supplier}@example.invalid; dev.multi.{buyer,supplier}@example.invalid; dev.hq@example.invalid');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>ds.isInitialized&&ds.destroy());
