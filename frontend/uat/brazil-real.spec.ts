import {test,expect,devices} from '@playwright/test';
import {createRequire} from 'node:module';
const backendRequire=createRequire(__filename);
const {start}=backendRequire('../../backend/scripts/uat-environment.js');
const {Branch}=backendRequire('../../backend/dist/modules/organization/branch.entity');
const {Supplier}=backendRequire('../../backend/dist/modules/supplier/supplier.entity');
const {Tender}=backendRequire('../../backend/dist/modules/tender/tender.entity');
let env:any,br:any,supplier:any,tender:any,lot:any;
let hq:any,buyer:any,owner:any,staff:any,evaluator:any,outsider:any;
const contexts:any[]=[];
const browserErrors:string[]=[];
const png={name:'comprovante-ação.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64')};
function cnpj(seed:string){let s=seed.replace(/[^0-9]/g,'').padEnd(12,'1').slice(0,12);for(let n=0;n<2;n++){let sum=0,w=2;for(let i=s.length-1;i>=0;i--){sum+=Number(s[i])*w;w=w===9?2:w+1}let r=sum%11;s+=r<2?0:11-r}return s}
async function pageFor(browser:any,mobile=false){const c=await browser.newContext(mobile?{...devices['iPhone 13'],locale:'pt-BR'}:{locale:'pt-BR',timezoneId:'Asia/Jakarta',viewport:{width:1440,height:1000}});contexts.push(c);await c.addInitScript(()=>localStorage.setItem('locale','pt-BR'));const p=await c.newPage();p.on('pageerror',(e:any)=>browserErrors.push(e.message));return p}
async function api(p:any,method:string,path:string,body?:any,status=200){
  const token=await p.evaluate(()=>localStorage.getItem('token'));
  const r=await p.request.fetch('http://localhost:3011'+path,{method,headers:{Authorization:'Bearer '+token,'X-Locale':'pt-BR'},...(body===undefined?{}:{data:body})});
  const data=await r.json();expect(r.status(),method+' '+path+' '+JSON.stringify(data)).toBe(status);return data.data;
}
async function login(p:any,user:any,branch?:string){await p.goto('/login');await p.getByLabel('Conta',{exact:true}).fill(user.email);await p.getByLabel('Senha',{exact:true}).fill(env.password);await p.getByRole('button',{name:'Entrar',exact:true}).click();await expect(p).not.toHaveURL(/\/login$/);if(branch&&p.url().includes('select-branch'))await p.getByRole('button').filter({hasText:branch}).click();await expect(p).toHaveURL(/\/hall$/)}
async function choose(p:any,label:string,option:string){const item=p.locator('.el-form-item').filter({has:p.locator('.el-form-item__label').filter({hasText:label})}).first();await item.locator('.el-select').click();await p.getByRole('option',{name:option,exact:true}).click()}
async function confirm(p:any){await p.locator('.el-message-box .el-message-box__btns .el-button--primary').click()}
async function switchTo(p:any,name:string){await p.locator('.branch-trigger').click();await p.getByRole('menuitem',{name,exact:true}).click();await confirm(p);await expect(p).toHaveURL(/\/hall$/);await expect(p.locator('.branch-trigger')).toContainText(name)}
async function register(p:any,name:string){const email='uat-'+env.tag+'-'+name+'@example.invalid';await p.goto('/register/supplier');await p.getByLabel('Pessoa de contato',{exact:true}).fill('Contato '+name);await p.getByLabel('Celular',{exact:true}).fill('+5511999999999');await p.getByLabel('E-mail',{exact:true}).fill(email);await p.getByRole('button',{name:'Enviar código',exact:true}).click();await expect.poll(()=>env.codes.get(email)).toBeTruthy();await p.getByLabel('Código de verificação por e-mail',{exact:true}).fill('000000');await p.getByLabel('Senha',{exact:true}).fill(env.password);await p.getByRole('button',{name:'Criar conta',exact:true}).click();await expect(p.getByRole('alert')).toContainText(/Código|código/);await p.getByLabel('Código de verificação por e-mail',{exact:true}).fill(env.codes.get(email));await p.getByRole('button',{name:'Criar conta',exact:true}).click();await expect(p).toHaveURL(/\/supplier\/profile$/);return email}
async function review(action:string){await buyer.goto('/suppliers/'+supplier.id+'/review');await buyer.getByRole('button',{name:action,exact:true}).click();await buyer.locator('.el-message-box input').fill('UAT '+action);await confirm(buyer)}

