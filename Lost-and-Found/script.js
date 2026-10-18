// Shared behaviour for every Lost & Found page: theme, header/session, categories and form helpers.
// Loaded in <head> before auth.js/items.js so the saved theme applies before the page paints.

/* ---------- Theme (light / dark), remembered in localStorage ---------- */
(function applySavedTheme(){
  let theme=null;
  try{theme=localStorage.getItem("lf_theme")}catch(e){theme=null}
  if(theme!=="dark"&&theme!=="light")theme=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  document.documentElement.setAttribute("data-theme",theme);
})();

// Suggested campus places; students can still type any location.
const LF_PLACES=["Central Library","CSE Block","Cafeteria","Auditorium","Sports Ground","Main Gate","Hostel","Parking"];

/* ---------- Read safely; never replace unreadable saved data with an empty list ---------- */
const LF_STORAGE_NAMES={lf_items:"reports",lf_users:"accounts",lf_claims:"responses",lf_currentUser:"sign-in session",lf_records:"reports and claims"};
function lfRead(key,fallback,valid){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    const value=JSON.parse(raw);
    if(!valid(value))throw new Error("Unexpected data format");
    return value;
  }catch(error){
    throw new Error(`Could not read your saved ${LF_STORAGE_NAMES[key]||"draft"}. Existing data has been kept. Check this browser's storage before trying again.`);
  }
}
function lfReadArray(key,valid){return lfRead(key,[],list=>Array.isArray(list)&&list.every(valid))}
function lfWrite(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}
  catch(error){throw new Error(`Could not save your ${LF_STORAGE_NAMES[key]||"draft"}. Browser storage may be full or disabled. Your entered information is still on this page; keep it open and try again.`)}
}
function lfRemove(key){
  try{localStorage.removeItem(key)}
  catch(error){throw new Error("Could not update browser storage. Keep this page open and try again.")}
}
function lfReportValid(i){
  return i&&typeof i.id==="string"&&!!i.id&&["lost","found"].includes(i.type)&&typeof i.name==="string"&&
    ["description","date","place","contact","reportedBy","reporterName","fileId","image"].every(k=>i[k]===undefined||typeof i[k]==="string")&&
    (i.status===undefined||["active","recovered"].includes(i.status))&&
    (i.createdAt===undefined||(typeof i.createdAt==="number"&&Number.isFinite(i.createdAt)));
}
function lfCurrentUser(){
  try{
    const u=lfRead("lf_currentUser",null,u=>u===null||(u&&typeof u.name==="string"&&typeof u.email==="string"&&!!u.email));
    return u&&lfReadArray("lf_users",lfUserValid).some(x=>x.email===u.email)?u:null;
  }catch(error){lfSessionError=error;lfShowStorageError(error);return null}
}
const LF_RECORDS_KEY="lf_records";
function lfUserValid(u){return u&&["id","name","email","password"].every(k=>typeof u[k]==="string")&&!!u.email}
function lfClaimValid(c){
  return c&&typeof c.itemId==="string"&&!!c.itemId&&typeof c.userEmail==="string"&&!!c.userEmail&&
    (c.date===undefined||(typeof c.date==="number"&&Number.isFinite(c.date)))&&
    (c.status===undefined||["pending","reviewed","resolved"].includes(c.status))&&
    ["id","userName","message","relatedId"].every(k=>c[k]===undefined||typeof c[k]==="string");
}
function lfRecordsValid(r){return r&&r.version===1&&Array.isArray(r.items)&&r.items.every(lfReportValid)&&Array.isArray(r.claims)&&r.claims.every(lfClaimValid)}
function lfReadRecords(){
  const saved=lfRead(LF_RECORDS_KEY,null,lfRecordsValid);
  // Legacy arrays remain intact as migration backups; malformed data never becomes an empty list.
  const r=saved||{version:1,items:lfReadArray("lf_items",lfReportValid),claims:lfReadArray("lf_claims",lfClaimValid)};
  return {version:1,items:r.items.map(i=>({...i,description:i.description||"",place:i.place||"",date:i.date||"",contact:i.contact||"",reportedBy:i.reportedBy||"",reporterName:i.reporterName||"",status:i.status||"active",category:lfCategory(i.category).id})),
    claims:r.claims.map((c,n)=>({...c,id:c.id||`claim_${c.date||0}_${n}`,userName:c.userName||c.userEmail,message:c.message||"",relatedId:c.relatedId||"",status:c.status||"pending",date:c.date||0,updatedAt:c.updatedAt||0}))};
}
function lfSaveRecords(records){
  if(!lfRecordsValid(records))throw new Error("Could not save invalid reports or claims. Existing data has been kept.");
  // ponytail: one synchronous write keeps reports/claims together; simultaneous tab edits still need conflict checks.
  lfWrite(LF_RECORDS_KEY,records);
}
function lfReadReports(){return lfReadRecords().items}
function lfShowStorageError(error){
  const main=document.querySelector("main");if(!main)return;
  let box=document.getElementById("storageMessage");
  if(!box){
    box=document.createElement("div");box.id="storageMessage";box.className="storage-message";box.setAttribute("role","alert");
    const text=document.createElement("p");text.className="storage-text";box.appendChild(text);
    const backup=document.createElement("button");backup.type="button";backup.className="btn btn-secondary btn-sm";backup.textContent="Download report and claim metadata backup";
    backup.addEventListener("click",()=>{
      try{
        const raw={};for(const key of [LF_RECORDS_KEY,"lf_items","lf_claims"])raw[key]=localStorage.getItem(key);
        const url=URL.createObjectURL(new Blob([JSON.stringify(raw,null,2)],{type:"application/json"}));
        const a=document.createElement("a");a.href=url;a.download="lost-found-metadata-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(e){box.querySelector(".storage-text").textContent="Browser storage is unavailable. Keep this page open and check browser settings."}
    });box.appendChild(backup);main.prepend(box);
  }box.querySelector(".storage-text").textContent=error.message;
}

let lfSessionError=null;

/* ---------- Session check ----------
   A saved sign-in must belong to an account that still exists in this browser; otherwise log out.
   (Runs before the page's other scripts, so every page sees the cleaned-up state.) */
(function dropStaleSession(){
  try{
    const u=lfRead("lf_currentUser",null,u=>u===null||(u&&typeof u.name==="string"&&typeof u.email==="string"));if(!u)return;
    const users=lfReadArray("lf_users",lfUserValid);
    if(!users.some(x=>x.email===u.email))lfRemove("lf_currentUser");
    else if(u.password)lfWrite("lf_currentUser",{id:u.id,name:u.name,email:u.email});
  }catch(error){lfSessionError=error}
})();

/* ---------- Categories (single source for the form, browse filter, cards and matching) ---------- */
const LF_CATEGORIES=[
  {id:"electronics",icon:"📱",label:"Electronics"},
  {id:"keys",icon:"🔑",label:"Keys"},
  {id:"id-cards",icon:"💳",label:"ID / Cards"},
  {id:"bags",icon:"🎒",label:"Bags"},
  {id:"wallet",icon:"👛",label:"Wallet / Purse"},
  {id:"books",icon:"📚",label:"Books / Stationery"},
  {id:"clothing",icon:"👕",label:"Clothing"},
  {id:"bottles",icon:"🧴",label:"Bottles / Personal items"},
  {id:"other",icon:"📦",label:"Other"}
];
function lfCategory(id){return LF_CATEGORIES.find(c=>c.id===id)||LF_CATEGORIES[LF_CATEGORIES.length-1]}

/* ---------- Small shared helpers ---------- */
function lfEscape(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
// Newest first by the time the report was created (older data without createdAt keeps its stored order).
function lfNewestFirst(list){return list.map((item,index)=>({item,index})).sort((a,b)=>((b.item.createdAt||0)-(a.item.createdAt||0))||(a.index-b.index)).map(x=>x.item)}

// Only allow redirects back to known pages of this app (prevents open redirects via ?next=).
function safeNext(value){
  return typeof value==="string"&&/^(dashboard|items|item-details|my-reports|report|recovered|claims)\.html(\?[\w=&%.\-]*)?$/.test(value)?value:"";
}
function goToLogin(next){
  const n=safeNext(next===undefined?location.pathname.split("/").pop()+location.search:next);
  location.href="login.html"+(n?"?next="+encodeURIComponent(n):"");
}

function lfBrowseUrl(){
  try{
    const saved=sessionStorage.getItem("lf_browse_url")||"";
    return /^items\.html(?:\?[\w=&%.+\-]*)?$/.test(saved)?saved:"items.html";
  }catch(error){return "items.html"}
}

/* ---------- Pages that need an account ----------
   Every page that shows reports requires login. Guests are sent to the login page (with a short notice)
   before anything is drawn, and return to the page they wanted after logging in. */
const LF_MEMBER_PAGES=["dashboard.html","report.html","my-reports.html","items.html","item-details.html","recovered.html","claims.html"];
function lfSignedIn(){return !!lfCurrentUser()}
(function guardMemberPages(){
  const page=location.pathname.split("/").pop()||"index.html";
  if(LF_MEMBER_PAGES.includes(page)&&!lfSignedIn()){
    document.documentElement.style.visibility="hidden"; // avoid a flash of the page before redirecting
    goToLogin();
  }
})();

/* ---------- Field-level validation messages (shown directly under the field) ---------- */
function lfFieldError(control,message,host){
  const box=host||control.closest("label,fieldset")||control.parentElement;
  let el=box.querySelector(":scope > .field-error");
  if(!el){
    el=document.createElement("small");
    el.className="field-error";
    el.id=(control.id||"field")+"-error";
    box.appendChild(el);
  }
  el.textContent=message;
  control.setAttribute("aria-invalid","true");
  const ids=(control.getAttribute("aria-describedby")||"").split(/\s+/).filter(Boolean);
  if(!ids.includes(el.id)){ids.push(el.id);control.setAttribute("aria-describedby",ids.join(" "))}
  if(control.matches("fieldset"))control.querySelectorAll("input").forEach(input=>{
    input.setAttribute("aria-invalid","true");input.setAttribute("aria-describedby",el.id);
  });
}
function lfClearFieldError(control,host){
  const box=host||control.closest("label,fieldset")||control.parentElement;
  const el=box&&box.querySelector(":scope > .field-error");
  if(el)el.textContent="";
  control.removeAttribute("aria-invalid");
  if(control.matches("fieldset"))control.querySelectorAll("input").forEach(input=>input.removeAttribute("aria-invalid"));
}
function lfClearFieldErrors(form){
  form.querySelectorAll(".field-error").forEach(el=>{el.textContent=""});
  form.querySelectorAll("[aria-invalid]").forEach(el=>el.removeAttribute("aria-invalid"));
}
const LF_EMAIL_RE=/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/* ---------- Theme toggle button (added to every page header) ---------- */
const LF_ICONS={
  moon:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 14.6A8.6 8.6 0 0 1 9.4 3a.8.8 0 0 0-1-.9A10 10 0 1 0 21.9 15.6a.8.8 0 0 0-.9-1z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g></svg>'
};
function lfAddThemeToggle(){
  const nav=document.querySelector(".site-header nav");
  if(!nav||nav.querySelector(".theme-toggle"))return;
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="theme-toggle";
  const sync=()=>{
    const dark=document.documentElement.getAttribute("data-theme")==="dark";
    btn.innerHTML=dark?LF_ICONS.sun:LF_ICONS.moon;
    btn.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
    btn.title=dark?"Light mode":"Dark mode";
  };
  btn.addEventListener("click",()=>{
    const root=document.documentElement;
    const next=root.getAttribute("data-theme")==="dark"?"light":"dark";
    root.classList.add("theme-anim");
    root.setAttribute("data-theme",next);
    try{localStorage.setItem("lf_theme",next)}catch(e){}
    sync();
    setTimeout(()=>root.classList.remove("theme-anim"),350);
  });
  sync();
  nav.appendChild(btn);
}

function lfUpdateClaimsBadge(){
  const u=lfCurrentUser();if(!u)return;
  try{
    const {items,claims}=lfReadRecords(),mine=new Set(items.filter(i=>i.reportedBy===u.email).map(i=>i.id));
    const pending=claims.filter(c=>mine.has(c.itemId)&&c.status==="pending").length;
    document.querySelectorAll("[data-claims-badge]").forEach(b=>{b.textContent=pending;b.hidden=!pending;b.setAttribute("aria-label",`${pending} pending`)});
  }catch(error){lfShowStorageError(error)}
}

document.addEventListener("DOMContentLoaded",()=>{
  const u=lfCurrentUser();
  if(lfSessionError)lfShowStorageError(lfSessionError);

  lfAddThemeToggle();

  // Header: logged-in users see Dashboard/My reports/Log out, guests see Log in/Get started.
  document.querySelectorAll(".nav-member").forEach(el=>{el.hidden=!u});
  document.querySelectorAll(".nav-guest").forEach(el=>{el.hidden=!!u});
  if(!u)document.querySelectorAll('a.brand[href="dashboard.html"]').forEach(a=>a.setAttribute("href","index.html"));
  lfUpdateClaimsBadge();
  window.addEventListener("storage",e=>{if([LF_RECORDS_KEY,"lf_items","lf_claims"].includes(e.key))lfUpdateClaimsBadge()});
  const logout=document.getElementById("logoutBtn");
  if(logout)logout.addEventListener("click",()=>{try{lfRemove("lf_currentUser");location.href="index.html"}catch(error){lfShowStorageError(error)}});
  const places=document.getElementById("campusPlaces");if(places)places.innerHTML=LF_PLACES.map(place=>`<option value="${lfEscape(place)}"></option>`).join("");
  document.querySelectorAll('.back-link[href="items.html"],nav a[href="items.html"]').forEach(a=>a.href=lfBrowseUrl());

  // Reporting needs an account: send guests to log in, then back to the report form.
  document.querySelectorAll("a[href]").forEach(a=>{
    const target=(a.getAttribute("href")||"").split("#")[0];
    if(LF_MEMBER_PAGES.includes(target.split("?")[0]))a.addEventListener("click",e=>{if(!u){e.preventDefault();goToLogin(target)}});
  });

  // Home page: the newest reports saved in this browser (public, so useful for logged-out visitors too).
  const recent=document.getElementById("homeRecent");
  if(recent&&!u){
    recent.innerHTML='<p class="mini-empty mini-locked"><span aria-hidden="true">🔒</span> <span><a href="login.html">Log in</a> or <a href="register.html">create a free account</a> to see the latest lost and found reports.</span></p>';
  }else if(recent){
    let items=[];
    try{items=lfReadReports()}catch(error){lfShowStorageError(error);recent.textContent="Saved reports could not be loaded.";return}
    items=items.filter(i=>i.status!=="recovered"); // matched/recovered reports leave the open list
    recent.innerHTML=items.length?lfNewestFirst(items).slice(0,3).map(i=>{
      const found=i.type==="found",cat=lfCategory(i.category);
      return `<a class="mini-item" href="item-details.html?id=${encodeURIComponent(i.id)}"><div class="mini-photo" aria-hidden="true">${cat.icon}</div><div><strong>${lfEscape(i.name)}</strong><small>${lfEscape(cat.label)} · ${lfEscape(i.place)}</small></div><span class="pill ${found?"found":"lost"}">${found?"FOUND":"LOST"}</span></a>`;
    }).join(""):'<p class="mini-empty">No open reports right now. Lost something? Report it.</p>';
  }
});
