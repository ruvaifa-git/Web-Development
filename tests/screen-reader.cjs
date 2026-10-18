// Optional Linux/Orca integration checks. See TESTING.md; always use a NEW dbus-run-session.
// Temporary server/profile/preferences/private AT-SPI and speech services; no app backend.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(process.env.PROJECT_ROOT||path.join(__dirname,'..'));
const artifacts=path.resolve(process.env.SCREEN_READER_ARTIFACTS||path.join(__dirname,'artifacts/screen-reader'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const processes=[];let browser;
process.on('exit',()=>{for(const p of processes)if(p.exitCode===null)p.kill('SIGTERM')});
(async()=>{
  assert.equal(process.env.CONTEST_PRIVATE_DBUS,'1','Run with CONTEST_PRIVATE_DBUS=1 dbus-run-session -- node verify.cjs, never on your normal session bus.');
  await fs.mkdir(artifacts,{recursive:true});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'contest-orca-'));
  console.log('Isolated test session: '+temp);
  const env={...process.env,GSETTINGS_BACKEND:'memory',XDG_CONFIG_HOME:temp+'/config',XDG_DATA_HOME:temp+'/data',XDG_CACHE_HOME:temp+'/cache',SPEECHD_ADDRESS:'unix_socket:'+temp+'/speech.sock'};
  delete env.AT_SPI_BUS_ADDRESS;
  env.PULSE_SERVER=process.env.PULSE_SERVER||'unix:'+process.env.XDG_RUNTIME_DIR+'/pulse/native';
  env.XDG_RUNTIME_DIR=temp+'/runtime';await fs.mkdir(env.XDG_RUNTIME_DIR,{mode:0o700});
  delete env.DISPLAY;delete env.WAYLAND_DISPLAY;delete env.XAUTHORITY;
  env.LIBGL_ALWAYS_SOFTWARE='1';
  function start(binary,args,name){
    const p=spawn(binary,args,{env,stdio:['ignore','ignore','pipe']});processes.push(p);
    p.stderr.on('data',d=>fs.appendFile(temp+'/'+name+'-stderr.txt',d));return p;
  }
  await fs.writeFile(temp+'/desktop-session.sh',`#!/bin/sh
printf '%s\\n' "$DISPLAY" > '${temp}/xdisplay'
printf '%s\\n' "$XAUTHORITY" > '${temp}/xauth'
exec /usr/bin/sleep 300
`,{mode:0o700});
  start('kwin_wayland',['--xwayland','--exit-with-session='+temp+'/desktop-session.sh','--virtual','--no-global-shortcuts','--no-lockscreen','--no-kactivities','--socket','contest-reader','--width','1280','--height','900'],'compositor');
  for(let i=0;i<50;i++){try{await fs.access(temp+'/runtime/contest-reader');break}catch(e){await delay(100)}}
  await fs.access(temp+'/runtime/contest-reader');env.WAYLAND_DISPLAY='contest-reader';
  for(let i=0;i<100;i++){try{await fs.access(temp+'/xdisplay');break}catch(e){await delay(100)}}
  env.DISPLAY=(await fs.readFile(temp+'/xdisplay','utf8')).trim();env.XAUTHORITY=(await fs.readFile(temp+'/xauth','utf8')).trim();env.GDK_BACKEND='x11';
  start('/usr/libexec/at-spi-bus-launcher',['--launch-immediately','--a11y=1','--screen-reader=1'],'atspi');
  await delay(1000);start('/usr/libexec/at-spi2-registryd',[],'registry');
  await fs.mkdir(temp+'/data/orca',{recursive:true});
  // Disable automatic full-page reading, so focus/live-region tests are not interrupted by Say All moving the caret.
  await fs.writeFile(temp+'/data/orca/orca-customizations.py','from orca import debug, gsettings_registry\nif debug.debugFile:\n    debug.debugFile.reconfigure(line_buffering=True)\ngsettings_registry.get_registry().set_runtime_value("document", "say-all-on-load", False)\n');
  await fs.mkdir(temp+'/speech-config/modules',{recursive:true});await fs.mkdir(temp+'/speech-logs');
  await fs.copyFile('/etc/speech-dispatcher/modules/espeak-ng.conf',temp+'/speech-config/modules/espeak-ng.conf');
  await fs.writeFile(temp+'/speech-config/speechd.conf','LogLevel 2\nAddModule "espeak-ng" "sd_espeak-ng" "espeak-ng.conf"\nDefaultModule "espeak-ng"\nAudioOutputMethod "pulse"\n');
  start('speech-dispatcher',['--run-single','--socket-path',temp+'/speech.sock','--pid-file',temp+'/speech.pid','--log-dir',temp+'/speech-logs','--config-dir',temp+'/speech-config'],'speech');
  await delay(1500);const orca=start('orca',['--debug-file',temp+'/orca-debug.txt'],'orca');await delay(3000);
  const server=http.createServer(async(req,res)=>{
    try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file))}catch(e){res.statusCode=404;res.end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const results=[],errors=[];let page,cdp;
  const readLog=()=>fs.readFile(temp+'/orca-debug.txt','utf8');
  const speechFrom=log=>log.split('\n').filter(l=>l.includes('SPEECH OUTPUT:')).map(l=>l.replace(/^.*SPEECH OUTPUT: '/,'').replace(/' \{.*$/,''));
  async function ax(){return (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value,description:n.description?.value,properties:n.properties?.filter(p=>['invalid','required','expanded','level','live','focused','checked'].includes(p.name)).map(p=>({name:p.name,value:p.value.value}))}))}
  async function check(name,action,patterns=[]){
    await delay(500);const offset=(await readLog()).length;let failure;
    try{
      await action();
      const deadline=Date.now()+7500;
      while(Date.now()<deadline){const utterances=speechFrom((await readLog()).slice(offset)).join('\n');if(patterns.every(p=>p.test(utterances)))break;await delay(120)}
      await delay(400);
      const actual=speechFrom((await readLog()).slice(offset)).join('\n');for(const pattern of patterns)assert.match(actual,pattern);
    }catch(error){failure=error.message}
    const result={name,result:failure?'FAIL':'PASS',...(failure?{message:failure}:{}),speech:speechFrom((await readLog()).slice(offset)),accessibilityTree:await ax()};
    results.push(result);await fs.writeFile(path.join(artifacts,'progress.json'),JSON.stringify(results.map(({name,result,message})=>({name,result,message})),null,2));console.log(result.result+' '+name+(failure?' — '+failure.split('\n')[0]:''));
  }
  const command=(module,name)=>execFileSync('gdbus',['call','--session','--dest','org.gnome.Orca.Service','--object-path','/org/gnome/Orca/Service/'+module,'--method','org.gnome.Orca.Module.ExecuteCommand',name,'true'],{env,encoding:'utf8',timeout:5000});
  let environment;
  try{
    assert.equal(orca.exitCode,null,'Orca must be running');
    const orcaVersion=execFileSync('gdbus',['call','--session','--dest','org.gnome.Orca.Service','--object-path','/org/gnome/Orca/Service','--method','org.gnome.Orca.Service.GetVersion'],{env,encoding:'utf8',timeout:5000}).trim();
    browser=await chromium.launch({headless:false,env,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--force-renderer-accessibility','--ozone-platform=x11']});
    const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await context.route('https://**',r=>r.abort());
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));cdp=await context.newCDPSession(page);
    environment={screenReader:orcaVersion.replace(/[()' ,]/g,''),browser:'Chromium',browserVersion:browser.version(),platform:process.platform,node:process.version,startedAt:new Date().toISOString(),mode:'Headed Chromium through private Xwayland in a virtual KWin desktop; private DBus/AT-SPI; default verbosity; Say All on load disabled; Speech Dispatcher configured with eSpeak NG; Orca speech-output log assertions'};
    const base=`http://127.0.0.1:${server.address().port}/`,lf=base+'Lost-and-Found/',event=base+'VOC%20Event%20Hub/index.html';
    async function go(url){await page.goto(url);await page.bringToFront();await delay(1500)}
    const today=new Date().toISOString().slice(0,10);
    await go(lf+'login.html');
    await page.evaluate(()=>{const user={id:'reader',name:'Reader Student',email:'reader@example.com'};localStorage.setItem('lf_users',JSON.stringify([{...user,password:'sample-password'}]));localStorage.setItem('lf_currentUser',JSON.stringify(user))});
    await go(lf+'items.html');
    await check('Skip link announces its purpose and moves to main',async()=>{await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');await delay(500);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content')},[/Skip to main content/,/main content/]);
    await check('Orca heading navigation finds the page heading',async()=>{assert.match(command('StructuralNavigator','NextHeadingLevel1'),/true/);const tree=await ax();assert.ok(tree.some(n=>n.role==='heading'&&n.name==='Find an item'&&n.properties.some(p=>p.name==='level'&&p.value===1)));await delay(500);command('WhereAmIPresenter','WhereAmIBasic')},[/Find an item/]);
    await check('Search field has a spoken label and role',()=>page.locator('#searchInput').focus(),[/Search reports/,/entry/]);
    const sample={id:'reader-found',type:'found',name:'Silver Samsung phone',category:'electronics',description:'Dragon sticker and cracked display',date:today,place:'Central Library',contact:'finder@example.com',reportedBy:'finder@example.com',reporterName:'Demo Finder',status:'active',createdAt:Date.now(),fileId:'',image:''};
    await page.evaluate(sample=>{localStorage.setItem('lf_currentUser',JSON.stringify({id:'reader',name:'Reader Student',email:'reader@example.com'}));localStorage.setItem('lf_items',JSON.stringify([sample,{...sample,id:'reader-bag',name:'Blue backpack',category:'bags'}]))},sample);
    await go(lf+'items.html');
    await check('Search result count is announced as it changes',async()=>{await page.locator('#searchInput').focus();await page.locator('#searchInput').fill('phone');await page.locator('#itemsCount').filter({hasText:'1 report of 2'}).waitFor()},[/1 report of 2/]);
    await check('Item detail link includes the item name',()=>page.getByRole('link',{name:'View details for Silver Samsung phone',exact:true}).focus(),[/View details for Silver Samsung phone/,/link/]);
    await page.keyboard.press('Enter');await page.waitForURL(/item-details/);await delay(1500);
    await check('Response confirmation announces that nothing was sent',async()=>{await page.locator('#claimBtn').click();await page.locator('#claimText').fill('This phone has a dragon sticker and a cracked display.');await page.locator('#claimForm button[type=submit]').click()},[/Claim saved on this device/,/has not been sent to the reporter/]);
    await go(lf+'login.html');
    await check('Login validation announces the focused field and its error',()=>page.locator('#loginForm button').click(),[/Email/,/Email is required/,/invalid entry/]);
    await go(lf+'report.html?type=lost');
    await check('Item-name validation announces the field and its error',()=>page.locator('#reportForm button[type=submit]').click(),[/What did you lose/,/Item name is required/,/invalid entry/]);
    await page.locator('#itemName').fill('Silver Samsung phone');await delay(700);
    await check('Category error is announced on the first radio',async()=>{await page.locator('#reportForm button[type=submit]').click();assert.equal(await page.evaluate(()=>document.activeElement.name),'category')},[/Category/,/Electronics/,/radio button/,/Please choose a category/]);
    await page.locator('input[name=category][value=electronics]').check();await page.locator('#itemDate').fill('2999-01-01');
    await check('Future-date error is announced with the date field',()=>page.locator('#reportForm button[type=submit]').click(),[/When did you lose it/,/date cannot be in the future/]);
    await page.locator('#itemDate').fill(today);
    await check('Location hint and optional photo label are spoken',async()=>{await page.locator('#itemPlace').focus();await delay(900);await page.locator('#itemImage').focus()},[/Where did you last have it/,/Choose a suggested location or enter your own/,/Choose an optional photo/,/10 MB/]);
    await page.locator('#itemPlace').fill('Central Library');await page.locator('#itemDescription').fill('Dragon sticker and cracked display');await page.locator('#draftStatus').filter({hasText:'Text draft saved'}).waitFor();
    await page.reload();await delay(1500);
    await check('Restoring a draft announces completion and restores input focus',async()=>{await page.locator('#restoreDraft').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'itemName')},[/Draft restored/,/Select your photo again/]);
    await page.locator('#itemImage').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYp8AAAAASUVORK5CYII=','base64')});
    await check('Publishing exposes a meaningful item heading and confirmation',async()=>{await page.locator('#reportForm button[type=submit]').click();await page.waitForURL(/published=1/);await delay(1500);assert.ok((await ax()).some(n=>n.role==='heading'&&n.name==='Silver Samsung phone'))},[/Your report has been published/]);
    await check('Photo dialog announces its name and restores focus after Escape',async()=>{await page.locator('#photoZoom').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#photoDialog').evaluate(e=>e.open),true);await delay(1200);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'photoZoom')},[/Photo of Silver Samsung phone/,/Close photo/]);
    await go(event.replace('index.html','registration.html'));
    await check('Event form validation announces field, invalid state and error',()=>page.locator('#register-form button[type=submit]').click(),[/Full name/,/invalid entry/,/enter your full name/i]);
    await page.locator('#name').fill('Reader Student');await page.locator('#email').fill('reader.event@example.com');
    await check('Event confirmation focus announces saved status and local-only limitation',async()=>{await page.locator('#register-form button[type=submit]').click();await page.waitForURL(/dashboard.html/);await delay(1500);assert.equal(await page.evaluate(()=>document.activeElement.id),'confirm-title')},[/Demo registration saved/,/Organisers have not received it/]);
    await go(event);
    await check('FAQ collapsed and expanded states are spoken',async()=>{await page.locator('.faq-question').nth(1).focus();await delay(1000);await page.keyboard.press('Enter');assert.equal(await page.locator('#faq-answer-2').isVisible(),true);assert.ok((await ax()).some(n=>n.name?.includes('Yes, a laptop is recommended')))},[/Do I need to bring my own laptop/,/collapsed/,/expanded/]);
    await check('Agenda selection and removal announce their result',async()=>{await page.locator('.agenda-btn').first().focus();await page.keyboard.press('Enter');await delay(1200);assert.equal(await page.locator('.agenda-item').count(),1);await page.locator('.agenda-remove').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.agenda-item').count(),0)},[/Welcome and kickoff added to My Agenda/,/Welcome and kickoff removed from My Agenda/]);
    await page.setViewportSize({width:375,height:812});
    await check('Mobile menu states and Escape focus restoration are spoken',async()=>{await page.locator('.menu-toggle').focus();await delay(800);await page.keyboard.press('Enter');await delay(1000);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.className),'menu-toggle')},[/Menu/,/collapsed/,/expanded/]);
    await page.setViewportSize({width:1280,height:900});
    await go(event.replace('index.html','contact.html'));
    await check('Contact page announces invalid fields and their associated errors',()=>page.locator('#contact-form button[type=submit]').click(),[/Full name/,/invalid entry/,/Please enter your full name/]);
    await page.locator('#contact-name').fill('Reader Student');await page.locator('#contact-email').fill('reader.contact@example.com');await page.locator('#contact-message').fill('Is there an accessible entrance to the workshop venue?');
    await check('Contact draft confirmation announces that the enquiry was not sent',()=>page.locator('#contact-form button[type=submit]').click(),[/Enquiry draft saved on this device/,/has not been sent to organisers/]);
    await go(lf+'report.html?type=found');
    await page.locator('#itemName').fill('Blue backpack');await page.locator('input[name=category][value=bags]').check();await page.locator('#itemDate').fill(today);await page.locator('#itemPlace').fill('Cafeteria');await page.locator('#itemDescription').fill('Blue backpack with dragon sticker');
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lf_records')throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value)}});
    await check('Failed save alert announces the problem without losing fields',async()=>{await page.locator('#reportForm button[type=submit]').click();assert.equal(await page.locator('#itemName').inputValue(),'Blue backpack')},[/Could not save your reports/,/entered information is still on this page/]);
    assert.equal(errors.length,0,'No uncaught browser errors');
  }finally{
    if(page)await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({environment,results,pageErrors:errors,passed:results.filter(r=>r.result==='PASS').length,failed:results.filter(r=>r.result==='FAIL').length},null,2));
    await fs.writeFile(path.join(artifacts,'speech-transcript.txt'),speechFrom(await readLog()).join('\n')+'\n');
    // Stop only processes created for this run. Let Orca finish speech shutdown before stopping its services.
    orca.kill('SIGTERM');await delay(1500);if(browser)await browser.close();
    for(const p of processes.reverse())if(p.exitCode===null)p.kill('SIGTERM');
    await new Promise(resolve=>server.close(resolve));
    console.log('Evidence: '+artifacts+'; diagnostic session: '+temp);
  }
  if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close().catch(()=>{});for(const p of processes)if(p.exitCode===null)p.kill('SIGTERM');process.exitCode=1;setTimeout(()=>process.exit(1),2000).unref()});
