// Run against `npm run preview -- --port 5193`. Requires Playwright + Chrome.
// All API requests are intercepted: this test never changes backend data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bidflow-deadline-ui-'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const id='32499867-8970-4e46-b6de-4b2f320e1215';
    const tender={id,tenderNo:'T-202609-0016',title:'Deadline adjustment test',status:'closed',bidDeadline:'2026-09-04T05:00:00Z',bidStartAt:'2026-09-01T05:00:00Z',updatedAt:'2026-09-04T05:00:09Z',currentQuoteRound:1,participationMode:'all',baseCurrency:'IDR',maxRebidCount:10,minDecrementPct:0.5,cooldownSeconds:60,lots:[],attachments:[]};
    let changes=[],payload;
    async function setup(context,supplier=false) {
      await context.addInitScript(()=>{localStorage.setItem('token','ui-test');localStorage.setItem('locale','zh-CN');});
      await context.route('**/api/**',async route=>{
        const url=new URL(route.request().url()); let data=null;
        if(url.pathname==='/api/auth/me') data={user:{id:'buyer',displayName:'Test Buyer',role:supplier?'supplier':'purchase_manager',accountType:supplier?'supplier_account':'company_user',supplierId:supplier?'supplier':undefined,supplierStatus:'active',supplierReviewStatus:'approved'},capabilities:supplier?['tender:view']:['tender:view','tender:deadline_adjust'],branches:[]};
        else if(url.pathname.endsWith('/deadline-changes/preview')) data={tenderNo:tender.tenderNo,round:1,status:tender.status,updatedAt:tender.updatedAt,version:'123',deadline:tender.bidDeadline,timezone:'Asia/Jakarta',participationMode:'all',quotedSuppliers:5,recipientCount:5};
        else if(url.pathname.endsWith('/deadline-changes') && route.request().method()==='POST') {
          payload=route.request().postDataJSON();
          changes=[{id:'change1',round_no:1,old_deadline:tender.bidDeadline,new_deadline:payload.newDeadline,announcement:payload.announcement,reason:payload.reason,timezone:'Asia/Jakarta',created_at:new Date().toISOString(),actor_name:'Test Buyer',recipients:5,sent:0,failed:0}];
          tender.status='open';tender.bidDeadline=payload.newDeadline;tender.updatedAt=new Date().toISOString();data={id:'change1'};
        }
        else if(url.pathname.endsWith('/deadline-changes')) data=changes.map(r=>supplier?{...r,reason:undefined,actor_name:undefined}:r);
        else if(url.pathname===`/api/tenders/${id}`) data=tender;
        await route.fulfill({json:{success:true,data}});
      });
    }
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});
    await setup(context); const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:5193/tenders/${id}`);
    await page.getByRole('button',{name:'重新开放报价',exact:true}).click();
    const dialog=page.getByRole('dialog'); await dialog.waitFor();
    const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    await dialog.locator('input').first().fill(`${future} 12:00:00`);
    await dialog.locator('textarea').nth(0).fill('供应商准备时间不足');
    await dialog.locator('textarea').nth(1).fill('报价截止时间已延长，请按新时间提交。');
    await dialog.getByText('供应商公告',{exact:true}).click();
    await page.screenshot({path:path.join(artifacts,'desktop-dialog.png')});
    await dialog.getByRole('button',{name:'确认调整并发布公告'}).click();
    await page.getByRole('button',{name:'延长截止时间',exact:true}).waitFor();
    assert.equal(payload.newDeadline,`${future}T05:00:00.000Z`);
    assert.equal(payload.expectedRound,1);
    assert.equal(payload.expectedStatus,'closed');
    assert.ok(payload.idempotencyKey);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.screenshot({path:path.join(artifacts,'desktop-history.png')});
    const mobile=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await setup(mobile,true); const mp=await mobile.newPage();
    await mp.goto(`http://127.0.0.1:5193/m/tenders/${id}`);
    await mp.getByText('报价截止时间已延长，请按新时间提交。',{exact:true}).last().waitFor();
    assert.equal(await mp.getByRole('button',{name:'延长截止时间',exact:true}).count(),0);
    assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await mp.screenshot({path:path.join(artifacts,'mobile-announcement.png'),fullPage:true});
    console.log('PASS: desktop reopening, Asia/Jakarta conversion in non-Jakarta browser, payload, history, mobile announcement, no supplier editing, no horizontal overflow');
    console.log('Screenshots:',artifacts);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
