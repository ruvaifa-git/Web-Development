const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function app(project='Lost-and-Found',saved={},failWrites=false,pathname='/index.html'){
  const storage={...saved};
  if(saved.lf_currentUser&&!saved.lf_users){const u=JSON.parse(saved.lf_currentUser);storage.lf_users=JSON.stringify([{...u,id:u.id||'student-1',password:'sample-password'}])}
  const context=vm.createContext({
    console,URLSearchParams,URL,Date,Blob,setTimeout,clearTimeout,setInterval,clearInterval,
    matchMedia:()=>({matches:false}),
    window:{matchMedia:()=>({matches:false}),addEventListener(){}},
    location:{href:'',pathname,search:''},
    localStorage:{
      getItem:key=>storage[key]??null,
      setItem:(key,value)=>{if(failWrites)throw new Error('Quota exceeded');storage[key]=value},
      removeItem:key=>{if(failWrites)throw new Error('Storage blocked');delete storage[key]},
    },
    document:{documentElement:{style:{},setAttribute(){}},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null},
  });
  const files=project==='Lost-and-Found'?['script.js','auth.js','items.js']:['js/script.js'];
  files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,project,file),'utf8'),context));
  return {context,storage,run:code=>vm.runInContext(code,context)};
}
const report=(extra={})=>({id:'lost-1',type:'lost',name:'Silver Samsung phone',description:'Dragon sticker and cracked display',
  category:'electronics',place:'Central Library',contact:'demo.student@example.com',date:'2026-10-04',status:'active',createdAt:1,...extra});
function score(a,b){const loaded=app();loaded.context.a=a;loaded.context.b=b;return loaded.run('scoreMatch(a,b)')}

// Minimal form elements let us exercise the actual report callbacks without a browser dependency.
function reportForm(saved={},failWrites=false,edit=false){
  const current={id:'student-1',name:'Demo Student',email:'demo.student@example.com'};
  const loaded=app('Lost-and-Found',{lf_currentUser:JSON.stringify(current),...saved},failWrites);
  const elements={},timers=new Map(),windowEvents={},files=[];
  let timerId=0;
  class Element{
    constructor(id='',tag='div'){
      this.id=id;this.tagName=tag.toUpperCase();this.value='';this.type='';this.textContent='';this.hidden=true;
      this.attributes={};this.children=[];this.events={};this.files=[];this.validity={badInput:false};this.box=this;
    }
    addEventListener(name,callback){(this.events[name]??=[]).push(callback)}
    async emit(name,target=this){for(const callback of this.events[name]||[])await callback({target,preventDefault(){}})}
    setAttribute(name,value){this.attributes[name]=value}
    getAttribute(name){return this.attributes[name]??null}
    removeAttribute(name){delete this.attributes[name]}
    appendChild(child){this.children.push(child);child.parentElement=this}
    closest(){return this.box}
    matches(selector){return selector==='fieldset'?this.tagName==='FIELDSET':this.tagName==='INPUT'||this.tagName==='TEXTAREA'}
    focus(){elements.focused=this}
    querySelector(selector){
      if(selector.includes('field-error'))return this.children.find(el=>el.className==='field-error')||null;
      if(selector==='input')return radios[0];return null;
    }
    querySelectorAll(selector){return selector==='input'?radios:[]}
  }
  for(const id of ['reportForm','reportTitle','reportEyebrow','reportIntro','itemName','itemDate','itemPlace','itemDescription','itemContact',
    'itemImage','imagePreview','photoActions','photoField','categoryGroup','reportMessage','descCount','typeSwitch','categoryOptions',
    'draftPrompt','draftStatus','restoreDraft','discardDraft','changePhoto','removePhoto'])elements[id]=new Element(id);
  for(const id of ['itemName','itemDate','itemPlace','itemContact','itemImage'])elements[id].tagName='INPUT';
  elements.itemDescription.tagName='TEXTAREA';elements.itemImage.type='file';elements.categoryGroup.tagName='FIELDSET';
  const radios=['electronics','bags','other'].map(value=>{const el=new Element('category-'+value,'input');el.name='category';el.value=value;el.checked=false;return el});
  const submit=new Element('publish','button');submit.textContent='Publish report →';
  const form=elements.reportForm;
  form.querySelector=selector=>{
    if(selector.includes('button[type='))return submit;
    if(selector.includes(':checked'))return radios.find(r=>r.checked)||null;
    const match=selector.match(/\[value="([^"]+)"\]/);return match?radios.find(r=>r.value===match[1])||null:null;
  };
  form.querySelectorAll=selector=>selector==='[data-lost]'?[]:selector==='.field-error'?Object.values(elements).flatMap(e=>e.children.filter(c=>c.className==='field-error')):selector==='[aria-invalid]'?Object.values(elements).filter(e=>e.attributes['aria-invalid']):[];
  loaded.context.document.getElementById=id=>elements[id]||null;
  loaded.context.document.createElement=tag=>new Element('',tag);
  loaded.context.document.querySelector=()=>null;
  loaded.context.setTimeout=callback=>{timers.set(++timerId,callback);return timerId};
  loaded.context.clearTimeout=id=>timers.delete(id);
  loaded.context.window.addEventListener=(name,callback)=>{windowEvents[name]=callback};
  loaded.context.history={replaceState(){}};
  loaded.context.crypto={randomUUID:()=>`test-${++timerId}`};
  loaded.context.URL={createObjectURL:()=> 'blob:test-image',revokeObjectURL(){}};
  loaded.context.location.pathname='/report.html';loaded.context.location.search=edit?'?edit=lost-1':'?type=lost';
  loaded.context.testFiles=files;
  loaded.run('saveFile=async(id,file)=>{testFiles.push({action:"save",id})};deleteFile=async(id)=>{testFiles.push({action:"delete",id})};mediaFor=async()=>null;initReport()');
  return {...loaded,elements,radios,files,submit,
    chooseCategory(value){radios.forEach(r=>r.checked=r.value===value)},
    async input(id,value){elements[id].value=value;await form.emit('input',elements[id])},
    flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(callback=>callback())},
    async fill(){
      elements.itemName.value='Silver Samsung phone';elements.itemDate.value='2026-10-04';elements.itemPlace.value='Central Library';
      elements.itemDescription.value='Dragon sticker and cracked display';elements.itemContact.value=current.email;radios[0].checked=true;
    },
  };
}

