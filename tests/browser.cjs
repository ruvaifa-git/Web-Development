// Optional integration checks: npm install, npx playwright install chromium, npm run test:browser.
// The HTTP server below is temporary test infrastructure, not an application backend.
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

async function run(options={}){
  const {chromium}=options.playwright||require('playwright');
  const results=[],errors=[];
  const artifacts=options.artifacts||path.join(__dirname,'artifacts');
  await fs.mkdir(artifacts,{recursive:true});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
  const server=http.createServer(async(req,res)=>{
    try{
      const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
      res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
    }catch(error){res.statusCode=404;res.end('Not found')}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  let browser,environment={};
  async function check(name,action){
    try{await action();results.push({name,result:'PASS'});console.log('PASS '+name)}
    catch(error){results.push({name,result:'FAIL',message:error.message});throw error}
  }
  try{
    browser=await chromium.launch({headless:true,...(options.executablePath?{executablePath:options.executablePath}:{})});
    environment={browser:'Chromium',version:browser.version(),node:process.version,platform:process.platform,startedAt:new Date().toISOString(),widths:[320,375,768,1280]};
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    // No real user information is used; every run has a fresh, disposable browser profile.
    await context.route('https://**',route=>route.abort());
    const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>errors.push(error.message));
    const base=`http://127.0.0.1:${server.address().port}/`;
    const lf=base+'Lost-and-Found/';const event=base+'VOC%20Event%20Hub/index.html';const registration=event.replace('index.html','registration.html');
    const go=name=>page.goto(lf+name);
    const text=selector=>page.locator(selector).textContent();
    const today=new Date().toISOString().slice(0,10);
    await require('./round6-cases.cjs')({browser,root,lf,event,fs,path,errors,check,today});
    await require('./event-pages.cjs')({browser,root,event,fs,path,errors,check,artifacts});
    await check('Guests must log in before browsing and retain their destination',async()=>{
      await go('items.html');await page.waitForURL(/login\.html\?next=items.html/);assert.match(await text('#loginNotice'),/browse lost and found reports/);
    });
    await check('Keyboard skip link moves focus to main',async()=>{
      await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');
      await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
    });
    await check('Protected report form redirects to login and retains destination',async()=>{
      await go('report.html?type=lost');await page.waitForURL(/login\.html\?next=/);assert.match(await text('#loginNotice'),/report an item/);
      await page.getByRole('link',{name:'Create an account',exact:true}).click();
    });
    await check('Account form validation and local sign-in work',async()=>{
      await page.locator('#registerForm button').click();assert.equal(await page.locator('#registerName').getAttribute('aria-invalid'),'true');
      await page.locator('#registerName').fill('Demo Student');await page.locator('#registerEmail').fill('demo.student@example.com');
      await page.locator('#registerPassword').fill('sample-password');await page.locator('#registerForm button').click();
      await page.waitForURL(/report\.html/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lf_currentUser')).password),undefined);
    });
    await check('Category errors are linked to the focused radio control',async()=>{
      await page.locator('#itemName').fill('Silver Samsung phone');await page.locator('#reportForm button[type=submit]').click();
      const focused=await page.evaluate(()=>({name:document.activeElement.name,description:document.activeElement.getAttribute('aria-describedby')}));
      assert.equal(focused.name,'category');assert.equal(focused.description,'categoryGroup-error');
    });
    await check('Future dates are rejected with field feedback',async()=>{
      await page.locator('input[name=category][value=electronics]').check();
      await page.locator('#itemDate').fill('2999-01-01');await page.locator('#itemPlace').fill('Central Library');
      await page.locator('#itemDescription').fill('Dragon sticker and cracked display');await page.locator('#reportForm button[type=submit]').click();
      assert.match(await text('#itemDate-error'),/future/);await page.locator('#itemDate').fill(today);
    });
    await check('Text draft survives reload and can be restored',async()=>{
      await page.locator('#draftStatus').filter({hasText:'Text draft saved'}).waitFor();await page.reload();
      await page.locator('#draftPrompt').waitFor({state:'visible'});await page.locator('#restoreDraft').click();
      assert.equal(await page.locator('#itemName').inputValue(),'Silver Samsung phone');
      assert.equal(await page.locator('#itemPlace').inputValue(),'Central Library');
      assert.equal(await page.locator('input[name=category][value=electronics]').isChecked(),true);
    });
    let ownReport;
    await check('Photo publishing stores the report and clears its draft',async()=>{
      await page.locator('#itemImage').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYp8AAAAASUVORK5CYII=','base64')});
      await page.locator('#reportForm button[type=submit]').click();await page.waitForURL(/item-details\.html.*published=1/);
      await page.locator('.page-banner:focus').waitFor();
      assert.match(await page.evaluate(()=>document.activeElement.textContent),/Your report has been published/);
      ownReport=await page.evaluate(()=>JSON.parse(localStorage.getItem('lf_records')).items[0]);assert.ok(ownReport.fileId);
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('lf_draft_'))),false);
    });
    await check('True matches appear with scores and explanatory reasons',async()=>{
      await page.evaluate(item=>{
        const items=JSON.parse(localStorage.getItem('lf_records')).items;
        items.push({...item,id:'true-found',type:'found',reportedBy:'finder@example.com',fileId:'',createdAt:Date.now()+1});
        items.push({...item,id:'recovered-phone',status:'recovered',fileId:''});
        localStorage.setItem('lf_records',JSON.stringify({...JSON.parse(localStorage.getItem('lf_records')||'{"version":1,"claims":[]}'),items}));
      },ownReport);
      await page.reload();assert.match(await text('.match-score'),/Similarity score: \d+\/100/);assert.match(await text('.match-reasons'),/Similar name/);
    });
    await check('Status/location/date filters persist when returning from details',async()=>{
      await go('items.html');await page.locator('#typeFilter').selectOption('found');await page.locator('#statusFilter').selectOption('open');
      await page.locator('#placeFilter').fill('Central Library');await page.locator('#dateFrom').fill(today);await page.locator('#dateTo').fill(today);
      await page.locator('#itemsCount').filter({hasText:'1 report of 3'}).waitFor();
      await page.getByRole('link',{name:'View details for Silver Samsung phone',exact:true}).click();
      await page.waitForLoadState('domcontentloaded');assert.match(await page.locator('.back-link').getAttribute('href'),/status=open/);
      await page.locator('.back-link').click();await page.waitForURL(/items\.html/);await page.waitForLoadState('domcontentloaded');
      assert.equal(await page.locator('#statusFilter').inputValue(),'open');assert.equal(await page.locator('#placeFilter').inputValue(),'Central Library');
      assert.equal(await page.locator('#dateFrom').inputValue(),today);assert.match(page.url(),/status=open/);
    });
    await check('Reset filters restores the open reports and clears campus/date constraints',async()=>{
      await page.locator('#clearFilters').click();await page.locator('#itemsCount').filter({hasText:'2 reports of 3'}).waitFor();
      assert.equal(await page.locator('#placeFilter').inputValue(),'');assert.equal(await page.locator('#dateFrom').inputValue(),'');
      assert.equal(await page.locator('#statusFilter').inputValue(),'open');assert.match(page.url(),/items\.html\?status=open$/);
    });
    await check('Forged management actions do not alter another reporter’s item',async()=>{
      await go('my-reports.html');await page.locator(`#myReportsGrid button[data-id="${ownReport.id}"]`).first().waitFor();
      await page.evaluate(()=>{const button=document.createElement('button');button.dataset.action='recover';button.dataset.id='true-found';button.textContent='Test foreign action';document.getElementById('myReportsGrid').appendChild(button)});
      await page.getByRole('button',{name:'Test foreign action'}).click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lf_records')).items.find(i=>i.id==='true-found').status),'active');
    });
    await check('Recovery disables the owner’s action and removes suggestions',async()=>{
      await page.locator(`button[data-action=recover][data-id="${ownReport.id}"]`).click();
      await page.locator(`button[data-action=recover][data-id="${ownReport.id}"]:disabled`).waitFor();
      await go(`item-details.html?id=${ownReport.id}`);assert.equal(await page.locator('#matches').count(),0);
    });
    await check('Guest response login returns to the selected report',async()=>{
      await page.locator('#logoutBtn').click();await go('item-details.html?id=true-found');await page.waitForURL(/login\.html\?next=/);
      await page.locator('#loginEmail').fill('demo.student@example.com');await page.locator('#loginPassword').fill('sample-password');
      await page.locator('#loginForm button').click();await page.waitForURL(/item-details\.html\?id=true-found/);
      await page.locator('#claimBtn').click();await page.locator('#claimText').fill('The phone has a dragon sticker and a cracked display.');await page.locator('#claimForm button[type=submit]').click();assert.match(await text('#claimMessage'),/has not been sent/);
    });
    await check('Unreadable report storage shows a recoverable error and preserves data',async()=>{
      await page.evaluate(()=>localStorage.setItem('lf_records','{}'));await go('items.html');
      await page.locator('#storageMessage').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('lf_records')),'{}');
      assert.match(await text('#itemsGrid'),/Existing data has been kept/);
      await page.evaluate(()=>localStorage.setItem('lf_records',JSON.stringify({version:1,items:[],claims:[]})));
    });
    await check('Quota failure retains report fields and does not claim success',async()=>{
      await go('report.html?type=found');await page.locator('#itemName').fill('Blue backpack');
      await page.locator('input[name=category][value=bags]').check();await page.locator('#itemDate').fill(today);
      await page.locator('#itemPlace').fill('Cafeteria');await page.locator('#itemDescription').fill('A backpack with a dragon sticker');
      await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lf_records')throw new DOMException('Full','QuotaExceededError');return window.originalSetItem.call(this,key,value)}});
      await page.locator('#reportForm button[type=submit]').click();await page.locator('#reportMessage').filter({hasText:'Could not save'}).waitFor();
      assert.equal(await page.locator('#itemName').inputValue(),'Blue backpack');assert.match(page.url(),/report\.html/);
      await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});
    });
    await check('Event date is unconfirmed and countdown stays hidden',async()=>{
      await page.goto(event);assert.equal(await page.locator('#countdown-timer').isVisible(),false);assert.equal(await text('#event-date'),'Date to be announced');
    });
    await check('Event registration validates fields and gives an honest local confirmation',async()=>{
      await page.goto(registration);
      await page.locator('#register-form button[type=submit]').click();assert.equal(await page.locator('#name').getAttribute('aria-invalid'),'true');
      await page.locator('#name').fill('Demo Student');await page.locator('#email').fill('event.demo@example.com');await page.locator('#role').selectOption('student');
      await page.locator('#register-form button[type=submit]').click();await page.locator('#confirmation').waitFor({state:'visible'});
      assert.match(await text('#confirmation'),/Organisers have not received it/);assert.equal(await page.evaluate(()=>document.activeElement.id),'confirm-title');
      const accessibility=await context.newCDPSession(page);
      try{
        const {nodes}=await accessibility.send('Accessibility.getFullAXTree');
        for(const role of ['region','heading']){
          const confirmation=nodes.find(node=>!node.ignored&&node.role?.value===role&&node.name?.value==='Demo registration saved');
          assert.match(confirmation?.description?.value||'',/Organisers have not received it/);
        }
      }finally{await accessibility.detach()}
    });
    await check('Downloaded PNG is a demo ticket, not an admission credential',async()=>{
      const downloadPromise=page.waitForEvent('download');await page.locator('#download-ticket').click();const download=await downloadPromise;
      assert.match(download.suggestedFilename(),/-demo\.png$/);await download.saveAs(path.join(artifacts,'demo-ticket.png'));
    });
    await check('Duplicate event email shows the existing local demo ticket',async()=>{
      await page.goto(registration);await page.locator('#returning-new').click();await page.locator('#name').fill('Demo Student');await page.locator('#email').fill('EVENT.DEMO@EXAMPLE.COM');
      await page.locator('#register-form button[type=submit]').click();assert.match(await text('#register-message'),/Already saved on this device/);
      await page.locator('#show-ticket').click();await page.waitForURL(/dashboard.html/);assert.equal(await text('#confirm-email'),'event.demo@example.com');
    });
    await check('FAQ is keyboard operable and references its answer',async()=>{
      await page.goto(event);await page.locator('.faq-question').nth(1).focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('.faq-question').nth(1).getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#faq-answer-2').isVisible(),true);
    });
    await check('Mobile menu closes with Escape and restores button focus',async()=>{
      await page.setViewportSize({width:375,height:812});await page.locator('.menu-toggle').click();await page.keyboard.press('Escape');
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement.className),'menu-toggle');
    });
    await check('No horizontal overflow at phone/tablet widths in both themes',async()=>{
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>localStorage.setItem('lf_theme',theme),theme);
        for(const width of [320,375,768])for(const name of ['index.html','items.html','report.html?type=found','dashboard.html','my-reports.html','login.html','register.html','item-details.html?id=missing','claims.html','recovered.html']){
          await page.setViewportSize({width,height:900});await go(name);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${theme} ${width} ${name}`);
        }
      }
      for(const width of [320,375,768]){await page.setViewportSize({width,height:900});await page.goto(event);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Event Hub ${width}`)}
    });
    await check('Reduced motion and zoom do not hide content or produce overflow',async()=>{
      await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1280,height:900});await go('items.html');
      await page.evaluate(()=>document.body.style.zoom='2');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.evaluate(()=>document.body.style.zoom='1');await page.goto(event);
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('js-reveal')),false);
    });
    await check('Boilerplate and conflicting-colour reports do not appear as matches',async()=>{
      await go('items.html');
      await page.evaluate(date=>{
        const base={description:'Please contact me',place:'Central Library',date,status:'active',contact:'demo.student@example.com',reportedBy:'finder@example.com',reporterName:'Demo Finder',createdAt:1};
        localStorage.removeItem('lf_records');localStorage.setItem('lf_items',JSON.stringify([
          {...base,id:'umbrella',type:'lost',name:'Umbrella',category:'other'},
          {...base,id:'calculator',type:'found',name:'Calculator',category:'other'},
          {...base,id:'black-watch',type:'lost',name:'Black watch',category:'electronics'},
          {...base,id:'white-watch',type:'found',name:'White watch',category:'electronics'}
        ]));
      },today);
      for(const id of ['umbrella','black-watch']){
        await go(`item-details.html?id=${id}`);await page.getByRole('heading',{name:'No possible matches yet.',exact:true}).waitFor();
        assert.equal(await page.locator('.match-card').count(),0);
      }
    });
    await check('A real second-tab publication survives a paused IndexedDB photo save',async()=>{
      const raceContext=await browser.newContext({viewport:{width:1280,height:900}});
      await raceContext.route('https://**',route=>route.abort());
      try{
        const first=await raceContext.newPage(),second=await raceContext.newPage();
        for(const target of [first,second])target.on('pageerror',error=>errors.push(error.message));
        await first.goto(lf+'index.html');
        await first.evaluate(()=>{const user={id:'race-student',name:'Demo Student',email:'race.demo@example.com'};localStorage.setItem('lf_users',JSON.stringify([{...user,password:'sample-password'}]));localStorage.setItem('lf_currentUser',JSON.stringify(user))});
        await first.goto(lf+'report.html?type=lost');await second.goto(lf+'report.html?type=found');
        async function fillReport(target,name){
          await target.locator('#itemName').fill(name);await target.locator('input[name=category][value=electronics]').check();
          await target.locator('#itemDate').fill(today);await target.locator('#itemPlace').fill('Central Library');
          await target.locator('#itemDescription').fill('Dragon sticker and cracked display');
        }
        await fillReport(first,'Silver Samsung phone');
        await first.locator('#itemImage').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYp8AAAAASUVORK5CYII=','base64')});
        await first.evaluate(()=>{
          const actualSave=saveFile;
          saveFile=async(id,file)=>{
            await actualSave(id,file);window.photoStored=true;
            await new Promise(resolve=>{window.releasePhotoSave=resolve});
          };
        });
        await first.locator('#reportForm button[type=submit]').click();await first.waitForFunction(()=>window.photoStored===true);
        await fillReport(second,'Other tab phone');await second.locator('#reportForm button[type=submit]').click();
        await second.waitForURL(/item-details\.html.*published=1/);
        await first.evaluate(()=>window.releasePhotoSave());await first.waitForURL(/item-details\.html.*published=1/);
        const saved=await first.evaluate(()=>JSON.parse(localStorage.getItem('lf_records')).items);
        assert.equal(saved.length,2);assert.ok(saved.some(item=>item.name==='Other tab phone'));
        const own=saved.find(item=>item.name==='Silver Samsung phone');assert.ok(own.fileId);
        await first.waitForFunction(()=>{const image=document.querySelector('.detail-photo img');return image?.complete&&image.naturalWidth>0});
      }finally{await raceContext.close()}
    });
    await check('No uncaught page errors',async()=>assert.deepEqual(errors,[]));
    // Capture populated cards, not just an empty gallery. All content is disposable demo data.
    await go('items.html');await page.evaluate(()=>localStorage.setItem('lf_theme','light'));
    await page.setViewportSize({width:1280,height:900});await go('items.html');await page.screenshot({path:path.join(artifacts,'browse-desktop.png'),fullPage:true});
    await page.setViewportSize({width:375,height:812});await page.screenshot({path:path.join(artifacts,'browse-mobile.png'),fullPage:true});
    await go('report.html?type=found');await page.screenshot({path:path.join(artifacts,'report-mobile.png'),fullPage:true});
    await page.goto(event);await page.screenshot({path:path.join(artifacts,'event-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(artifacts,'event-desktop.png'),fullPage:true});
    return {passed:results.length,results,environment};
  }finally{
    await fs.writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({environment,results,errors},null,2));
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
module.exports=run;
if(require.main===module)run().then(result=>console.log(`${result.passed} browser scenarios passed.`)).catch(error=>{console.error(error);process.exitCode=1});
