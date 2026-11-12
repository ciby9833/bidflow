import {test,expect} from '@playwright/test';
const password=process.env.LOCAL_DEMO_PASSWORD||'BidFlow-Local-1126!';
const markets=[{code:'br',name:'DEV Brasil 测试机构',currency:'BRL',zone:'America/Sao_Paulo'},{code:'vn',name:'DEV Vietnam 测试机构',currency:'VND',zone:'Asia/Ho_Chi_Minh'},{code:'id',name:'DEV Indonesia 测试机构',currency:'IDR',zone:'Asia/Jakarta'}];
const tenders:any[]=[];
async function login(page:any,name:string){await page.addInitScript(()=>localStorage.setItem('locale','pt-BR'));await page.goto('/login');await page.getByLabel('Conta',{exact:true}).fill('dev.'+name+'@example.invalid');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).not.toHaveURL(/login$/)}
async function api(page:any,path:string){const token=await page.evaluate(()=>localStorage.getItem('token'));const r=await page.request.get('http://localhost:3011'+path,{headers:{Authorization:'Bearer '+token}});return {status:r.status(),...(await r.json())}}
test.describe.serial('Persistent manual demo accounts',()=>{
for(const market of markets)test(market.code+' buyer creates and publishes; supplier submits real quote',async({browser},info)=>{
  const c=await browser.newContext({locale:'pt-BR'}),p=await c.newPage();await login(p,market.code+'.buyer');await expect(p).toHaveURL(/hall$/);
  await p.goto('/tenders/new');const title='DEV '+market.code.toUpperCase()+' Frontend '+Date.now();
  await p.getByPlaceholder('Informe o nome do projeto').fill(title);
  await p.locator('.el-form-item').filter({has:p.locator('.el-form-item__label').filter({hasText:'Título da licitação'})}).first().locator('.el-select').click();await p.getByRole('option',{name:'Compras recorrentes',exact:true}).click();
  await expect(p.locator('#app')).toContainText(market.currency);
  await p.getByPlaceholder('Selecione o prazo').fill(new Date(Date.now()+14*86400000).toISOString().slice(0,10)+' 12:00:00');await p.getByPlaceholder('Selecione o prazo').press('Tab');
  await p.getByRole('button',{name:'Próximo',exact:true}).click();await p.locator('input[type=radio][value=leading_flag]').check();
  await p.getByRole('button',{name:'Próximo',exact:true}).click();await p.getByPlaceholder('Nome do lote 1').fill('DEV '+market.currency+' Lote');
  await p.getByRole('button',{name:'Próximo',exact:true}).click();
  const create=p.waitForResponse((r:any)=>r.url().endsWith('/api/tenders')&&r.request().method()==='POST');await p.getByRole('button',{name:'Criar licitação',exact:true}).click();
  const created=(await (await create).json()).data;expect(created.id).toBeTruthy();
  await p.goto('/tenders/'+created.id);await p.getByRole('button',{name:'Publicar',exact:true}).click();await expect.poll(async()=>(await api(p,'/api/tenders/'+created.id)).data.status).toBe('open');
  const tender=(await api(p,'/api/tenders/'+created.id)).data;expect(tender.baseCurrency).toBe(market.currency);expect(tender.timezone).toBe(market.zone);tenders.push(tender);
  await p.screenshot({path:info.outputPath('buyer-'+market.code+'.png'),fullPage:true});await c.close();
  const s=await browser.newContext({locale:'pt-BR'}),sp=await s.newPage();await login(sp,market.code+'.supplier');await expect(sp).toHaveURL(/hall$/);
  await sp.goto('/supplier/quotes/lots/'+tender.lots[0].id);await expect(sp.locator('#app')).toContainText(market.zone);
  await sp.getByRole('spinbutton').fill('1250.25');await sp.getByRole('button',{name:'Enviar proposta',exact:true}).click();await sp.locator('.el-message-box__btns .el-button--primary').click();
  await expect.poll(async()=>Number((await api(sp,'/api/quotes/lots/'+tender.lots[0].id+'/mine')).data.quote?.totalPrice)).toBe(1250.25);
  await expect(sp.locator('.rank-value')).toContainText('Na liderança');await sp.screenshot({path:info.outputPath('supplier-'+market.code+'.png'),fullPage:true});await s.close();
});
for(const role of ['buyer','supplier'])test('multi '+role+' switches BR/VN/ID and isolates data',async({page})=>{
  await login(page,'multi.'+role);if(page.url().includes('select-branch'))await page.getByRole('button').filter({hasText:markets[0].name}).click();await expect(page).toHaveURL(/hall$/);
  for(const market of markets){const me=(await api(page,'/api/auth/me')).data;if(me.branches.find((b:any)=>b.branchId===me.activeBranchId)?.branchName!==market.name){await page.locator('.branch-trigger').click();await page.getByRole('menuitem',{name:market.name,exact:true}).click();await page.locator('.el-message-box__btns .el-button--primary').click();await expect(page).toHaveURL(/hall$/);}
    await expect(page.locator('.branch-trigger')).toContainText(market.name);const own=tenders.find(t=>t.baseCurrency===market.currency),foreign=tenders.find(t=>t.baseCurrency!==market.currency);
    await page.goto((role==='supplier'?'/supplier':'')+'/tenders/'+own.id);await expect(page.getByText(own.title,{exact:true}).first()).toBeVisible();expect((await api(page,'/api/tenders/'+foreign.id)).status).toBe(404);
    if(role==='supplier'){expect((await api(page,'/api/supplier/profile')).data.supplier.countryCode).toBe('BR');}
  }
});
test('headquarters sees three active institutions',async({page})=>{await login(page,'hq');await page.goto('/organization/branches');for(const market of markets)await expect(page.getByRole('row').filter({hasText:market.name})).toContainText('Ativa')});
});
