import { test, expect, devices } from '@playwright/test';
const branches=[
  {branchId:'hq',branchName:'Matriz',branchCode:'HQ',branchType:'HQ',role:'hq_admin'},
  {branchId:'br',branchName:'Brasil',branchCode:'BR',branchType:'BRANCH',currency:'BRL',timezone:'America/Sao_Paulo',defaultLocale:'pt-BR'},
  {branchId:'vn',branchName:'Vietnã',branchCode:'VN',branchType:'BRANCH',currency:'VND',timezone:'Asia/Ho_Chi_Minh',defaultLocale:'vi-VN'},
];
async function setup(page:any,role='purchase_manager',active='br') {
  const supplier=role==='supplier';
  const scopes=role==='evaluator'?['tender:view','quote:view_all','export:masked']:supplier?['tender:view','quote:submit','quote:view_own']:['supplier:view','supplier:create','supplier:edit','tender:view','tender:create','tender:edit','tender:publish','org:manage'];
  const writes:any[]=[];
  await page.addInitScript((branch:string)=>{localStorage.setItem('token','test.'+btoa(JSON.stringify({activeBranchId:branch}))+'.test');localStorage.setItem('locale','pt-BR')},active);
  await page.route('**/api/**',async(route:any)=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let data:any={items:[],total:0};
    if(req.method()!=='GET')writes.push({path,body:req.postDataJSON()});
    if(path==='/api/auth/me')data={user:{id:'user',displayName:'Teste',email:'test@example.invalid',role,accountType:supplier?'supplier_account':'company_user',...(supplier?{supplierId:'supplier',supplierStatus:'active',supplierReviewStatus:'approved'}:{})},capabilities:scopes,branches:supplier?branches.slice(1):branches,activeBranchId:active,isHq:active==='hq'};
    if(path==='/api/hall/registrable-branches')data=branches.slice(1).map(b=>({id:b.branchId,name:b.branchName,code:b.branchCode,countryCode:b.branchCode,timezone:b.timezone}));
    if(path==='/api/organization/branches')data=[];
    if(path==='/api/auth/branches/switch'){active=req.postDataJSON().branchId;data={accessToken:'test.'+Buffer.from(JSON.stringify({activeBranchId:active})).toString('base64url')+'.test',activeBranchId:active,branches};}
    if(path==='/api/suppliers'&&req.method()==='POST'){
      return route.fulfill({status:400,json:{success:false,error:{message_key:'error.supplier.invalid_cnpj',message:'Informe um CNPJ válido'}}});
    }
    await route.fulfill({json:{success:true,data}});
  });
  return writes;
}
test('HQ creates Brazil institution with BRL, Brazilian timezone and Portuguese defaults',async({page})=>{
  const writes=await setup(page,'super_admin','hq');
  await page.goto('/organization/branches');
  await page.getByRole('button',{name:'Nova instituição'}).click();
  const dialog=page.getByRole('dialog');
  const inputs=dialog.locator('input');
  await inputs.nth(0).fill('BR');await inputs.nth(1).fill('Brasil');await inputs.nth(2).fill('br');
  await expect(inputs.nth(3)).toHaveValue('BRL');
  await expect(inputs.nth(4)).toHaveValue('America/Sao_Paulo');
  await expect(dialog).toContainText('Português (Brasil)');
  await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect.poll(()=>writes.find(w=>w.path==='/api/organization/branches')?.body).toEqual({code:'BR',name:'Brasil',countryCode:'BR',settings:{currency:'BRL',timezone:'America/Sao_Paulo',defaultLocale:'pt-BR'}});
});
test('Brazil supplier create defaults actual country, invalid CNPJ keeps entered values',async({page})=>{
  const writes=await setup(page);
  await page.goto('/suppliers/new');
  await expect(page.locator('.el-select__selected-item').filter({hasText:'Brasil (BR)'})).toBeVisible();
  await page.getByLabel('Razão social').fill('Transportes Teste');
  await page.getByLabel('Nome abreviado').fill('Teste');
  await page.getByLabel('Identificação fiscal').fill('123');
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('CNPJ');
  expect(writes.find(w=>w.path==='/api/suppliers').body.countryCode).toBe('BR');
  await expect(page.getByLabel('Razão social')).toHaveValue('Transportes Teste');
});
test('Supplier switch: cancel does nothing; confirm replaces session and resets old detail route',async({page})=>{
  const writes=await setup(page,'supplier');
  await page.goto('/supplier/tenders');
  await page.locator('.branch-trigger').click();
  await page.getByRole('menuitem',{name:'Vietnã'}).click();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  expect(writes.filter(w=>w.path.includes('/branches/switch'))).toHaveLength(0);
  await page.locator('.branch-trigger').click();
  await page.getByRole('menuitem',{name:'Vietnã'}).click();
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await expect(page).toHaveURL(/\/hall$/);
  expect(writes.find(w=>w.path.includes('/branches/switch')).body.branchId).toBe('vn');
});
test('Evaluator cannot see create tender control',async({page})=>{
  await setup(page,'evaluator');await page.goto('/tenders');
  await expect(page.getByRole('button',{name:'Criar licitação'})).toHaveCount(0);
});
test('Browser in Jakarta uses Brazilian wall time; rejects DST gaps and overlaps',async({page})=>{
  await page.goto('/login');
  const result=await page.evaluate(async()=>{
    const m=await import('/src/shared/institution-time.ts');
    const invalid=(wall:string,zone:string)=>{try{m.institutionInstant(wall,zone);return false}catch{return true}};
    return {iso:m.institutionInstant('2026-11-12 12:00:00','America/Sao_Paulo'),wall:m.institutionWallTime('2026-11-12T15:00:00Z','America/Sao_Paulo'),gap:invalid('2026-03-08 02:30:00','America/New_York'),overlap:invalid('2026-11-01 01:30:00','America/New_York')};
  });
  expect(result).toEqual({iso:'2026-11-12T15:00:00.000Z',wall:'2026-11-12 12:00:00',gap:true,overlap:true});
});
test('Mobile supplier creation in Portuguese fits 390px and shows Brazil CNPJ help',async({browser})=>{
  const context=await browser.newContext({...devices['iPhone 13'],locale:'pt-BR'});
  const page=await context.newPage();await setup(page);
  await page.goto('/m/console/suppliers/new');
  await expect(page.getByText('Razão social',{exact:true})).toBeVisible();
  await expect(page.getByText('CNPJ',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/brazil-mobile.png',fullPage:true});
  await context.close();
});
test('New Brazilian tender presents BRL and explicit institution timezone',async({page})=>{
  await setup(page);await page.goto('/tenders/new');
  await expect(page.locator('#app').getByText('BRL — Real brasileiro',{exact:true})).toBeVisible();
  await expect(page.getByText(/Prazo.*America\/Sao_Paulo/)).toBeVisible();
  await page.screenshot({path:'test-results/brazil-tender.png',fullPage:true});
});
