// Only dedicated local fixture accounts; never change existing demo users.
require('dotenv').config();
if (!['localhost','127.0.0.1','::1'].includes(new URL(process.env.DB_URL).hostname)) throw Error('Local database required');
require('reflect-metadata');
const ds = require('../dist/shared/config/typeorm.config').default;
const { User } = require('../dist/modules/auth/user.entity');
const { CompanyUser } = require('../dist/modules/auth/company-user.entity');
const { Branch } = require('../dist/modules/organization/branch.entity');
const { BranchMember } = require('../dist/modules/organization/branch-member.entity');
async function main() {
  ds.setOptions({ logging: false });
  ds.logger = new (require('typeorm').AdvancedConsoleLogger)(false);
  await ds.initialize();
  const branch = await ds.getRepository(Branch).findOneByOrFail({code:'DEV-BR'});
  for (const [name, role] of [['staff','purchase_staff'],['evaluator','evaluator']]) {
    const email = `iab.br.${name}@example.invalid`;
    if (await ds.getRepository(User).findOneBy({email})) { console.log('Already exists:',email); continue; }
    await ds.transaction(async em => {
      const u = await em.getRepository(User).save({email,loginName:email,passwordHash:await require('argon2').hash('BidFlow-Local-1126!'),displayName:`IAB BR ${name}`,role,accountType:'company_user',status:'active',registerSource:'internal_created',locale:'pt-BR'});
      await em.getRepository(CompanyUser).save({authUserId:u.id,fullName:u.displayName,status:'active'});
      await em.getRepository(BranchMember).save({authUserId:u.id,branchId:branch.id,role,status:'active'});
    });
    console.log('Created:',email,role);
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>ds.isInitialized&&ds.destroy());