async function pausePhotoPublication(loaded){
  loaded.elements.itemImage.files=[{name:'new.png',type:'image/png',size:100}];
  await loaded.elements.itemImage.emit('change');
  let finish;
  const pending=new Promise(resolve=>{finish=resolve});
  loaded.context.waitForPhoto=()=>pending;
  loaded.run('saveFile=async(id)=>{testFiles.push({action:"save",id});await waitForPhoto()}');
  const submitted=loaded.elements.reportForm.emit('submit');
  assert.equal(loaded.files[0].action,'save');
  return {submitted,finish};
}

test('Home stays public while round-six report pages require sign-in',()=>{
  assert.equal(app().context.location.href,'');
  const guest=app('Lost-and-Found',{},false,'/items.html');assert.match(guest.context.location.href,/login.html\?next=items.html/);
});
test('Protected actions send guests to login with a safe return destination',()=>{
  const loaded=app();loaded.context.location.pathname='/report.html';loaded.context.location.search='?type=found';
  assert.equal(loaded.run('requireUser()'),false);assert.equal(loaded.context.location.href,'login.html?next=report.html%3Ftype%3Dfound');
});
test('Login return URLs cannot point to another site',()=>{
  const loaded=app();for(const next of ['https://example.com','//example.com','../index.html','items.html?next=<script>']){
    loaded.context.next=next;assert.equal(loaded.run('safeNext(next)'),'' );
  }
});
test('A real lost/found phone pair remains a useful suggestion',()=>{
  const match=score(report(),report({id:'found-1',type:'found',date:'2026-10-05'}));assert.ok(match.score>=70);assert.ok(match.reasons.includes('Matching details'));
});
test('An iPhone and a ThinkPad at the same place/date are not suggested',()=>{
  assert.equal(score(report({name:'iPhone',description:'silver smartphone'}),report({id:'found-1',type:'found',name:'ThinkPad',description:'black laptop'})).score,0);
});
test('Shared category/location/date alone are not item identity evidence',()=>{
  assert.equal(score(report({name:'Charger',description:'power cable'}),report({id:'found-1',type:'found',name:'Camera',description:'digital photography device'})).score,0);
});
test('A report found months before the lost date is excluded',()=>{
  assert.equal(score(report(),report({id:'found-1',type:'found',date:'2026-01-04'})).score,0);
});
test('One-day reporting uncertainty is permitted; two days earlier is excluded',()=>{
  assert.ok(score(report(),report({id:'f1',type:'found',date:'2026-10-03'})).score>0);
  assert.equal(score(report(),report({id:'f2',type:'found',date:'2026-10-02'})).score,0);
});
test('Generic names without distinctive details remain tentative',()=>{
  assert.ok(score(report({name:'Black phone',description:'small black case'}),report({id:'f1',type:'found',name:'Black phone',description:'small black case'})).score<50);
});
test('Contact boilerplate cannot make unrelated items match',()=>{
  for(const description of ['Please contact me','Contact the owner for collection','Call or email to claim this item','Please message me to arrange the return']){
    assert.equal(score(report({name:'Umbrella',description,category:'other'}),
      report({id:'f1',type:'found',name:'Calculator',description,category:'other'})).score,0,description);
  }
});
test('A shared generic watch name and contact instructions stay tentative',()=>{
  const match=score(report({name:'Black watch',description:'Please contact me'}),
    report({id:'f1',type:'found',name:'Black watch',description:'Please contact me'}));
  assert.ok(match.score>0&&match.score<50);assert.ok(!match.reasons.includes('Matching details'));
});
test('Explicit conflicting item-name colours reject suggestions in either direction',()=>{
  for(const [left,right] of [['Black watch','White watch'],['Grey Samsung phone','Blue Samsung phone']]){
    const a=report({name:left,description:'Please contact me'}),b=report({id:'f1',type:'found',name:right,description:'Please contact me'});
    assert.equal(score(a,b).score,0);assert.equal(score(b,a).score,0);
  }
});
test('Colour aliases and overlapping multicolour names retain distinctive true matches',()=>{
  for(const [left,right] of [['Grey Samsung phone','Gray Samsung phone'],['Black and white Samsung phone','White Samsung phone']]){
    assert.ok(score(report({name:left}),report({id:'f1',type:'found',name:right})).score>=70);
  }
});
test('Recovered reports and two reports of the same type do not match',()=>{
  assert.equal(score(report(),report({id:'f1'})).score,0);
  assert.equal(score(report(),report({id:'f1',type:'found',status:'recovered'})).score,0);
});
test('Dates reject impossible leap days and retain real leap days',()=>{
  const loaded=app();assert.equal(loaded.run('isRealDate("2026-02-29")'),false);assert.equal(loaded.run('isRealDate("2024-02-29")'),true);
  assert.equal(loaded.run('isRealDate("2026-04-31")'),false);assert.equal(loaded.run('isRealDate("2026-10-04")'),true);
});
test('Malformed and wrong-shape storage is preserved and cannot be overwritten through report reads',()=>{
  for(const raw of ['{broken','{}','null','[null]','[{"id":1}]']){
    const loaded=app('Lost-and-Found',{lf_items:raw});assert.throws(()=>loaded.run('getItems()'),/Existing data has been kept/);
    assert.equal(loaded.storage.lf_items,raw);
  }
});
test('Legacy reports without category/status still render with safe defaults',()=>{
  const legacy=report();delete legacy.category;delete legacy.status;
  const loaded=app('Lost-and-Found',{lf_items:JSON.stringify([legacy])});
  assert.equal(loaded.run('getItems()[0].category'),'other');assert.equal(loaded.run('getItems()[0].status'),'active');
});
test('Failed writes leave existing report metadata intact and give a recoverable error',()=>{
  const raw=JSON.stringify([report()]);const loaded=app('Lost-and-Found',{lf_items:raw},true);
  assert.throws(()=>loaded.run('saveItems([])'),/entered information is still on this page/);assert.equal(loaded.storage.lf_items,raw);
});
test('Unreadable accounts are not treated as an empty user list',()=>{
  const loaded=app('Lost-and-Found',{lf_users:'{}'});assert.throws(()=>loaded.run('getUsers()'),/saved accounts/);assert.equal(loaded.storage.lf_users,'{}');
});
test('New sessions contain no password',()=>{
  const loaded=app();assert.equal(loaded.run('JSON.stringify(sessionUser({id:"1",name:"Student",email:"student@example.com",password:"sample"}))'),'{"id":"1","name":"Student","email":"student@example.com"}');
});
test('Campus status, location and date filters combine correctly',()=>{
  const loaded=app();loaded.context.reports=[report(),report({id:'2',status:'recovered'}),report({id:'3',place:'Cafeteria'}),report({id:'4',date:'2026-09-01'})];
  assert.equal(loaded.run('filterReports(reports,{status:"active",place:"library",from:"2026-10-01",to:"2026-10-05"}).map(i=>i.id).join(",")'),'lost-1');
});
test('Reset filter state includes all reports; oldest sorting and multiword searches still work',()=>{
  const loaded=app();loaded.context.reports=[report(),report({id:'2',createdAt:2}),report({id:'3',name:'Wallet',category:'wallet',createdAt:3})];
  assert.equal(loaded.run('filterReports(reports,{}).length'),3);assert.equal(loaded.run('filterReports(reports,{sort:"oldest"})[0].id'),'lost-1');
  assert.equal(loaded.run('filterReports(reports,{q:"silver library"}).length'),2);
});
test('Search highlighting cannot turn report text into HTML',()=>{
  assert.equal(app().run('highlight("<img> phone",["phone"])'),'&lt;img&gt; <mark>phone</mark>');
});
test('Unreadable Event Hub registration data is preserved instead of reset',()=>{
  const loaded=app('VOC Event Hub',{vosc_registrations:'{}'});assert.throws(()=>loaded.run('getRegistrations()'),/Existing data has been kept/);
  assert.equal(loaded.storage.vosc_registrations,'{}');
});
test('Event Hub validates email and displays no invented date',()=>{
  const loaded=app('VOC Event Hub');assert.equal(loaded.run('validateEmail("student@example.com")'),'');
  assert.notEqual(loaded.run('validateEmail("invalid")'),'');assert.equal(loaded.run('formatEventDate(new Date(""))'),'Date to be announced');
});
test('All supplied JS is valid syntax and local HTML references exist',()=>{
  for(const project of ['Lost-and-Found','VOC Event Hub']){
    const folder=path.join(root,project);
    for(const file of fs.readdirSync(folder,{recursive:true})){
      const absolute=path.join(folder,file);
      if(file.endsWith('.js'))new vm.Script(fs.readFileSync(absolute,'utf8'),{filename:absolute});
      if(!file.endsWith('.html'))continue;
      const html=fs.readFileSync(absolute,'utf8');
      for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
        const reference=match[1];if(/^(#|https?:|mailto:|data:|blob:)/.test(reference))continue;
        assert.ok(fs.existsSync(path.resolve(path.dirname(absolute),reference.split(/[?#]/)[0])),`${file}: ${reference}`);
      }
    }
  }
});
test('Every page has a skip link, main target and account autocomplete hints',()=>{
  for(const project of ['Lost-and-Found','VOC Event Hub'])for(const file of fs.readdirSync(path.join(root,project)).filter(f=>f.endsWith('.html'))){
    const html=fs.readFileSync(path.join(root,project,file),'utf8');assert.match(html,/class="skip-link" href="#main-content"/);assert.match(html,/<main id="main-content" tabindex="-1"/);
  }
  assert.match(fs.readFileSync(path.join(root,'Lost-and-Found/login.html'),'utf8'),/autocomplete="current-password"/);
  assert.match(fs.readFileSync(path.join(root,'Lost-and-Found/register.html'),'utf8'),/autocomplete="new-password"/);
});
test('The event confirmation and ticket are explicitly demo records',()=>{
  const html=['registration.html','dashboard.html'].map(file=>fs.readFileSync(path.join(root,'VOC Event Hub',file),'utf8')).join('');assert.doesNotMatch(html,/officially registered|Registration Confirmed|Reserve Your Spot|2026-11-14/);
  assert.match(html,/Organisers have not received it/);assert.match(html,/not valid for admission/);assert.match(fs.readFileSync(path.join(root,'VOC Event Hub/js/event-config.js'),'utf8'),/start: ''/);
});

test('The actual report form autosaves only text, restores it, and supports discarding the draft',async()=>{
  const first=reportForm();await first.input('itemName','Blue backpack');await first.input('itemDescription','Dragon sticker on the zip');first.flush();
  const key=Object.keys(first.storage).find(k=>k.startsWith('lf_draft_'));assert.ok(key);
  const draft=JSON.parse(first.storage[key]);assert.equal(draft.name,'Blue backpack');assert.equal(draft.description,'Dragon sticker on the zip');
  assert.equal(draft.password,undefined);assert.equal(draft.photo,undefined);
  const reopened=reportForm(first.storage);assert.equal(reopened.elements.draftPrompt.hidden,false);
  await reopened.elements.restoreDraft.emit('click');assert.equal(reopened.elements.itemName.value,'Blue backpack');
  assert.equal(reopened.elements.itemDescription.value,'Dragon sticker on the zip');assert.equal(reopened.elements.focused.id,'itemName');
  const discard=reportForm(first.storage);await discard.elements.discardDraft.emit('click');assert.equal(discard.storage[key],undefined);
});
test('The actual report form connects category errors to its focused radio',async()=>{
  const loaded=reportForm();loaded.elements.itemName.value='Phone';await loaded.elements.reportForm.emit('submit');
  assert.equal(loaded.elements.focused.name,'category');assert.equal(loaded.elements.focused.getAttribute('aria-describedby'),'categoryGroup-error');
});
test('The actual report form rejects future dates without publishing',async()=>{
  const loaded=reportForm();await loaded.fill();loaded.elements.itemDate.value='2999-01-01';await loaded.elements.reportForm.emit('submit');
  assert.match(loaded.elements.reportMessage.textContent,/future/);assert.equal(loaded.storage.lf_items,undefined);
});
test('Publishing through the actual form clears the text draft after saving',async()=>{
  const loaded=reportForm();await loaded.fill();await loaded.input('itemName','Silver Samsung phone');loaded.flush();
  await loaded.elements.reportForm.emit('submit');assert.equal(JSON.parse(loaded.storage.lf_records).items[0].name,'Silver Samsung phone');
  assert.equal(Object.keys(loaded.storage).some(k=>k.startsWith('lf_draft_')),false);assert.match(loaded.context.location.href,/published=1/);
});
test('A failed report save keeps fields and original data',async()=>{
  const raw=JSON.stringify([report()]);const loaded=reportForm({lf_items:raw},true);await loaded.fill();
  await loaded.elements.reportForm.emit('submit');assert.equal(loaded.storage.lf_items,raw);
  assert.equal(loaded.elements.itemName.value,'Silver Samsung phone');assert.match(loaded.elements.reportMessage.textContent,/Could not save/);
  assert.equal(loaded.submit.disabled,false);assert.equal(loaded.context.location.href,'');
});
test('Removing a photo during an edit does not delete it if metadata saving fails',async()=>{
  const raw=JSON.stringify([report({fileId:'old-photo',reportedBy:'demo.student@example.com'})]);
  const loaded=reportForm({lf_items:raw},true,true);await loaded.elements.removePhoto.emit('click');await loaded.elements.reportForm.emit('submit');
  assert.equal(loaded.storage.lf_items,raw);assert.equal(loaded.files.length,0);assert.match(loaded.elements.reportMessage.textContent,/Could not save/);
});
test('Replacing a photo rolls back only the new file after a metadata failure',async()=>{
  const raw=JSON.stringify([report({fileId:'old-photo',reportedBy:'demo.student@example.com'})]);
  const loaded=reportForm({lf_items:raw},true,true);loaded.elements.itemImage.files=[{name:'new.png',type:'image/png',size:100}];
  await loaded.elements.itemImage.emit('change');await loaded.elements.reportForm.emit('submit');
  assert.equal(loaded.files.length,2);assert.equal(loaded.files[0].action,'save');assert.equal(loaded.files[1].action,'delete');
  assert.equal(loaded.files[0].id,loaded.files[1].id);assert.notEqual(loaded.files[1].id,'old-photo');assert.equal(loaded.storage.lf_items,raw);
});
test('Photo publication preserves reports saved by another tab while the photo is pending',async()=>{
  const loaded=reportForm();await loaded.fill();const upload=await pausePhotoPublication(loaded);
  const other=report({id:'other-tab-report',reportedBy:'other@example.com',reporterName:'Other Student'});
  loaded.storage.lf_items=JSON.stringify([other]);upload.finish();await upload.submitted;
  const items=JSON.parse(loaded.storage.lf_records).items;
  assert.equal(items.length,2);assert.deepEqual(items.find(i=>i.id===other.id),other);
  assert.equal(items[0].fileId,loaded.files[0].id);assert.match(loaded.context.location.href,/published=1/);
});
test('Photo editing merges unrelated tab reports and cleans up the old photo only after commit',async()=>{
  const original=report({fileId:'old-photo',reportedBy:'demo.student@example.com'});
  const loaded=reportForm({lf_items:JSON.stringify([original])},false,true);
  const upload=await pausePhotoPublication(loaded),other=report({id:'other-tab-report',reportedBy:'other@example.com',reporterName:'Other Student'});
  loaded.storage.lf_items=JSON.stringify([other,original]);
  loaded.context.checkCleanup=id=>{
    const saved=JSON.parse(loaded.storage.lf_records).items;assert.ok(saved.some(i=>i.id===other.id));
    assert.equal(saved.find(i=>i.id===original.id).fileId,loaded.files[0].id);loaded.files.push({action:'delete',id});
  };
  loaded.run('deleteFile=checkCleanup');upload.finish();await upload.submitted;
  assert.deepEqual(JSON.parse(loaded.storage.lf_records).items.find(i=>i.id===other.id),other);
  assert.equal(loaded.files[1].id,'old-photo');assert.match(loaded.context.location.href,/updated=1/);
});
test('A sign-out or account switch during photo storage cancels publication and rolls back only the new file',async()=>{
  for(const session of [null,{id:'other',name:'Other Student',email:'other@example.com'}]){
    const loaded=reportForm();await loaded.fill();const upload=await pausePhotoPublication(loaded);
    loaded.storage.lf_currentUser=JSON.stringify(session);upload.finish();await upload.submitted;
    assert.equal(loaded.storage.lf_items,undefined);assert.equal(loaded.context.location.href,'');
    assert.match(loaded.elements.reportMessage.textContent,/sign-in changed/);assert.equal(loaded.submit.disabled,false);
    assert.equal(loaded.files[1].id,loaded.files[0].id);assert.equal(loaded.elements.itemName.value,'Silver Samsung phone');
  }
});
test('An edit changed or deleted in another tab is preserved while the pending new photo is rolled back',async()=>{
  for(const change of ['recovered','other-owner','deleted']){
    const original=report({fileId:'old-photo',reportedBy:'demo.student@example.com'});
    const loaded=reportForm({lf_items:JSON.stringify([original])},false,true);const upload=await pausePhotoPublication(loaded);
    const latest=change==='deleted'?[]:[{...original,...(change==='recovered'?{status:'recovered'}:{reportedBy:'other@example.com'})}];
    const raw=JSON.stringify(latest);loaded.storage.lf_items=raw;upload.finish();await upload.submitted;
    assert.equal(loaded.storage.lf_items,raw);assert.equal(loaded.context.location.href,'');
    assert.match(loaded.elements.reportMessage.textContent,/changed|no longer available/);
    assert.equal(loaded.files.length,2);assert.equal(loaded.files[1].id,loaded.files[0].id);assert.notEqual(loaded.files[1].id,'old-photo');
  }
});
test('Unreadable metadata introduced during a photo upload is not overwritten',async()=>{
  const loaded=reportForm();await loaded.fill();const upload=await pausePhotoPublication(loaded);
  loaded.storage.lf_items='{}';upload.finish();await upload.submitted;
  assert.equal(loaded.storage.lf_items,'{}');assert.equal(loaded.context.location.href,'');
  assert.match(loaded.elements.reportMessage.textContent,/Existing data has been kept/);
  assert.equal(loaded.files[1].id,loaded.files[0].id);
});

const owner={id:'student-1',name:'Demo Student',email:'demo.student@example.com'};
function recoveryApp(failWrites=false,extra={}){
  const items=[report({reportedBy:owner.email,reporterName:owner.name}),report({id:'found-1',type:'found',reportedBy:'finder@example.com',reporterName:'Finder'})];
  const claims=[{id:'claim-1',itemId:'lost-1',userEmail:'finder@example.com',userName:'Finder',relatedId:'found-1',message:'Dragon sticker and cracked display',status:'pending',date:1}];
  return app('Lost-and-Found',{lf_currentUser:JSON.stringify(owner),lf_items:JSON.stringify(items),lf_claims:JSON.stringify(claims),...extra},failWrites);
}
test('Recovery atomically resolves both reports and every affected claim',()=>{
  const loaded=recoveryApp();const claims=JSON.parse(loaded.storage.lf_claims);
  claims.push({...claims[0],id:'second-claim',itemId:'found-1',relatedId:'',userEmail:owner.email});
  claims.push({...claims[0],id:'unrelated',itemId:'another-report'});loaded.storage.lf_claims=JSON.stringify(claims);
  const writes=[],set=loaded.context.localStorage.setItem;loaded.context.localStorage.setItem=(k,v)=>{writes.push(k);set(k,v)};
  loaded.run('recoverReport("lost-1","claim-1")');const saved=JSON.parse(loaded.storage.lf_records);
  assert.deepEqual(saved.items.map(i=>i.status),['recovered','recovered']);assert.equal(saved.items[0].matchedWith,'found-1');assert.equal(saved.items[1].matchedWith,'lost-1');
  assert.deepEqual(saved.claims.map(c=>c.status),['resolved','resolved','pending']);assert.deepEqual(writes,['lf_records']);
});
test('A recovery write failure leaves reports and claims unchanged together',()=>{
  const loaded=recoveryApp(true),before={...loaded.storage};assert.throws(()=>loaded.run('recoverReport("lost-1","claim-1")'),/Could not save/);
  assert.deepEqual(loaded.storage,before);assert.equal(loaded.run('getItems()[0].status'),'active');assert.equal(loaded.run('getClaims()[0].status'),'pending');
});
test('Recovery failure also preserves an already-migrated authoritative snapshot',()=>{
  const loaded=recoveryApp();loaded.run('lfSaveRecords(lfReadRecords())');const before=loaded.storage.lf_records;
  loaded.context.localStorage.setItem=()=>{throw new Error('Quota exceeded')};assert.throws(()=>loaded.run('recoverReport("lost-1","claim-1")'),/Could not save/);assert.equal(loaded.storage.lf_records,before);
});
test('Legacy migration retains reports, old claims and original raw backups',()=>{
  const oldClaim=JSON.stringify([{itemId:'lost-1',userEmail:'finder@example.com',date:1}]);const loaded=recoveryApp(false,{lf_claims:oldClaim});const raw=loaded.storage.lf_items;
  loaded.run('saveItems(getItems())');assert.equal(loaded.storage.lf_items,raw);assert.equal(loaded.storage.lf_claims,oldClaim);
  const saved=JSON.parse(loaded.storage.lf_records);assert.equal(saved.items.length,2);assert.equal(saved.claims.length,1);assert.equal(saved.claims[0].status,'pending');assert.ok(saved.claims[0].id);
});
test('Corrupt authoritative data blocks writes and never falls back to migration backups',()=>{
  const loaded=recoveryApp(false,{lf_records:'{"incomplete":'});assert.throws(()=>loaded.run('getItems()'),/Existing data has been kept/);assert.throws(()=>loaded.run('saveItems([])'),/Existing data has been kept/);assert.equal(loaded.storage.lf_records,'{"incomplete":');
});
test('Unreadable legacy claims cannot be silently overwritten while saving a report',()=>{
  const loaded=recoveryApp(false,{lf_claims:'{}'});const raw=loaded.storage.lf_items;assert.throws(()=>loaded.run('saveItems([])'),/Existing data has been kept/);assert.equal(loaded.storage.lf_items,raw);assert.equal(loaded.storage.lf_claims,'{}');assert.equal(loaded.storage.lf_records,undefined);
});
test('Only the report owner can confirm recovery and resolved claims cannot be reopened',()=>{
  const loaded=recoveryApp();loaded.storage.lf_currentUser=JSON.stringify({id:'stranger',name:'Stranger',email:'stranger@example.com'});
  assert.throws(()=>loaded.run('recoverReport("lost-1","claim-1")'),/no longer available/);assert.equal(loaded.storage.lf_records,undefined);
  loaded.storage.lf_currentUser=JSON.stringify(owner);const claims=JSON.parse(loaded.storage.lf_claims);claims[0].status='resolved';loaded.storage.lf_claims=JSON.stringify(claims);assert.throws(()=>loaded.run('recoverReport("lost-1","claim-1")'),/claim changed/);
});
test('An unrelated linked report stays unchanged during single-report recovery',()=>{
  const loaded=recoveryApp();const items=JSON.parse(loaded.storage.lf_items);items[1].reportedBy='someone-else@example.com';loaded.storage.lf_items=JSON.stringify(items);
  loaded.run('recoverReport("lost-1","claim-1")');const saved=JSON.parse(loaded.storage.lf_records);assert.equal(saved.items[0].status,'recovered');assert.equal(saved.items[1].status,'active');assert.equal(saved.items[0].matchedWith,undefined);
});
test('Editing a recovered report retains its paired recovery metadata',async()=>{
  const original=report({reportedBy:owner.email,status:'recovered',matchedWith:'found-1',recoveredAt:42});const loaded=reportForm({lf_items:JSON.stringify([original])},false,true);await loaded.fill();await loaded.elements.reportForm.emit('submit');
  const item=JSON.parse(loaded.storage.lf_records).items[0];assert.equal(item.matchedWith,'found-1');assert.equal(item.recoveredAt,42);assert.equal(item.status,'recovered');
});
test('Calendar generation safely rejects unconfirmed, impossible or reversed event dates',()=>{
  const loaded=app('VOC Event Hub');assert.equal(loaded.run('googleCalendarUrl("demo")'),'');assert.equal(loaded.run('downloadIcs("demo")'),false);
  assert.equal(loaded.run('Number.isNaN(parseEventDate("2026-02-30T09:00:00+05:30").getTime())'),true);
  loaded.run('eventInfo.start=parseEventDate("2026-11-14T09:00:00+05:30");eventInfo.end=parseEventDate("2026-11-14T17:00:00+05:30");eventInfo.timeZone="Asia/Kolkata"');assert.match(loaded.run('googleCalendarUrl("demo")'),/20261114T033000Z%2F20261114T113000Z/);
  loaded.run('eventInfo.end=parseEventDate("2026-11-13T17:00:00+05:30")');assert.equal(loaded.run('googleCalendarUrl("demo")'),'');
});
test('Malformed agenda data is preserved and reported instead of becoming an empty list',()=>{
  const loaded=app('VOC Event Hub',{vosc_agenda:'{}'});assert.throws(()=>loaded.run('loadAgenda()'),/Existing data has been kept/);assert.equal(loaded.storage.vosc_agenda,'{}');
});

test('Contact links accept only HTTPS Google Form responder links',()=>{
  const loaded=app('VOC Event Hub');
  for(const url of ['https://forms.gle/Example123','https://docs.google.com/forms/d/e/example/viewform?usp=sharing','https://docs.google.com/forms/u/0/d/example/viewform']){
    loaded.context.url=url;assert.equal(loaded.run('googleFormUrl(url)'),url);
  }
  for(const url of ['', 'javascript:alert(1)','http://forms.gle/Example123','https://forms.gle.evil.example/test','https://docs.google.com/forms/d/example/edit','https://name:secret@forms.gle/Example123','https://example.com/contact']){
    loaded.context.url=url;assert.equal(loaded.run('googleFormUrl(url)'),'');
  }
});