test.describe.serial('Real local Brazil user journeys',()=>{
  test.beforeAll(async()=>{env=await start()});
  test.afterAll(async()=>{for(const c of contexts)await c.close();if(env)await env.stop()});

  test('01 Headquarters creates Brazil institution and assigns buyer through UI',async({browser})=>{
    hq=await pageFor(browser);await login(hq,env.users.hq);
    await hq.goto('/organization/branches');await hq.getByRole('button',{name:'Nova instituição',exact:true}).click();
    const d=hq.getByRole('dialog'),inputs=d.locator('input');
    await inputs.nth(0).fill('UAT-BR-'+env.tag);await inputs.nth(1).fill('UAT Brasil '+env.tag);await inputs.nth(2).fill('BR');
    await expect(inputs.nth(3)).toHaveValue('BRL');await expect(inputs.nth(4)).toHaveValue('America/Sao_Paulo');
    await d.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(d).toBeHidden();
    br=await env.ds.getRepository(Branch).findOneByOrFail({code:('UAT-BR-'+env.tag).toUpperCase()});
    expect(br.settings.defaultLocale).toBe('pt-BR');
    const row=hq.getByRole('row').filter({hasText:br.name});
    await row.getByRole('button',{name:'Membros',exact:true}).click();
    const members=hq.getByRole('dialog');await members.locator('.member-user').click();
    await hq.getByRole('option').filter({hasText:env.users.buyer.email}).click();
    await members.locator('.member-role').click();await hq.getByRole('option',{name:'Gerente de compras',exact:true}).click();
    await members.getByRole('button',{name:'Adicionar',exact:true}).click();
    await expect(members.getByRole('row').filter({hasText:env.users.buyer.email})).toBeVisible();
    await env.bindRoles(br);
    buyer=await pageFor(browser);await login(buyer,env.users.buyer,br.name);
    await expect(buyer.locator('.branch-trigger')).toContainText(br.name);
  });

  test('02 Supplier registers with real console email code, uploads certification and submits Brazilian CNPJ',async({browser})=>{
    owner=await pageFor(browser);await register(owner,'owner');
    await owner.getByRole('button',{name:'Preencher dados do fornecedor',exact:true}).click();
    await owner.locator('.branch-select').click();
    // Match institution value, not ambiguous country-only labels when multiple BR offices exist.
    await owner.getByRole('option').filter({hasText:br.name}).click();
    await owner.getByLabel('Razão social',{exact:true}).fill('UAT Transportes '+env.tag);
    await owner.getByLabel('Nome abreviado',{exact:true}).fill('UAT '+env.tag);
    await owner.getByLabel('Pessoa de contato',{exact:true}).fill('João Teste');
    await owner.getByLabel('Telefone',{exact:true}).fill('+5511999999999');
    await owner.getByLabel('Identificação fiscal / CNPJ',{exact:true}).fill(cnpj(Date.now().toString()));
    const files=owner.locator('input[type=file]');
    for(let i=0;i<await files.count();i++)await files.nth(i).setInputFiles(png);
    await expect(owner.locator('.file-link').first()).toContainText(png.name);
    const validTaxId=await owner.getByLabel('Identificação fiscal / CNPJ',{exact:true}).inputValue();
    await owner.getByLabel('Identificação fiscal / CNPJ',{exact:true}).fill('11111111111111');
    await owner.getByRole('button',{name:'Enviar dados de certificação',exact:true}).click();await confirm(owner);
    await expect(owner.locator('.el-message--error')).toContainText('CNPJ');
    await owner.getByLabel('Identificação fiscal / CNPJ',{exact:true}).fill(validTaxId);
    await owner.getByRole('button',{name:'Enviar dados de certificação',exact:true}).click();await confirm(owner);
    await expect.poll(async()=> (await api(owner,'GET','/api/supplier/profile')).supplier.reviewStatus).toBe('pending_review');
    supplier=await env.ds.getRepository(Supplier).findOneByOrFail({legalName:'UAT Transportes '+env.tag});
    expect(supplier.countryCode).toBe('BR');expect(supplier.reviewStatus).toBe('pending_review');
    await owner.goto('/supplier/tenders');await expect(owner).toHaveURL(/review-pending/);
  });

  test('03 Buyer previews private document, requests supplement, supplier resubmits and is approved',async()=>{
    await buyer.goto('/suppliers/'+supplier.id+'/review');
    await buyer.getByRole('button',{name:'Visualizar',exact:true}).first().click();
    await expect(buyer.getByRole('dialog').locator('img')).toHaveAttribute('src',/^blob:/);
    await expect.poll(()=>buyer.getByRole('dialog').locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    await buyer.getByRole('dialog').getByRole('button',{name:/Close|Fechar/}).click();
    await review('Solicitar complementação');
    await owner.goto('/supplier/profile');await owner.getByRole('button',{name:/Enviar complementação|Editar dados/}).click();
    await expect(owner.locator('.file-link').first()).toContainText(png.name);
    await owner.getByRole('button',{name:'Enviar dados de certificação',exact:true}).click();await confirm(owner);
    await expect.poll(async()=> (await api(owner,'GET','/api/supplier/profile')).supplier.reviewStatus).toBe('pending_review');
    await review('Aprovar');await expect(buyer.getByText('Aprovado',{exact:true}).first()).toBeVisible();
    await owner.goto('/supplier/tenders');await expect(owner).toHaveURL(/supplier\/tenders$/);
  });

  test('04 Buyer creates a BRL tender through all wizard steps and publishes',async()=>{
    await buyer.goto('/tenders/new');
    await buyer.getByPlaceholder('Informe o nome do projeto').fill('UAT Licitação '+env.tag);
    await choose(buyer,'Título da licitação','Compras recorrentes');
    await expect(buyer.locator('#app').getByText('BRL — Real brasileiro',{exact:true})).toBeVisible();
    const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10)+' 12:00:00';
    await buyer.getByPlaceholder('Selecione o prazo').fill(date);await buyer.getByPlaceholder('Selecione o prazo').press('Tab');
    await buyer.getByRole('button',{name:'Próximo',exact:true}).click();
    await buyer.locator('input[type=radio][value=leading_flag]').check();
    await buyer.locator('.el-form-item').filter({hasText:'Máximo de revisões'}).getByRole('spinbutton').fill('3');
    await buyer.locator('.el-form-item').filter({hasText:'Redução mínima (%)'}).getByRole('spinbutton').fill('1');
    await buyer.locator('.el-form-item').filter({hasText:'Intervalo (segundos)'}).getByRole('spinbutton').fill('10');
    await buyer.getByRole('button',{name:'Próximo',exact:true}).click();
    await buyer.getByPlaceholder('Nome do lote 1').fill('UAT Lote Brasil');
    await buyer.getByRole('button',{name:'Próximo',exact:true}).click();
    await buyer.locator('input[type=file]').last().setInputFiles(png);
    await expect(buyer.locator('.attachment-name')).toContainText(png.name);
    await buyer.getByText('Todos os fornecedores',{exact:true}).first().click();
    await buyer.getByRole('button',{name:'Criar licitação',exact:true}).click();
    await expect(buyer).toHaveURL(/\/tenders$/);
    const created=await env.ds.getRepository(Tender).findOneByOrFail({title:'UAT Licitação '+env.tag});
    await buyer.goto('/tenders/'+created.id);
    tender=await api(buyer,'GET','/api/tenders/'+created.id);
    expect(tender.baseCurrency).toBe('BRL');expect(tender.timezone).toBe('America/Sao_Paulo');
    lot=tender.lots[0];
    await buyer.getByRole('button',{name:'Publicar',exact:true}).click();
    await expect.poll(async()=>(await api(buyer,'GET','/api/tenders/'+tender.id)).status).toBe('open');
  });

  test('05 Supplier opens tender, uploads bid attachment, quotes BRL and revises with decrement validation',async()=>{
    await owner.goto('/supplier/tenders/'+tender.id);await expect(owner.getByText(tender.title,{exact:true}).first()).toBeVisible();
    await owner.goto('/supplier/quotes/lots/'+lot.id);
    await owner.locator('input[type=file]').setInputFiles(png);
    await expect(owner.locator('.attachment-name')).toContainText(png.name);
    await owner.getByRole('spinbutton').fill('1000.01');
    await owner.getByRole('button',{name:'Enviar proposta',exact:true}).click();await confirm(owner);
    await expect.poll(async()=>(await api(owner,'GET','/api/quotes/lots/'+lot.id+'/mine')).quote?.totalPrice).toBe('1000.0100');
    await owner.getByRole('button',{name:'Revisar proposta',exact:true}).click({timeout:20000});
    await owner.getByRole('spinbutton').fill('999');
    await expect(owner.getByRole('button',{name:/Alterar proposta|Revisar proposta/}).first()).toBeDisabled();
    await owner.getByRole('spinbutton').fill('980');
    const send=owner.getByRole('button',{name:/Alterar proposta|Revisar proposta/}).first();
    await expect(send).toBeEnabled();await send.click();await confirm(owner);
    await expect.poll(async()=>Number((await api(owner,'GET','/api/quotes/lots/'+lot.id+'/mine')).quote?.totalPrice)).toBe(980);
    await expect(owner.locator('.rank-value')).toContainText('Na liderança');
    await expect(owner.getByText('Tempo real',{exact:true})).toBeVisible();
    const rank=await api(owner,'GET','/api/quotes/lots/'+lot.id+'/my-rank');expect(rank.isLeading).toBe(true);expect(rank.myRank).toBeUndefined();
  });

  test('06 Buyer grants Vietnam access; supplier switch isolates bids and preserves company registration',async()=>{
    await switchTo(buyer,env.vn.name);await buyer.goto('/suppliers');
    await buyer.getByRole('button',{name:'Adicionar fornecedor existente',exact:true}).click();
    const d=buyer.getByRole('dialog');await d.getByRole('textbox').fill(supplier.businessId);
    await d.getByRole('button',{name:'Pesquisar',exact:true}).click();
    await d.getByRole('button',{name:'Conceder acesso à minha instituição',exact:true}).click();await expect(d).toBeHidden();
    await owner.reload();await expect(owner.locator('.branch-trigger')).toContainText(br.name);
    await switchTo(owner,env.vn.name);
    await api(owner,'GET','/api/quotes/lots/'+lot.id+'/my-rank',undefined,404);
    await api(owner,'GET','/api/tenders/'+tender.id,undefined,404);
    expect((await api(owner,'GET','/api/auth/me')).user.supplierId).toBe(supplier.id);
    expect((await env.ds.getRepository(Supplier).findOneByOrFail({id:supplier.id})).countryCode).toBe('BR');
    await switchTo(owner,br.name);await switchTo(buyer,br.name);
    await owner.goto('/supplier/quotes/lots/'+lot.id);await expect(owner.getByText(/980/).first()).toBeVisible();
  });

  test('07 Staff and evaluator UI permissions; foreign institution cannot inspect private supplier evidence',async({browser})=>{
    staff=await pageFor(browser);evaluator=await pageFor(browser);outsider=await pageFor(browser);
    await login(staff,env.users.staff);await login(evaluator,env.users.evaluator);await login(outsider,env.users.outsider);
    await staff.goto('/tenders/'+tender.id);await expect(staff.getByRole('button',{name:'Encerrar propostas',exact:true})).toHaveCount(0);
    await api(staff,'POST','/api/tenders/'+tender.id+'/close',{},403);
    await evaluator.goto('/tenders');await expect(evaluator.getByRole('button',{name:'Criar licitação',exact:true})).toHaveCount(0);
    await api(evaluator,'POST','/api/tenders',{title:'forbidden',type:'routine'},403);
    const reviewData=await api(buyer,'GET','/api/suppliers/'+supplier.id+'/review-detail');
    await api(outsider,'GET',reviewData.documents[0].fileUrl,undefined,404);
    const guest=await outsider.request.get('http://localhost:3011'+reviewData.documents[0].fileUrl);expect(guest.status()).toBe(404);
  });
  test('08 Supplier invitation joins same company; mobile user sees BRL and Sao Paulo time',async({browser},testInfo)=>{
    await owner.goto('/supplier/profile');
    await owner.getByRole('tab',{name:'Convites para membros',exact:true}).click();
    await owner.getByRole('button',{name:'Gerar código de convite',exact:true}).click();
    const token=(await owner.locator('.el-message-box__message').innerText()).trim();
    await owner.locator('.el-message-box__close').click();
    const member=await pageFor(browser);const email=await register(member,'member');
    await member.getByPlaceholder('Informe o código de convite').fill(token);
    await member.getByRole('button',{name:'Ingressar no fornecedor',exact:true}).click();await confirm(member);
    await expect.poll(async()=>(await api(member,'GET','/api/auth/me')).user.supplierId).toBe(supplier.id);
    await api(member,'POST','/api/supplier/members/invitations',{},403);
    const mobile=await pageFor(browser,true);
    await mobile.goto('/login');
    await mobile.getByRole('button',{name:'Entrar Abrir conta'}).click();
    await mobile.getByLabel('Conta',{exact:true}).fill(email);await mobile.getByLabel('Senha',{exact:true}).fill(env.password);
    await mobile.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(mobile).not.toHaveURL(/login/);
    if(mobile.url().includes('select-branch'))await mobile.getByRole('button').filter({hasText:br.name}).click();
    await mobile.goto('/m/quotes/lots/'+lot.id);
    await expect(mobile.getByText(/980/).first()).toBeVisible();
    await expect(mobile.getByText(/America\/Sao_Paulo/).first()).toBeVisible();
    expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await mobile.screenshot({path:testInfo.outputPath('brazil-mobile-quote.png'),fullPage:true});
    await member.close();await mobile.close();
  });

  test('09 Buyer creates foreign supplier without rewriting registration country; invalid and duplicate CNPJ rejected',async()=>{
    await buyer.goto('/suppliers/new');
    await expect(buyer.locator('#app').getByText('Brasil (BR)',{exact:true})).toBeVisible();
    await choose(buyer,'País / região de registro da empresa','Vietnã (VN)');
    await buyer.getByLabel('Razão social',{exact:true}).fill('UAT Exterior '+env.tag);
    await buyer.getByLabel('Nome abreviado',{exact:true}).fill('UAT Exterior');
    await buyer.getByRole('button',{name:'Enviar',exact:true}).click();await expect(buyer).toHaveURL(/\/suppliers$/);
    const foreign=await env.ds.getRepository(Supplier).findOneByOrFail({legalName:'UAT Exterior '+env.tag});
    expect(foreign.countryCode).toBe('VN');
    await api(buyer,'POST','/api/suppliers',{legalName:'Invalid '+env.tag,shortName:'Invalid',countryCode:'BR',taxId:'11111111111111'},400);
    await api(buyer,'POST','/api/suppliers',{legalName:'Duplicate '+env.tag,shortName:'Duplicate',countryCode:'BR',taxId:supplier.taxId},409);
  });

  test('10 Close blocks bids; reopen in Sao Paulo preserves bid; export full and masked permissions',async()=>{
    await evaluator.goto('/quotes/lots/'+lot.id);
    await expect(evaluator.getByRole('button',{name:'Recalcular classificação',exact:true})).toHaveCount(0);
    await expect(evaluator.getByText('Classificação das propostas',{exact:true})).toBeVisible();
    const frozen=evaluator.waitForResponse((r:any)=>r.url().endsWith('/snapshot')&&r.request().method()==='POST');
    await evaluator.getByRole('button',{name:'Congelar classificação',exact:true}).click();expect((await frozen).status()).toBe(201);
    await staff.goto('/quotes/lots/'+lot.id);await expect(staff.getByRole('button',{name:'Congelar classificação',exact:true})).toHaveCount(0);
    await buyer.goto('/tenders/'+tender.id);
    await buyer.getByRole('button',{name:'Encerrar propostas',exact:true}).click();await confirm(buyer);
    await expect.poll(async()=>(await api(buyer,'GET','/api/tenders/'+tender.id)).status).toBe('closed');
    await owner.goto('/supplier/quotes/lots/'+lot.id);
    await expect(owner.getByRole('button',{name:'Revisar proposta',exact:true})).toHaveCount(0);
    await api(owner,'POST','/api/quotes',{lotId:lot.id,totalPrice:950,currency:'BRL'},403);
    await buyer.getByRole('button',{name:'Reabrir propostas',exact:true}).click();
    const d=buyer.getByRole('dialog',{name:'Reabrir propostas',exact:true});
    const wall=new Date(Date.now()+5*86400000).toISOString().slice(0,10)+' 12:00:00';
    await d.getByRole('combobox').fill(wall);await d.getByRole('combobox').press('Tab');
    await d.getByLabel('Motivo interno',{exact:true}).fill('UAT internal reason');
    await d.getByLabel('Aviso aos fornecedores',{exact:true}).fill('UAT Novo prazo Brasil');
    await d.getByRole('button',{name:'Confirmar e publicar aviso',exact:true}).click();await expect(d).toBeHidden();
    const updated=await api(buyer,'GET','/api/tenders/'+tender.id);
    expect(updated.status).toBe('open');expect(updated.bidDeadline).toContain('T15:00:00');
    expect(Number((await api(owner,'GET','/api/quotes/lots/'+lot.id+'/mine')).quote.totalPrice)).toBe(980);
    const notices=await api(owner,'GET','/api/tenders/'+tender.id+'/deadline-changes');
    expect(JSON.stringify(notices)).not.toContain('UAT internal reason');
    await buyer.getByRole('button',{name:'Exportar',exact:true}).click();
    const download=buyer.waitForEvent('download');
    await buyer.getByRole('dialog').getByRole('button',{name:'Exportar Excel',exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    const ExcelJS=backendRequire('../../backend/node_modules/exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(await file.path());
    const values=JSON.stringify(workbook.worksheets.map((sheet:any)=>sheet.getSheetValues()));
    expect(values).toContain('BRL');expect(values).toContain('980');
    await api(evaluator,'GET','/api/export/tenders/'+tender.id+'/quotes?mode=full',undefined,403);
    const et=await evaluator.evaluate(()=>localStorage.getItem('token'));
    const masked=await evaluator.request.get('http://localhost:3011/api/export/tenders/'+tender.id+'/quotes?mode=masked',{headers:{Authorization:'Bearer '+et}});
    expect(masked.status()).toBe(200);expect(masked.headers()['content-type']).toContain('spreadsheetml');
  });
  test('11 Directed tender blocks uninvited supplier; transport lines quote and round history remain isolated',async({browser})=>{
    const competitor=await pageFor(browser);await register(competitor,'competitor');
    await competitor.getByRole('button',{name:'Preencher dados do fornecedor',exact:true}).click();
    await competitor.locator('.branch-select').click();await competitor.getByRole('option').filter({hasText:br.name}).click();
    await competitor.getByLabel('Razão social',{exact:true}).fill('UAT Concorrente '+env.tag);
    await competitor.getByLabel('Nome abreviado',{exact:true}).fill('Concorrente');
    await competitor.getByLabel('Pessoa de contato',{exact:true}).fill('Maria UAT');
    await competitor.getByLabel('Telefone',{exact:true}).fill('+5511988888888');
    await competitor.getByLabel('Identificação fiscal / CNPJ',{exact:true}).fill(cnpj(Date.now().toString()));
    const uploads=competitor.locator('input[type=file]');for(let i=0;i<await uploads.count();i++)await uploads.nth(i).setInputFiles(png);
    await expect(competitor.locator('.file-link').first()).toContainText(png.name);
    await competitor.getByRole('button',{name:'Enviar dados de certificação',exact:true}).click();await confirm(competitor);
    await expect.poll(async()=> (await api(competitor,'GET','/api/supplier/profile')).supplier.reviewStatus).toBe('pending_review');
    const other=await env.ds.getRepository(Supplier).findOneByOrFail({legalName:'UAT Concorrente '+env.tag});
    await buyer.goto('/suppliers/'+other.id+'/review');await buyer.getByRole('button',{name:'Aprovar',exact:true}).click();
    await buyer.locator('.el-message-box input').fill('UAT approved');await confirm(buyer);
    await competitor.goto('/supplier/tenders');
    const directed=await api(buyer,'POST','/api/tenders',{title:'UAT Directed '+env.tag,type:'routine',bidDeadline:new Date(Date.now()+86400000).toISOString(),notifySuppliers:false,participationMode:'selected',participantSupplierIds:[supplier.id],lots:[{title:'Private lot'}]},201);
    await api(buyer,'POST','/api/tenders/'+directed.id+'/publish',{},201);
    await api(competitor,'POST','/api/quotes',{lotId:directed.lots[0].id,totalPrice:100,currency:'BRL'},403);
    const transport=await api(buyer,'POST','/api/tenders',{title:'UAT Transporte '+env.tag,type:'transport',rankingMode:'leading_flag',cooldownSeconds:1,maxRebidCount:3,bidDeadline:new Date(Date.now()+86400000).toISOString(),notifySuppliers:false,participationMode:'all',lots:[{title:'São Paulo → Santos',lineColumns:[{key:'route',label:'Rota'},{key:'vehicle',label:'Veículo',required:true}],lines:[{data:{route:'São Paulo → Santos'}},{data:{route:'Rio → São Paulo'}}]}]},201);
    await api(buyer,'POST','/api/tenders/'+transport.id+'/publish',{},201);
    const transportLot=transport.lots[0],line=transportLot.lines[0];
    await owner.goto('/supplier/quotes/lots/'+transportLot.id);
    const row=owner.locator('.el-table__body tr').filter({hasText:'São Paulo → Santos'});
    await row.getByRole('spinbutton').fill('300.25');
    await expect(row.getByRole('button',{name:'Enviar',exact:true})).toBeDisabled();
    await row.getByRole('textbox').fill('Caminhão');
    await row.getByRole('button',{name:'Enviar',exact:true}).click();await confirm(owner);
    await expect.poll(async()=>Number((await api(owner,'GET','/api/quotes/lines/'+line.id+'/mine')).quote?.totalPrice)).toBe(300.25);
    await api(competitor,'POST','/api/quotes/lines/'+line.id,{totalPrice:290,currency:'BRL',items:{vehicle:'Caminhão'}},201);
    await owner.reload();await expect(owner.getByText('Fora da liderança',{exact:true})).toBeVisible();
    await expect(owner.getByText(/undefined/)).toHaveCount(0);
    await api(owner,'POST','/api/quotes/lines/'+transportLot.lines[1].id,{totalPrice:500,currency:'BRL',items:{}},400);
    await api(owner,'POST','/api/quotes/lines/'+transportLot.lines[1].id,{totalPrice:500,currency:'BRL',items:{vehicle:'Van'}},201);
    await buyer.goto('/tenders/'+transport.id);
    await api(buyer,'POST','/api/tenders/'+transport.id+'/close',{},201);
    await api(buyer,'POST','/api/tenders/'+transport.id+'/rounds/next',{},201);
    const next=await api(buyer,'GET','/api/tenders/'+transport.id);expect(next.currentQuoteRound).toBe(2);
    expect(next.lots[0].lines[0].id).not.toBe(line.id);
    const history=await api(buyer,'GET','/api/quotes/lines/'+line.id+'/suppliers/'+supplier.id+'/history');
    expect(JSON.stringify(history)).toContain('300.2500');
    await api(buyer,'POST','/api/tenders/'+transport.id+'/publish',{},201);
    await api(owner,'POST','/api/quotes/lines/'+line.id,{totalPrice:280,currency:'BRL',items:{vehicle:'Van'}},404);
    await api(owner,'POST','/api/quotes/lines/'+next.lots[0].lines[0].id,{totalPrice:280,currency:'BRL',items:{vehicle:'Van'}},201);
    await competitor.close();
  });

  test('12 Revoke institutional membership and disable institution: existing sessions lose access immediately',async()=>{
    await switchTo(owner,env.vn.name);await switchTo(buyer,env.vn.name);
    await buyer.goto('/suppliers');
    await buyer.getByRole('row').filter({hasText:supplier.legalName}).getByRole('button',{name:'Detalhes',exact:true}).click();
    await buyer.getByRole('button',{name:'Revogar acesso local',exact:true}).click();await confirm(buyer);
    await expect(buyer).toHaveURL(/\/suppliers$/);
    await expect(buyer.getByRole('row').filter({hasText:supplier.legalName})).toHaveCount(0);
    await buyer.getByRole('tab',{name:'Análise do fornecedor',exact:true}).click();
    await expect(buyer.getByText('Fornecedor não encontrado.',{exact:true})).toBeVisible();
    await expect(buyer.getByRole('heading',{name:supplier.legalName,exact:true})).toHaveCount(0);
    await api(owner,'GET','/api/auth/me',undefined,401);
    await owner.reload();await expect(owner).toHaveURL(/\/login$/);
    await owner.getByLabel('Conta',{exact:true}).fill('uat-'+env.tag+'-owner@example.invalid');await owner.getByLabel('Senha',{exact:true}).fill(env.password);
    await owner.getByRole('button',{name:'Entrar',exact:true}).click();await expect(owner).toHaveURL(/\/hall$/);
    expect((await api(owner,'GET','/api/auth/me')).activeBranchId).toBe(br.id);
    await hq.goto('/organization/branches');
    await hq.getByRole('row').filter({hasText:br.name}).getByRole('button',{name:'Membros',exact:true}).click();
    const member=hq.getByRole('dialog').getByRole('row').filter({hasText:env.users.evaluator.email});
    await member.getByRole('button',{name:'Remover',exact:true}).click();await confirm(hq);
    await expect(member).toHaveCount(0);
    await api(evaluator,'GET','/api/tenders/'+tender.id,undefined,401);
    await hq.getByRole('dialog',{name:'Membros — '+br.name,exact:true}).getByRole('button',{name:/Close|Fechar/}).click();
    await hq.getByRole('row').filter({hasText:br.name}).getByRole('button',{name:'Desativar',exact:true}).click();await confirm(hq);
    await expect(hq.getByRole('row').filter({hasText:br.name})).toContainText('Inativa');
    await api(owner,'GET','/api/auth/me',undefined,401);await api(staff,'GET','/api/auth/me',undefined,401);
    expect(browserErrors).toEqual([]);
  });
});
