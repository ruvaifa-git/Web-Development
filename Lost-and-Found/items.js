// Lost & Found reports: storage, cards, browse, report form, details, possible matches, my reports, dashboard.
// Depends on helpers from script.js (LF_CATEGORIES, lfCategory, lfEscape, lfNewestFirst, lfFieldError…).
const ITEMS_KEY = "lf_items";
const FILE_DB = "lf_file_store";
const FILE_STORE = "files";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LIMITS = { name: 80, place: 80, description: 1000, contact: 254 };
const MIN_DATE = "2000-01-01";

// Reports and claims share one authoritative local record after their first successful save.
const getItems = () => lfReadRecords().items;
const saveItems = items => { const records=lfReadRecords();lfSaveRecords({...records,items}); };
const user = () => lfCurrentUser();
const esc = lfEscape;
const fmt = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00")) ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const formatBytes = n => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const typeOf = i => i.type === "found" ? "found" : "lost";
// The user's local calendar date as YYYY-MM-DD (not UTC), so "today" is correct in every time zone.
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const isRealDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

function requireUser(){
  if(!user()){ goToLogin(); return false; }
  return true;
}

// type: "error" (default), "success" or "info" — styled differently in style.css
function setMessage(el, text, type = "error"){
  if(!el) return;
  el.className = `form-message ${type}`;
  if(type==="error"){
    el.setAttribute("role","alert");el.removeAttribute("aria-live");
  }else{
    // Explicit live regions also announce in readers that treat status bars as UI updates.
    el.removeAttribute("role");el.setAttribute("aria-live","polite");
  }
  el.setAttribute("aria-atomic","true");
  el.textContent = text;
}

/* ---------- File storage (IndexedDB) ---------- */
function openFileDB(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB) return reject(new Error("IndexedDB is not supported in this browser."));
    const request = indexedDB.open(FILE_DB, 1);
    request.onupgradeneeded = () => {
      if(!request.result.objectStoreNames.contains(FILE_STORE)) request.result.createObjectStore(FILE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open file storage."));
  });
}

async function saveFile(id, file){
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put({ blob: file, name: file.name, type: file.type, size: file.size }, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save file.")); };
  });
}

async function getFile(id){
  if(!id) return null;
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readonly");
    const req = tx.objectStore(FILE_STORE).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error || new Error("Could not read file.")); };
  });
}

async function deleteFile(id){
  if(!id) return;
  try{
    const db = await openFileDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }catch(e){ console.warn("File cleanup failed", e); }
}

/* ---------- Media + object URL bookkeeping ---------- */
// Each render collects its object URLs in a "bag"; when an element is re-rendered the previous bag is revoked.
async function mediaFor(i, bag){
  let file = null;
  try{ file = i.fileId ? await getFile(i.fileId) : null; }catch(e){ file = null; }
  if(file){
    const url = URL.createObjectURL(file.blob);
    bag.push(url);
    return (file.type || "").startsWith("image/") ? { kind: "image", url } : { kind: "file", url, name: file.name, size: file.size };
  }
  if(i.image) return { kind: "image", url: i.image };
  return null;
}
function commit(el, html, bag){
  (el._objectUrls || []).forEach(u => URL.revokeObjectURL(u));
  el._objectUrls = bag;
  el.innerHTML = html;
}

/* ---------- Matching a lost report with a found report ---------- */
const isRecovered = i => i.status === "recovered";
function linkedItem(i, all = getItems()){ return i.matchedWith ? all.find(x => x.id === i.matchedWith) || null : null; }
// Recovery and every affected claim commit together in one localStorage write.
function recoverReport(itemId,claimId=""){
  const records=lfReadRecords(),me=user(),item=records.items.find(i=>i.id===itemId);
  if(!me||!item||item.reportedBy!==me.email)throw new Error("This report is no longer available for you to update.");
  if(isRecovered(item))throw new Error("This report is already recovered. Reload to review the latest status.");
  const claim=claimId?records.claims.find(c=>c.id===claimId&&c.itemId===itemId):null;
  if(claimId&&(!claim||claim.status==="resolved"))throw new Error("This claim changed or is no longer available. Reload before trying again.");
  const linked=claim?.relatedId?records.items.find(i=>i.id===claim.relatedId):null;
  const related=linked&&typeOf(linked)!==typeOf(item)&&linked.reportedBy===claim.userEmail&&!isRecovered(linked)?linked:null;
  const now=Date.now(),ids=[item.id];
  Object.assign(item,{status:"recovered",recoveredAt:now});
  if(related){Object.assign(related,{status:"recovered",recoveredAt:now,matchedWith:item.id});item.matchedWith=related.id;ids.push(related.id)}
  else delete item.matchedWith;
  records.claims.forEach(c=>{if(ids.includes(c.itemId)){c.status="resolved";c.updatedAt=now}});
  lfSaveRecords(records);
  return {item,related};
}
function takeFlash(){ let t = ""; try{ t = sessionStorage.getItem("lf_flash") || ""; sessionStorage.removeItem("lf_flash"); }catch(e){} return t; }

/* ---------- Claims & responses (lf_records; legacy lf_claims migrates on save) ----------
   Older records looked like {itemId, userEmail, date}. They are read safely and get the new fields
   (id, userName, message, relatedId, status) the next time the list is saved. */
const CLAIMS_KEY = "lf_claims";
const getClaims=()=>lfReadRecords().claims;
const claimStatusBadge = st => ({
  pending: '<span class="claim-badge pending"><span aria-hidden="true">⏳</span> Pending</span>',
  reviewed: '<span class="claim-badge reviewed"><span aria-hidden="true">👁</span> Reviewed</span>',
  resolved: '<span class="claim-badge resolved"><span aria-hidden="true">✓</span> Resolved</span>'
}[st] || "");
const fmtDateTime = ms => ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Date not recorded";
/* ---------- Small markup helpers ---------- */
const typePill = i => `<span class="pill ${typeOf(i)}">${typeOf(i) === "found" ? "FOUND" : "LOST"}</span>`;
const categoryChip = i => { const c = lfCategory(i.category); return `<span class="cat-chip"><span aria-hidden="true">${c.icon}</span>${esc(c.label)}</span>`; };
function statusBadge(i){
  if(i.status === "recovered") return `<span class="status-badge recovered">✓ Recovered</span>`;
  return `<span class="status-badge active">${typeOf(i) === "found" ? "Awaiting owner" : "Still missing"}</span>`;
}
// Escape text first, then wrap search matches in <mark> (user text can never become HTML).
function highlight(text, terms){
  const t = String(text ?? "");
  if(!terms || !terms.length) return esc(t);
  const re = new RegExp("(" + terms.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return t.split(re).map((part, idx) => idx % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join("");
}

async function card(i, opts = {}){
  const { manage = false, terms = [], bag = [], matchCount = 0, claimCount = 0, pendingClaims = 0 } = opts;
  const media = await mediaFor(i, bag), cat = lfCategory(i.category), recovered = i.status === "recovered";
  let mediaHtml = `<span class="item-icon" aria-hidden="true">${cat.icon}</span>`;
  if(media && media.kind === "image") mediaHtml = `<img src="${esc(media.url)}" alt="Photo of ${esc(i.name)}" loading="lazy">`;
  if(media && media.kind === "file") mediaHtml = `<div class="file-placeholder"><div aria-hidden="true">📎</div><strong>${esc(media.name)}</strong><small>${esc(formatBytes(media.size))}</small></div>`;
  const details = `item-details.html?id=${encodeURIComponent(i.id)}`;
  return `<article class="item-card${recovered ? " is-recovered" : ""}">
    <div class="item-image ${typeOf(i)}${media ? "" : " no-photo"}">${mediaHtml}${typePill(i)}${recovered ? '<span class="recovered-ribbon">✓ Recovered</span>' : ""}</div>
    <div class="item-body">
      <div class="item-tags">${categoryChip(i)}</div>
      <h3>${highlight(i.name, terms)}</h3>
      <ul class="item-facts">
        <li><span aria-hidden="true">📅</span><span class="sr-only">Date: </span>${esc(fmt(i.date))}</li>
        <li><span aria-hidden="true">📍</span><span class="sr-only">Location: </span>${highlight(i.place, terms)}</li>
      </ul>
      <p>${highlight(i.description, terms)}</p>
      ${(() => { const other = recovered ? linkedItem(i) : null; return other ? `<p class="matched-note"><span aria-hidden="true">🔗</span> Matched with <a href="item-details.html?id=${encodeURIComponent(other.id)}">${esc(other.name)}</a></p>` : ""; })()}
      <div class="card-bottom">${statusBadge(i)}<a href="${details}" aria-label="View details for ${esc(i.name)}">View details →</a></div>
      ${matchCount ? `<a class="match-hint" href="${details}#matches">🔗 ${matchCount} possible match${matchCount === 1 ? "" : "es"} →</a>` : ""}
      ${claimCount ? `<a class="match-hint claim-hint" href="claims.html?item=${encodeURIComponent(i.id)}">📨 ${claimCount} claim${claimCount === 1 ? "" : "s"} &amp; responses${pendingClaims ? ` · ${pendingClaims} pending` : ""} →</a>` : ""}
      ${manage ? `<div class="manage-actions"><button type="button" data-action="edit" data-id="${esc(i.id)}">✏️ Edit</button><button type="button" class="danger" data-action="delete" data-id="${esc(i.id)}">🗑 Delete</button><button type="button" data-action="recover" data-id="${esc(i.id)}"${recovered ? ' disabled aria-disabled="true"' : ""}>${recovered ? "✓ Recovered" : "Mark recovered"}</button></div>` : ""}
    </div>
  </article>`;
}

/* ---------- Possible matches (simple client-side scoring, not AI) ---------- */
const STOP_WORDS = new Set("the and for with from this that was were have has had are you your our its near into onto lost found item items thing things some very just about".split(" "));
function tokens(text){
  return new Set(String(text || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w)).map(w => w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}
const ITEM_KINDS={
  phone:["phone","smartphone","iphone"],laptop:["laptop","notebook","thinkpad","macbook"],
  tablet:["tablet","ipad"],earphones:["earphone","earbud","airpod","headphone"],watch:["watch","smartwatch"],
  wallet:["wallet","purse"],bag:["bag","backpack","rucksack"],bottle:["bottle","flask"],
  keys:["key","keys","keychain"],book:["book","textbook"],card:["card","badge"],clothing:["shirt","jacket","hoodie"]
};
const MATCH_BOILERPLATE=new Set("please contact call email message owner reporter collect collection return claim thank thanks help reach arrange number details".split(" "));
const ITEM_COLOURS=new Set("black blue white red green yellow pink brown gray silver gold purple orange beige".split(" "));
const IDENTITY_GENERIC=new Set([
  ...ITEM_COLOURS,"grey","small","large","leather","plastic","metal","case","cover","item",
  ...Object.values(ITEM_KINDS).flat()
]);
function matchTokens(text){return new Set([...tokens(text)].filter(w=>!MATCH_BOILERPLATE.has(w)))}
function itemColours(name){return new Set([...tokens(name)].map(w=>w==="grey"?"gray":w).filter(w=>ITEM_COLOURS.has(w)))}
function itemKind(name){
  const words=tokens(name);return Object.keys(ITEM_KINDS).find(kind=>ITEM_KINDS[kind].some(w=>words.has(w)))||"";
}
function scoreMatch(a, b){
  const lost = typeOf(a) === "lost" ? a : b, found = typeOf(a) === "lost" ? b : a;
  const noMatch=()=>({score:0,reasons:[]});
  if(typeOf(a)===typeOf(b)||a.status==="recovered"||b.status==="recovered")return noMatch();
  if(isRealDate(lost.date||"")&&isRealDate(found.date||"")&&daysBetween(lost.date,found.date)<-1)return noMatch();
  const kindA=itemKind(a.name),kindB=itemKind(b.name);
  if(kindA&&kindB&&kindA!==kindB)return noMatch();
  // Compare explicit colours in titles only; description colours may refer to a case or sticker.
  const coloursA=itemColours(a.name),coloursB=itemColours(b.name);
  if(coloursA.size&&coloursB.size&&![...coloursA].some(colour=>coloursB.has(colour)))return noMatch();
  let score = 0; const reasons = [];
  const ca = a.category || "other", cb = b.category || "other";
  if(ca!==cb&&ca!=="other"&&cb!=="other")return noMatch();
  if(ca === cb){ if(ca !== "other"){ score += 30; reasons.push("Same category"); } else score += 5; }

  const aName = matchTokens(a.name), bName = matchTokens(b.name), bAll = matchTokens(`${b.name} ${b.description}`), aAll = matchTokens(`${a.name} ${a.description}`);
  // A category/location/date coincidence is not evidence of item identity.
  const sharedName=[...aName].filter(w=>bName.has(w));
  const identityWords=[...aAll].filter(w=>!IDENTITY_GENERIC.has(w)&&bAll.has(w));
  if(!sharedName.length&&identityWords.length<2)return noMatch();
  let nameHits = 0;
  aName.forEach(w => { nameHits += bName.has(w) ? 2 : bAll.has(w) ? 1 : 0; });
  bName.forEach(w => { if(!aName.has(w) && aAll.has(w)) nameHits += 1; });
  const nameScore = Math.min(30, nameHits * 8);
  if(nameScore >= 8) reasons.push("Similar name");
  score += nameScore;

  const aDesc = matchTokens(a.description), bDesc = matchTokens(b.description);
  let shared = 0; aDesc.forEach(w => { if(bDesc.has(w)) shared++; });
  const descScore = Math.min(15, shared * 5);
  if(descScore >= 10) reasons.push("Matching details");
  score += descScore;

  const pa = String(a.place || "").trim().toLowerCase(), pb = String(b.place || "").trim().toLowerCase();
  if(pa && pa === pb){ score += 20; reasons.push("Same location"); }
  else { const tb = tokens(pb); if([...tokens(pa)].some(w => tb.has(w))){ score += 12; reasons.push("Similar location"); } }

  if(isRealDate(lost.date || "") && isRealDate(found.date || "")){
    const d = daysBetween(lost.date, found.date); // days from "lost" to "found"
    const gap = Math.abs(d);
    if(gap === 0){ score += 15; reasons.push("Same day"); }
    else if(gap <= 2){ score += 15; reasons.push(`${gap} day${gap === 1 ? "" : "s"} apart`); }
    else if(gap <= 7){ score += 10; reasons.push(`${gap} days apart`); }
    else if(gap <= 30) score += 4;
  }
  // Broad names such as "black phone" warrant only a tentative suggestion without distinctive details.
  if(!identityWords.length)score=Math.min(score,49);
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}
function findMatches(item, all = getItems(), limit = 4){
  if(item.status === "recovered") return [];
  const other = typeOf(item) === "lost" ? "found" : "lost";
  return all.filter(x => x.id !== item.id && typeOf(x) === other && x.status !== "recovered")
    .map(x => ({ item: x, ...scoreMatch(item, x) }))
    .filter(m => m.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
const matchLevel = s => s >= 70 ? ["strong", "Strong match"] : s >= 50 ? ["good", "Good match"] : ["possible", "Possible match"];

async function matchCard(m, bag, base, me){
  const i = m.item, media = await mediaFor(i, bag), [level, label] = matchLevel(m.score), cat = lfCategory(i.category);
  const thumb = media && media.kind === "image" ? `<img src="${esc(media.url)}" alt="Photo of ${esc(i.name)}" loading="lazy">` : `<span aria-hidden="true">${cat.icon}</span>`;
  // The owner of the base report can respond to the matching report, linked to their own report.
  // Nothing is marked recovered here: the other report's owner reviews the claim first.
  let action = "";
  if(me && base.reportedBy === me.email && i.reportedBy !== me.email){
    const label = typeOf(base) === "lost" ? "I Think This Is Mine" : "I Found This Item";
    action = `<a class="btn btn-primary btn-sm" href="item-details.html?id=${encodeURIComponent(i.id)}&claim=1&link=${encodeURIComponent(base.id)}#claim">${label}</a>`;
  }
  return `<div class="match-card">
    <div class="match-media">${thumb}</div>
    <div class="match-body">
      <div class="match-top">${typePill(i)}<span class="match-score ${level}"><span class="sr-only">Estimated match score: </span>Similarity score: ${m.score}/100 · ${label}</span></div>
      <a class="match-link" href="item-details.html?id=${encodeURIComponent(i.id)}"><strong>${esc(i.name)}</strong></a>
      <small><span aria-hidden="true">📍</span> ${esc(i.place)} · <span aria-hidden="true">📅</span> ${esc(fmt(i.date))}</small>
      <div class="match-meter" aria-hidden="true"><span class="${level}" style="width:${m.score}%"></span></div>
      ${m.reasons.length ? `<ul class="match-reasons">${m.reasons.map(r => `<li>✓ ${esc(r)}</li>`).join("")}</ul>` : ""}
      <div class="match-actions"><a class="btn btn-secondary btn-sm match-view" href="item-details.html?id=${encodeURIComponent(i.id)}">View report<span class="sr-only">: ${esc(i.name)}</span> →</a>${action}</div>
    </div>
  </div>`;
}

function filterReports(all,filters){
  const terms=String(filters.q||"").toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0,8);
  const place=String(filters.place||"").trim().toLowerCase();
  let list=all.filter(i=>(!filters.type||filters.type==="all"||i.type===filters.type)&&
    (!filters.category||filters.category==="all"||lfCategory(i.category).id===filters.category)&&
    (!filters.status||filters.status==="all"||(filters.status==="open"?!isRecovered(i):(i.status||"active")===filters.status))&&
    (!place||String(i.place||"").toLowerCase().includes(place))&&
    (!filters.from||i.date>=filters.from)&&(!filters.to||i.date<=filters.to)&&
    terms.every(term=>`${i.name} ${i.description} ${i.place} ${lfCategory(i.category).label}`.toLowerCase().includes(term)));
  list=lfNewestFirst(list);if(filters.sort==="oldest")list.reverse();return list;
}

/* ---------- Browse ---------- */
function initItems(){
  const grid = document.getElementById("itemsGrid");
  if(!grid) return;
  const search = document.getElementById("searchInput"), filter = document.getElementById("typeFilter"),
        catFilter = document.getElementById("categoryFilter"), sort = document.getElementById("sortOrder"),
        count = document.getElementById("itemsCount"), reset = document.getElementById("clearFilters"),
        status=document.getElementById("statusFilter"),place=document.getElementById("placeFilter"),
        from=document.getElementById("dateFrom"),to=document.getElementById("dateTo"),message=document.getElementById("filterMessage");
  catFilter.insertAdjacentHTML("beforeend", LF_CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join(""));

  // Optional deep links such as items.html?category=keys&type=found
  const params = new URLSearchParams(location.search||lfBrowseUrl().split("?")[1]||"");
  if(["lost", "found"].includes(params.get("type"))) filter.value = params.get("type");
  if(LF_CATEGORIES.some(c => c.id === params.get("category"))) catFilter.value = params.get("category");
  if(params.get("q")) search.value = params.get("q").slice(0, 100);
  if(["open","recovered","all"].includes(params.get("status")))status.value=params.get("status");
  if(params.get("place"))place.value=params.get("place").slice(0,80);
  if(isRealDate(params.get("from")||""))from.value=params.get("from");
  if(isRealDate(params.get("to")||""))to.value=params.get("to");
  if(params.get("sort")==="oldest")sort.value="oldest";

  let runId = 0, timer = 0;
  const run = async () => {
    const token = ++runId;
    const bag=[];
    try{
    lfClearFieldError(from);lfClearFieldError(to);setMessage(message,"");
    if((from.value&& !isRealDate(from.value))||(to.value&&!isRealDate(to.value))||(from.value&&to.value&&from.value>to.value)){
      lfFieldError(to,"Choose an end date on or after the start date.");
      setMessage(message,"Please correct the date range to update results.");return;
    }
    const all = getItems();
    const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
    const t = filter.value, c = catFilter.value;
    const filters={q:search.value,type:t,category:c,sort:sort.value,status:status.value,place:place.value,from:from.value,to:to.value};
    const list=filterReports(all,filters);
    const query=new URLSearchParams();
    Object.entries(filters).forEach(([key,value])=>{if(value&&(value!=="all"||key==="status")&&!(key==="sort"&&value==="newest"))query.set(key,value.trim())});
    const browseUrl="items.html"+(query.size?"?"+query.toString():"");
    history.replaceState(null,"",browseUrl);
    try{sessionStorage.setItem("lf_browse_url",browseUrl)}catch(error){}
    const filtered = terms.length || t !== "all" || c !== "all"||status.value!=="all"||place.value||from.value||to.value;
    count.textContent = `${list.length} report${list.length !== 1 ? "s" : ""}${filtered ? ` of ${all.length}` : ""}`;
    let html;
    if(!all.length) html = `<div class="empty-state"><div aria-hidden="true">📭</div><h3>No reports yet</h3><p>Be the first to report a lost or found item.</p><div class="empty-actions"><a href="report.html?type=lost" class="btn btn-primary">Report lost item</a><a href="report.html?type=found" class="btn btn-secondary">Report found item</a></div></div>`;
    else if(!list.length) html = `<div class="empty-state"><div aria-hidden="true">⌕</div><h3>No reports found</h3><p>Try changing your search or filters.</p><button type="button" class="btn btn-secondary" data-reset>Reset filters</button></div>`;
    else html = (await Promise.all(list.map(i => card(i, { terms, bag })))).join("");
    if(token !== runId){ bag.forEach(u => URL.revokeObjectURL(u)); return; } // a newer search started meanwhile
    commit(grid, html, bag);
    }catch(error){bag.forEach(u=>URL.revokeObjectURL(u));lfShowStorageError(error);count.textContent="Reports unavailable";commit(grid,'<p class="muted">Your saved reports could not be loaded. Existing data has been kept.</p>',[])}
  };
  const resetAll = () => { search.value = ""; filter.value = "all"; catFilter.value = "all"; sort.value = "newest";status.value="open";place.value="";from.value="";to.value="";run(); search.focus(); };
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  place.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(run,120)});
  [filter, catFilter, sort,status,from,to].forEach(el => el.addEventListener("change", run));
  reset.addEventListener("click", resetAll);
  grid.addEventListener("click", e => { if(e.target.closest("[data-reset]")) resetAll(); });
  window.addEventListener("storage",e=>{if([ITEMS_KEY,LF_RECORDS_KEY,CLAIMS_KEY].includes(e.key))run()});
  run();
}

/* ---------- Report form (lost / found) ---------- */
const REPORT_COPY = {
  lost: { eyebrow: "REPORT LOST ITEM", title: "Report a lost item", intro: "Tell the community what you lost and where you last had it." },
  found: { eyebrow: "REPORT FOUND ITEM", title: "Report a found item", intro: "Describe what you found so the owner can recognise it." }
};

function initReport(){
  const form = document.getElementById("reportForm"); if(!form) return;
  if(!requireUser()) return;
  const params = new URLSearchParams(location.search), editId = params.get("edit");
  const existing = editId ? getItems().find(x => x.id === editId && x.reportedBy === user().email) : null;
  if(editId && !existing){ location.href = "my-reports.html"; return; }
  let type = existing ? typeOf(existing) : params.get("type") === "found" ? "found" : "lost";

  const nameEl = document.getElementById("itemName"), dateEl = document.getElementById("itemDate"),
        placeEl = document.getElementById("itemPlace"), descEl = document.getElementById("itemDescription"),
        contactEl = document.getElementById("itemContact"), input = document.getElementById("itemImage"),
        preview = document.getElementById("imagePreview"), actions = document.getElementById("photoActions"),
        photoField = document.getElementById("photoField"), catGroup = document.getElementById("categoryGroup"),
        msg = document.getElementById("reportMessage"), descCount = document.getElementById("descCount"),
        typeSwitch = document.getElementById("typeSwitch");

  // Category choices
  document.getElementById("categoryOptions").innerHTML = LF_CATEGORIES.map(c =>
    `<label class="category-option"><input type="radio" name="category" value="${c.id}"><span><b aria-hidden="true">${c.icon}</b>${esc(c.label)}</span></label>`).join("");

  // Lost vs found wording
  const applyType = () => {
    const copy = REPORT_COPY[type];
    document.getElementById("reportEyebrow").textContent = existing ? "EDIT REPORT" : copy.eyebrow;
    document.getElementById("reportTitle").textContent = existing ? `Edit your ${type} report` : copy.title;
    document.getElementById("reportIntro").textContent = copy.intro;
    form.querySelectorAll("[data-lost]").forEach(el => {
      const text = el.getAttribute(`data-${type}`);
      if(el.tagName === "TEXTAREA") el.placeholder = text; else el.textContent = text;
    });
    typeSwitch.querySelectorAll(".type-option").forEach(a => {
      if(a.dataset.type === type) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = `${existing ? "Edit report" : copy.title} | Lost & Found+`;
  };
  if(existing) typeSwitch.hidden = true;
  typeSwitch.addEventListener("click", e => {
    const a = e.target.closest(".type-option"); if(!a) return;
    e.preventDefault();
    type = a.dataset.type;
    history.replaceState(null, "", `report.html?type=${type}`);
    applyType();
    scheduleDraft();
  });

  // Dates: today is the latest selectable day (re-checked on submit in case the page stays open past midnight)
  dateEl.max = todayISO();
  dateEl.min = MIN_DATE;

  const updateCount = () => { descCount.textContent = `${descEl.value.length} / ${LIMITS.description}`; };
  descEl.addEventListener("input", updateCount);

  // Photo: optional, with preview / change / remove
  let photoFile = null, removeExisting = false, previewUrl = "";
  const emptyPreview = `<span class="upload-icon" aria-hidden="true">📷</span><strong>Add a photo (optional)</strong><small>Click to choose an image</small>`;
  const showPreview = (url, caption) => {
    preview.innerHTML = `<img src="${esc(url)}" alt="Selected photo preview"><small>${esc(caption)}</small>`;
    actions.hidden = false;
  };
  const clearPreview = () => {
    if(previewUrl){ URL.revokeObjectURL(previewUrl); previewUrl = ""; }
    preview.innerHTML = emptyPreview;
    actions.hidden = true;
  };
  clearPreview();

  if(existing){
    nameEl.value = existing.name; dateEl.value = existing.date; placeEl.value = existing.place;
    descEl.value = existing.description; contactEl.value = existing.contact;
    const radio = form.querySelector(`input[name="category"][value="${lfCategory(existing.category).id}"]`);
    if(radio) radio.checked = true;
    (async () => {
      const bag = [], media = await mediaFor(existing, bag);
      if(media && media.kind === "image"){ previewUrl = bag[0] || ""; showPreview(media.url, "Current photo"); }
      else if(media && media.kind === "file"){ preview.innerHTML = `<span class="upload-icon" aria-hidden="true">📎</span><strong>${esc(media.name)}</strong><small>Current attachment · choose a photo to replace it</small>`; actions.hidden = false; bag.forEach(u => URL.revokeObjectURL(u)); }
    })();
  } else {
    contactEl.value = user().email || "";
  }
  updateCount();
  applyType();

  // A separate text draft per signed-in user and report. Photos and passwords are never included.
  const draftKey=`lf_draft_${encodeURIComponent(user().email)}_${editId||"new"}`;
  const draftPrompt=document.getElementById("draftPrompt"),draftStatus=document.getElementById("draftStatus");
  const draftFields={name:nameEl,date:dateEl,place:placeEl,description:descEl,contact:contactEl};
  let draftTimer=0,draftPending=false,draftBlocked=false,draftDirty=false,published=false;
  const validDraft=d=>d&&["lost","found"].includes(d.type)&&
    Object.keys(draftFields).every(k=>typeof d[k]==="string")&&typeof d.category==="string";
  let savedDraft=null;
  try{savedDraft=lfRead(draftKey,null,validDraft)}catch(error){draftBlocked=true;draftStatus.textContent="Your saved draft could not be read and has been kept. New text will stay on this page; draft autosave is unavailable."}
  if(savedDraft){draftPending=true;draftPrompt.hidden=false}
  function saveDraft(){
    clearTimeout(draftTimer);
    if(published||draftPending||draftBlocked||!draftDirty)return;
    const draft={type,category:form.querySelector('input[name="category"]:checked')?.value||"",updatedAt:Date.now()};
    Object.entries(draftFields).forEach(([key,el])=>{draft[key]=el.value});
    try{lfWrite(draftKey,draft);if(draftStatus.textContent!=="Text draft saved on this device. Photos must be selected again after reopening.")draftStatus.textContent="Text draft saved on this device. Photos must be selected again after reopening."}
    catch(error){draftStatus.textContent=error.message}
  }
  function scheduleDraft(){draftDirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,350)}
  form.addEventListener("input",e=>{if(e.target.type!=="file")scheduleDraft()});
  form.addEventListener("change",e=>{if(e.target.name==="category")scheduleDraft()});
  window.addEventListener("pagehide",saveDraft);
  document.getElementById("restoreDraft").addEventListener("click",()=>{
    if(!savedDraft)return;
    Object.entries(draftFields).forEach(([key,el])=>{el.value=savedDraft[key]});
    if(!existing){type=savedDraft.type;history.replaceState(null,"",`report.html?type=${type}`)}
    const radio=form.querySelector(`input[name="category"][value="${lfCategory(savedDraft.category).id}"]`);
    if(savedDraft.category&&radio)radio.checked=true;
    draftPending=false;draftPrompt.hidden=true;applyType();updateCount();nameEl.focus();
    draftStatus.textContent="Draft restored. Select your photo again if needed.";
  });
  document.getElementById("discardDraft").addEventListener("click",()=>{
    try{lfRemove(draftKey);savedDraft=null;draftPending=false;draftPrompt.hidden=true;draftStatus.textContent="Saved draft discarded.";nameEl.focus()}
    catch(error){draftStatus.textContent=error.message}
  });

  input.addEventListener("change", () => {
    const f = input.files[0];
    lfClearFieldError(input, photoField);
    if(!f) return;
    if(!IMAGE_TYPES.includes(f.type)){ input.value = ""; lfFieldError(input, "Please choose a JPG, PNG, WebP or GIF image.", photoField); return; }
    if(f.size > MAX_FILE_SIZE){ input.value = ""; lfFieldError(input, `This photo is ${formatBytes(f.size)}. Please choose one up to 10 MB.`, photoField); return; }
    photoFile = f; removeExisting = false;
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    showPreview(previewUrl, `${f.name} · ${formatBytes(f.size)}`);
  });
  document.getElementById("changePhoto").addEventListener("click", () => input.click());
  document.getElementById("removePhoto").addEventListener("click", () => {
    photoFile = null; input.value = "";
    if(existing && (existing.fileId || existing.image)) removeExisting = true;
    clearPreview();
    lfClearFieldError(input, photoField);
    input.focus();
  });

  // Clear a field's message as soon as the user fixes it
  form.addEventListener("input", e => { if(e.target.matches("input:not([type=file]),textarea")) lfClearFieldError(e.target); });
  form.addEventListener("change", e => { if(e.target.name === "category") lfClearFieldError(catGroup); });

  const validate = () => {
    const errors = [];
    const name = nameEl.value.trim(), place = placeEl.value.trim(), desc = descEl.value.trim(), contact = contactEl.value.trim(), date = dateEl.value;
    if(!name) errors.push([nameEl, "Item name is required."]);
    else if(name.length < 2) errors.push([nameEl, "Item name must be at least 2 characters."]);
    else if(name.length > LIMITS.name) errors.push([nameEl, `Item name must be ${LIMITS.name} characters or fewer.`]);

    if(!form.querySelector('input[name="category"]:checked')) errors.push([catGroup, "Please choose a category."]);

    if(!date) errors.push([dateEl, dateEl.validity.badInput ? "Please enter a valid date." : "Date is required."]);
    else if(!isRealDate(date)) errors.push([dateEl, "Please enter a valid date."]);
    else if(date > todayISO()) errors.push([dateEl, "The date cannot be in the future."]);
    else if(date < MIN_DATE) errors.push([dateEl, "Please enter a date from the year 2000 onwards."]);

    if(!place) errors.push([placeEl, "Location is required."]);
    else if(place.length < 2) errors.push([placeEl, "Location must be at least 2 characters."]);
    else if(place.length > LIMITS.place) errors.push([placeEl, `Location must be ${LIMITS.place} characters or fewer.`]);

    const descName = type === "found" ? "Additional details" : "Description";
    if(!desc) errors.push([descEl, `${descName} ${type === "found" ? "are" : "is"} required.`]);
    else if(desc.length < 10) errors.push([descEl, "Please add a little more detail (at least 10 characters)."]);
    else if(desc.length > LIMITS.description) errors.push([descEl, `${descName} must be ${LIMITS.description} characters or fewer.`]);

    if(!contact) errors.push([contactEl, "Contact email is required."]);
    else if(contact.length > LIMITS.contact || !LF_EMAIL_RE.test(contact)) errors.push([contactEl, "Please enter a valid email address, e.g. you@example.com."]);

    if(photoFile && !IMAGE_TYPES.includes(photoFile.type)) errors.push([input, "Please choose a JPG, PNG, WebP or GIF image."]);
    else if(photoFile && photoFile.size > MAX_FILE_SIZE) errors.push([input, "This photo is larger than 10 MB."]);
    return errors;
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    dateEl.max = todayISO();
    lfClearFieldErrors(form);
    setMessage(msg, "");
    const errors = validate();
    if(errors.length){
      errors.forEach(([el, text]) => lfFieldError(el, text, el === input ? photoField : undefined));
      setMessage(msg, errors.length === 1 ? errors[0][1] : `Please fix the ${errors.length} highlighted fields.`);
      const first = errors[0][0];
      (first.matches("fieldset") ? first.querySelector("input") : first).focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = "Publishing…";
    let newFileId="",metadataSaved=false;
    try{
      const me=user();if(!me)throw new Error("Please log in again before saving. Your text is still on this page.");
      getItems(); // Validate existing metadata before touching photo storage.
      const id = existing ? existing.id : (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
      let fileId = existing?.fileId || "", fileName = existing?.fileName || "", fileType = existing?.fileType || "", fileSize = existing?.fileSize || 0, image = existing?.image || "";
      if(photoFile){
        fileId = `file_${id}_${crypto.randomUUID?crypto.randomUUID():Date.now()}`;
        newFileId=fileId;
        await saveFile(fileId, photoFile);
        fileName = photoFile.name; fileType = photoFile.type; fileSize = photoFile.size; image = "";
      } else if(removeExisting){
        fileId = ""; fileName = ""; fileType = ""; fileSize = 0; image = "";
      }
      // Photo storage yields to other tabs. Re-read immediately before the synchronous metadata commit.
      // ponytail: localStorage is not transactional across tabs; this closes the photo-await stale snapshot window.
      if(user()?.email!==me.email)throw new Error("Your sign-in changed while saving. Your text is still on this page; log in again before retrying.");
      const items=getItems();
      const idx=existing?items.findIndex(x=>x.id===existing.id):-1;
      if(existing){
        if(idx<0||items[idx].reportedBy!==me.email)throw new Error("This report is no longer available for you to edit. Your text is still on this page.");
        if(JSON.stringify(items[idx])!==JSON.stringify(existing))throw new Error("This report changed in another tab. Your text is still on this page; reload to review the latest version before editing again.");
      }
      const item = {
        ...existing, id, type, category: form.querySelector('input[name="category"]:checked').value,
        name: nameEl.value.trim(), description: descEl.value.trim(), date: dateEl.value, place: placeEl.value.trim(), contact: contactEl.value.trim(),
        fileId, fileName, fileType, fileSize, image,
        reportedBy: me.email, reporterName: me.name, status: existing?.status || "active", createdAt: existing?.createdAt || Date.now()
      };
      if(existing){
        items[idx] = item;
      } else items.unshift(item);
      saveItems(items);
      metadataSaved=true;published=true;clearTimeout(draftTimer);
      // Commit metadata first, so a storage failure cannot destroy the original attachment.
      if(existing?.fileId&&existing.fileId!==fileId)await deleteFile(existing.fileId);
      try{lfRemove(draftKey)}catch(error){draftStatus.textContent="Report saved. The old draft could not be cleared; discard it if it reappears."}
      location.href = existing ? "my-reports.html?updated=1" : `item-details.html?id=${encodeURIComponent(id)}&published=1`;
    }catch(err){
      if(newFileId&&!metadataSaved)await deleteFile(newFileId);
      setMessage(msg, err.message||"Could not publish this report. Your entered information is still on this page. Please try again.");
      button.disabled = false; button.textContent = "Publish report →";
    }
  });
}

/* ---------- Claim / response form on the details page ---------- */
function renderClaimArea(i, params){
  const area = document.getElementById("claimArea"), msg = document.getElementById("claimMessage");
  if(!area) return;
  const me = user(), found = typeOf(i) === "found", recovered = isRecovered(i);
  const claims = getClaims().filter(c => c.itemId === i.id);
  // Report owner: summary + link to the review page. Edit stays owner-only.
  if(me && i.reportedBy === me.email){
    const pending = claims.filter(c => c.status === "pending").length;
    area.innerHTML = `${recovered ? "" : `<a class="btn btn-secondary full" href="report.html?type=${typeOf(i)}&edit=${encodeURIComponent(i.id)}">✏️ Edit your report</a>`}
      <a class="owner-claims${claims.length ? "" : " empty"}" href="claims.html?item=${encodeURIComponent(i.id)}"><span aria-hidden="true">📨</span> ${claims.length ? `${claims.length} claim${claims.length === 1 ? "" : "s"} &amp; responses${pending ? ` · <b>${pending} pending</b>` : ""} — review` : "No claims or responses yet"} →</a>`;
    return;
  }
  if(recovered){ area.innerHTML = ""; return; }
  const mine = me ? claims.find(c => c.userEmail === me.email) : null;
  if(mine){
    area.innerHTML = `<div class="claim-sent"><p><b>You already sent a ${found ? "claim" : "response"}</b> on ${esc(fmtDateTime(mine.date))}.</p><p>Status: ${claimStatusBadge(mine.status)}</p><a href="claims.html#sent">See your claims &amp; responses →</a></div>`;
    return;
  }
  const label = found ? "I Think This Is Mine" : "I Found This Item";
  const myOpen = getItems().filter(x => me && x.reportedBy === me.email && typeOf(x) !== typeOf(i) && !isRecovered(x))
    .map(x => ({ item: x, ...scoreMatch(i, x) })).sort((a, b) => b.score - a.score).slice(0, 5);
  const preLink = params.get("link");
  const defaultLink = myOpen.some(m => m.item.id === preLink) ? preLink : (myOpen[0] && myOpen[0].score >= 35 ? myOpen[0].item.id : "");
  const otherKind = found ? "lost" : "found";
  area.innerHTML = `<button id="claimBtn" type="button" class="btn btn-primary full" aria-expanded="false" aria-controls="claimForm">${found ? "🙋" : "🤝"} ${label}</button>
    <form id="claimForm" class="claim-form" novalidate hidden aria-labelledby="claimFormTitle">
      <h2 id="claimFormTitle">${found ? "Claim this item" : "Tell the owner you found it"}</h2>
      <p class="field-hint" id="claimHelp">${found
        ? "Describe something only the owner would know — what's inside, a mark, a sticker, the lock-screen photo. Don't include passwords or card numbers."
        : "Say where and when you found it and where it is now, so the owner can recognise it."}</p>
      <label for="claimText">${found ? "Identifying details" : "Your message"}<textarea id="claimText" rows="4" maxlength="500" aria-describedby="claimHelp claimCount" required></textarea><span class="char-count" id="claimCount">0 / 500</span></label>
      ${myOpen.length ? `<fieldset class="claim-link"><legend>Link one of your ${otherKind} reports (optional)</legend>
        ${myOpen.map(m => `<label class="claim-option"><input type="radio" name="claimLink" value="${esc(m.item.id)}"${m.item.id === defaultLink ? " checked" : ""}><span><strong>${esc(m.item.name)}</strong><small>${otherKind === "lost" ? "Lost" : "Found"} ${esc(fmt(m.item.date))} · ${esc(m.item.place)}${m.score >= 35 ? ` · Similarity score: ${m.score}/100` : ""}</small></span></label>`).join("")}
        <label class="claim-option"><input type="radio" name="claimLink" value=""${defaultLink ? "" : " checked"}><span><strong>Don't link a report</strong></span></label></fieldset>` : ""}
      <p class="field-hint">Saved in this browser only. The reporter sees it under <b>Claims &amp; Responses</b> when they use this browser; it is not sent to them. Use “Email Reporter” to contact them directly.</p>
      <div class="claim-actions"><button type="submit" class="btn btn-primary btn-sm">Send ${found ? "claim" : "response"}</button><button type="button" class="btn btn-secondary btn-sm" id="claimCancel">Cancel</button></div>
    </form>`;
  const btn = document.getElementById("claimBtn"), form = document.getElementById("claimForm"), text = document.getElementById("claimText"), count = document.getElementById("claimCount");
  const open = () => { form.hidden = false; btn.hidden = true; btn.setAttribute("aria-expanded", "true"); text.focus(); };
  btn.addEventListener("click", () => { if(!user()){ goToLogin(); return; } open(); });
  document.getElementById("claimCancel").addEventListener("click", () => { form.hidden = true; btn.hidden = false; btn.setAttribute("aria-expanded", "false"); lfClearFieldErrors(form); btn.focus(); });
  text.addEventListener("input", () => { count.textContent = `${text.value.length} / 500`; lfClearFieldError(text); });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const viewer = user(); if(!viewer){ goToLogin(); return; }
    const value = text.value.trim();
    lfClearFieldErrors(form);
    if(value.length < 10){ lfFieldError(text, value ? "Please add a little more detail (at least 10 characters)." : (found ? "Please describe identifying details." : "Please write a short message.")); text.focus(); return; }
    if(value.length > 500){ lfFieldError(text, "Please keep this under 500 characters."); text.focus(); return; }
    try{
      const records=lfReadRecords(),target=records.items.find(x=>x.id===i.id),list=records.claims;
      if(!target||isRecovered(target)||target.reportedBy===viewer.email)throw new Error("This report changed or is no longer open for your response. Your message is still here; reload to review it.");
      if(list.some(c=>c.itemId===i.id&&c.userEmail===viewer.email)){renderClaimArea(target,params);setMessage(msg,"You have already responded to this report.","info");return}
      const link=(form.querySelector('input[name="claimLink"]:checked')||{}).value||"";
      if(link&&!records.items.some(x=>x.id===link&&x.reportedBy===viewer.email&&typeOf(x)!==typeOf(target)&&!isRecovered(x)))throw new Error("Your linked report changed. Keep your message and select an available report after reloading.");
      list.push({id:`claim_${crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(36).slice(2)}`,itemId:target.id,userEmail:viewer.email,userName:viewer.name,message:value,relatedId:link,status:"pending",date:Date.now(),updatedAt:0});
      lfSaveRecords(records);
      renderClaimArea(target,params);
      setMessage(msg,`${found?"Claim":"Response"} saved on this device. It has not been sent to the reporter. They can review it here when using this browser; use “Email Reporter” to contact them.`,"success");
    }catch(error){setMessage(msg,error.message)}
  });
  if(params.get("claim") === "1"){ open(); document.getElementById("claimArea").scrollIntoView({ block: "center" }); }
}

/* ---------- Item details + possible matches ---------- */
async function initDetails(){
  const box = document.getElementById("detailContent"); if(!box) return;
  const params = new URLSearchParams(location.search), id = params.get("id"), all = getItems(), i = all.find(x => x.id === id);
  if(!i){ box.innerHTML = '<div class="empty-state"><div aria-hidden="true">🔍</div><h3>Report not found</h3><p>It may have been deleted.</p><a class="btn btn-secondary" href="items.html">Back to reports</a></div>'; return; }
  const bag = [], media = await mediaFor(i, bag), cat = lfCategory(i.category), found = typeOf(i) === "found", recovered = i.status === "recovered", me = user();
  let photo = `<span class="detail-icon" aria-hidden="true">${cat.icon}</span>`;
  if(media && media.kind === "image") photo = `<button type="button" class="photo-zoom" id="photoZoom" aria-label="View larger photo of ${esc(i.name)}"><img src="${esc(media.url)}" alt="Photo of ${esc(i.name)}"><span class="zoom-hint" aria-hidden="true">🔍 View larger</span></button>`;
  if(media && media.kind === "file") photo = `<div class="file-detail"><div aria-hidden="true">📎</div><strong>${esc(media.name)}</strong><small>${esc(formatBytes(media.size))}</small><a class="btn btn-secondary" href="${esc(media.url)}" download="${esc(media.name)}">Download file</a></div>`;
  const canRespond = !recovered && i.reportedBy !== me?.email;
  document.title = `${i.name} | Lost & Found+`;
  const flash = takeFlash();
  const linked = recovered ? linkedItem(i, all) : null;
  let bannerText = "This item has been returned to its owner.";
  if(linked && !found) bannerText = `Matched with the found report <a href="item-details.html?id=${encodeURIComponent(linked.id)}">${esc(linked.name)}</a>, found by ${esc(linked.reporterName)}. Contact <a href="mailto:${encodeURIComponent(linked.contact)}">${esc(linked.contact)}</a> to collect it.`;
  else if(linked) bannerText = `Matched with the lost report <a href="item-details.html?id=${encodeURIComponent(linked.id)}">${esc(linked.name)}</a> by ${esc(linked.reporterName)}.`;
  const html = `${flash ? `<p class="form-message success page-banner" role="status">${esc(flash)}</p>` : ""}${params.get("published") ? '<p class="form-message success page-banner" role="status" tabindex="-1">Your report has been published. Possible matches are shown below.</p>' : ""}
  <div class="detail-grid">
    <div class="detail-photo${media ? "" : " no-photo"}">${photo}</div>
    <div class="detail-info">
      <div class="detail-top">${typePill(i)}${categoryChip(i)}${statusBadge(i)}</div>
      <h1>${esc(i.name)}</h1>
      ${recovered ? `<div class="recovered-banner" role="status"><b>✓ ${found ? "Returned to owner" : "Recovered"}</b> <span>${bannerText}</span></div>` : ""}
      <p class="detail-description">${esc(i.description)}</p>
      <div class="detail-facts">
        <div><small>${found ? "DATE FOUND" : "DATE LOST"}</small><strong>${esc(fmt(i.date))}</strong></div>
        <div><small>${found ? "FOUND AT" : "LAST SEEN AT"}</small><strong>${esc(i.place)}</strong></div>
        <div><small>REPORTED BY</small><strong>${esc(i.reporterName)}</strong></div>
      </div>
      <div class="contact-box"><div><small>CONTACT</small><strong>${esc(i.contact)}</strong></div><a class="btn btn-secondary" href="mailto:${encodeURIComponent(i.contact)}?subject=${encodeURIComponent(`Regarding your "${i.name}" report`)}">✉ Email Reporter</a></div>
      <p class="field-hint email-note">“Email Reporter” opens your own email app with a draft — nothing is sent automatically.</p>
      <div id="claimArea" class="claim-area"></div>
      <div id="claimMessage" class="form-message" aria-live="polite" aria-atomic="true"></div>
    </div>
  </div>
  <section class="matches" id="matches" aria-labelledby="matchesTitle"></section>
  <dialog class="photo-dialog" id="photoDialog" aria-label="Photo of ${esc(i.name)}"><form method="dialog"><button class="btn btn-secondary btn-sm dialog-close" aria-label="Close photo">✕ Close</button></form>${media && media.kind === "image" ? `<img src="${esc(media.url)}" alt="Photo of ${esc(i.name)}">` : ""}</dialog>`;
  commit(box, html, bag);
  if(params.get("published"))box.querySelector(".page-banner").focus();

  // Photo viewer: a native <dialog> (keyboard accessible, Esc closes, focus returns to the photo).
  const zoom = document.getElementById("photoZoom"), dlg = document.getElementById("photoDialog");
  if(zoom && dlg && typeof dlg.showModal === "function"){
    zoom.addEventListener("click", () => dlg.showModal());
    dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); }); // click on the backdrop
  }else if(zoom){ zoom.addEventListener("click", () => window.open(zoom.querySelector("img").src, "_blank", "noopener")); }

  renderClaimArea(i, params);

  const section = document.getElementById("matches");
  if(recovered){ section.remove(); return; }
  const matches = findMatches(i, all);
  const mBag = [];
  const cards = matches.length ? `<div class="match-list">${(await Promise.all(matches.map(m => matchCard(m, mBag, i, me)))).join("")}</div>`
    : `<div class="empty-state compact"><div aria-hidden="true">🔗</div><h3>No possible matches yet.</h3><p>${found ? "We'll compare this with lost reports as they are added." : "We'll compare this with found reports as they are added."}</p></div>`;
  commit(section, `<div class="section-heading compact"><div><span class="eyebrow">SMART MATCHING</span><h2 id="matchesTitle">Possible Matches</h2></div>${matches.length ? `<span class="results-count">${matches.length} suggestion${matches.length === 1 ? "" : "s"}</span>` : ""}</div>
    <p class="matches-note"><b>Estimated</b> matches, strongest first: ${found ? "lost reports" : "found reports"} that look similar based on category, keywords, location and dates. Matching runs locally in your browser — it is not AI and not proof of ownership, so always confirm details with the reporter.</p>${cards}`, mBag);
  if(location.hash === "#matches") section.scrollIntoView();
}

/* ---------- My reports ---------- */
async function initMine(){
  const grid = document.getElementById("myReportsGrid"); if(!grid || !requireUser()) return;
  const all = getItems(), mine = lfNewestFirst(all.filter(i => i.reportedBy === user().email));
  const bag = [];
  const claims = getClaims();
  const html = mine.length ? (await Promise.all(mine.map(i => { const cs = claims.filter(c => c.itemId === i.id);
    return card(i, { manage: true, bag, matchCount: findMatches(i, all).length, claimCount: cs.length, pendingClaims: cs.filter(c => c.status === "pending").length }); }))).join("")
    : `<div class="empty-state"><div aria-hidden="true">+</div><h3>No reports yet</h3><p>Create your first lost or found report.</p><div class="empty-actions"><a href="report.html?type=lost" class="btn btn-primary">Report lost item</a><a href="report.html?type=found" class="btn btn-secondary">Report found item</a></div></div>`;
  commit(grid, html, bag);
  const flash = document.getElementById("mineMessage");
  if(flash && new URLSearchParams(location.search).get("updated")) setMessage(flash, "Your report has been updated.", "success");
  grid.onclick = async e => {
    const b=e.target.closest("button[data-action]");if(!b||b.disabled)return;
    try{
      const records=lfReadRecords(),id=b.dataset.id,idx=records.items.findIndex(x=>x.id===id),me=user();
      if(idx<0||records.items[idx].reportedBy!==me?.email)return;
      const item=records.items[idx];
      if(b.dataset.action==="delete"&&confirm("Delete this report?")){
        records.items.splice(idx,1);lfSaveRecords(records);
        if(item.fileId&&!records.items.some(x=>x.fileId===item.fileId))await deleteFile(item.fileId);
        if(flash)setMessage(flash,"Report deleted.","success");await initMine();
      }
      if(b.dataset.action==="recover"&&!isRecovered(item)&&confirm(`Mark “${item.name}” as recovered? It will leave the open lists.`)){
        recoverReport(id);if(flash)setMessage(flash,`“${item.name}” is marked as recovered and its claims are resolved.`,"success");await initMine();
      }
      if(b.dataset.action==="edit")location.href=`report.html?type=${typeOf(item)}&edit=${encodeURIComponent(id)}`;
    }catch(error){if(flash)setMessage(flash,error.message);else lfShowStorageError(error)}
  };
}

/* ---------- Recovered items: each lost report next to the found report it was matched with ---------- */
const fmtTs = ms => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
function pairSide(i){
  const cat = lfCategory(i.category), lost = typeOf(i) === "lost";
  return `<a class="pair-side ${typeOf(i)}" href="item-details.html?id=${encodeURIComponent(i.id)}">
    <span class="pair-top">${typePill(i)}<span class="pair-icon" aria-hidden="true">${cat.icon}</span></span>
    <strong>${esc(i.name)}</strong>
    <small>${lost ? "Lost by" : "Found by"} ${esc(i.reporterName)}</small>
    <small><span aria-hidden="true">📅</span> ${esc(fmt(i.date))} · <span aria-hidden="true">📍</span> ${esc(i.place)}</small></a>`;
}
async function initRecovered(){
  const list = document.getElementById("recoveredList"); if(!list) return;
  const all = getItems(), byId = new Map(all.map(x => [x.id, x])), pairs = [], solo = [];
  all.filter(isRecovered).forEach(i => {
    const other = i.matchedWith ? byId.get(i.matchedWith) : null;
    if(typeOf(i) === "lost"){ if(other && typeOf(other) === "found") pairs.push({ lost: i, found: other }); else solo.push(i); }
    else if(!other || typeOf(other) !== "lost") solo.push(i);
  });
  pairs.sort((a, b) => (b.lost.recoveredAt || 0) - (a.lost.recoveredAt || 0));
  const daysTaken = p => p.lost.recoveredAt && isRealDate(p.lost.date) ? Math.max(0, Math.round((p.lost.recoveredAt - Date.parse(p.lost.date + "T00:00:00")) / 864e5)) : null;
  const days = pairs.map(daysTaken).filter(d => d !== null);
  const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  document.getElementById("recoveredStats").innerHTML =
    `<div class="stat-card"><span>Items reunited</span><strong>${pairs.length}</strong></div>`
    + `<div class="stat-card"><span>Average time to recover</span><strong>${avg === null ? "—" : `${avg} day${avg === 1 ? "" : "s"}`}</strong></div>`
    + `<div class="stat-card"><span>Recovered without a match</span><strong>${solo.length}</strong></div>`;
  list.innerHTML = pairs.length ? pairs.map(p => {
    const d = daysTaken(p);
    return `<article class="pair-card"><div class="pair-head"><span class="status-badge recovered">✓ Reunited</span><small>${p.lost.recoveredAt ? `Matched on ${esc(fmtTs(p.lost.recoveredAt))}` : ""}${d !== null ? ` · ${d === 0 ? "the same day it was lost" : `${d} day${d === 1 ? "" : "s"} after it was lost`}` : ""}</small></div>`
      + `<div class="pair-body">${pairSide(p.lost)}<span class="pair-link" aria-hidden="true">⇄</span>${pairSide(p.found)}</div></article>`;
  }).join("") : `<div class="empty-state"><div aria-hidden="true">🤝</div><h3>No items reunited yet</h3><p>When someone confirms a possible match, the lost report and its found report appear here together.</p><a class="btn btn-secondary" href="items.html">Browse open reports</a></div>`;
  const soloSection = document.getElementById("soloSection");
  if(solo.length){
    soloSection.hidden = false;
    const bag = [];
    commit(document.getElementById("soloList"), (await Promise.all(lfNewestFirst(solo).map(i => card(i, { bag })))).join(""), bag);
  }
}

/* ---------- Claims & Responses (report owners review; claimants see their own) ---------- */
function initClaims(){
  const recvBox = document.getElementById("claimsReceived"); if(!recvBox || !requireUser()) return;
  const sentBox = document.getElementById("claimsSent"), msg = document.getElementById("claimsMessage"),
        filter = document.getElementById("claimFilter"), params = new URLSearchParams(location.search);
  const onlyItem = params.get("item") || "";

  const render = () => {
    const me = user(), items = getItems(), byId = new Map(items.map(x => [x.id, x])), claims = getClaims();
    // Only claims about reports owned by the signed-in user.
    let received = claims.filter(c => { const it = byId.get(c.itemId); return it && it.reportedBy === me.email; });
    const counts = { all: received.length, pending: 0, reviewed: 0, resolved: 0 };
    received.forEach(c => counts[c.status]++);
    filter.querySelectorAll("option").forEach(o => { o.textContent = `${o.dataset.label} (${counts[o.value]})`; });
    if(onlyItem) received = received.filter(c => c.itemId === onlyItem);
    if(filter.value !== "all") received = received.filter(c => c.status === filter.value);
    received.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.date - a.date);
    const itemNote = document.getElementById("claimsItemNote");
    if(onlyItem && byId.get(onlyItem)){ itemNote.hidden = false; itemNote.innerHTML = `Showing claims for <b>${esc(byId.get(onlyItem).name)}</b> · <a href="claims.html">Show all</a>`; } else itemNote.hidden = true;

    recvBox.innerHTML = received.length ? received.map(c => {
      const it = byId.get(c.itemId), rel = c.relatedId ? byId.get(c.relatedId) : null;
      const relOk = rel && typeOf(rel) !== typeOf(it) && rel.reportedBy === c.userEmail;
      const itemDone = isRecovered(it);
      const claimWord = typeOf(it) === "found" ? "Claim" : "Response";
      let actions = "";
      if(c.status === "pending") actions += `<button type="button" class="btn btn-secondary btn-sm" data-claim-action="review" data-claim="${esc(c.id)}">👁 Mark reviewed</button>`;
      if(c.status !== "resolved"){
        actions += itemDone
          ? `<button type="button" class="btn btn-secondary btn-sm" data-claim-action="close" data-claim="${esc(c.id)}">✓ Mark resolved</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-claim-action="resolve" data-claim="${esc(c.id)}">✓ ${typeOf(it) === "found" ? "Confirm return" : "Confirm I got it back"}${relOk && !isRecovered(rel) ? " &amp; mark both recovered" : " &amp; mark recovered"}</button>`;
      }
      return `<article class="claim-card status-${c.status}">
        <div class="claim-card-head">${typePill(it)}<a class="claim-item" href="item-details.html?id=${encodeURIComponent(it.id)}">${esc(it.name)}</a>${statusBadge(it)}${claimStatusBadge(c.status)}</div>
        <dl class="claim-facts">
          <div><dt>${claimWord} from</dt><dd>${esc(c.userName)} · <a href="mailto:${encodeURIComponent(c.userEmail)}?subject=${encodeURIComponent(`About your ${claimWord.toLowerCase()} for "${it.name}"`)}">✉ ${esc(c.userEmail)}</a></dd></div>
          <div><dt>Sent</dt><dd>${esc(fmtDateTime(c.date))}</dd></div>
          <div><dt>Their linked report</dt><dd>${relOk ? `<a href="item-details.html?id=${encodeURIComponent(rel.id)}">${esc(rel.name)}</a> (${typeOf(rel)}${isRecovered(rel) ? ", recovered" : ""})` : c.relatedId ? "Linked report no longer available" : "No report linked"}</dd></div>
        </dl>
        <blockquote class="claim-message">${c.message ? esc(c.message) : "<i>No message (sent with an earlier version of the site).</i>"}</blockquote>
        ${itemDone && c.status !== "resolved" ? `<p class="field-hint">Your report is already marked recovered.</p>` : ""}
        ${actions ? `<div class="claim-actions">${actions}</div>` : ""}
      </article>`;
    }).join("") : `<div class="empty-state compact"><div aria-hidden="true">📭</div><h3>No claims or responses${filter.value !== "all" ? ` marked “${filter.value}”` : ""}</h3><p>When someone responds to one of your reports in this browser, it appears here.</p></div>`;

    const sent = claims.filter(c => c.userEmail === me.email).sort((a, b) => b.date - a.date);
    sentBox.innerHTML = sent.length ? sent.map(c => {
      const it = byId.get(c.itemId);
      return `<li class="sent-claim"><div><b>${it ? `<a href="item-details.html?id=${encodeURIComponent(it.id)}">${esc(it.name)}</a>` : "Report deleted"}</b><small>${it ? `${typeOf(it) === "found" ? "Claim" : "Response"} · ` : ""}sent ${esc(fmtDateTime(c.date))}</small></div>${claimStatusBadge(c.status)}</li>`;
    }).join("") : `<li class="sent-empty">You haven't sent any claims or responses yet.</li>`;
  };

  recvBox.addEventListener("click",e=>{
    const b=e.target.closest("[data-claim-action]");if(!b)return;
    try{
      const me=user(),records=lfReadRecords(),c=records.claims.find(x=>x.id===b.dataset.claim),it=c&&records.items.find(x=>x.id===c.itemId);
      if(!c||!it||it.reportedBy!==me?.email)return;
      const action=b.dataset.claimAction;
      if(action==="review"){
        if(c.status!=="pending")throw new Error("This claim is no longer pending. Reload to see its status.");
        c.status="reviewed";c.updatedAt=Date.now();lfSaveRecords(records);
        setMessage(msg,`Marked ${c.userName}'s response as reviewed.`,"success");
      }else if(action==="close"){
        if(!isRecovered(it))throw new Error("Confirm the return before resolving this claim.");
        if(!confirm("Mark this claim as resolved? No reports will be changed."))return;
        c.status="resolved";c.updatedAt=Date.now();lfSaveRecords(records);setMessage(msg,"Claim marked as resolved.","success");
      }else if(action==="resolve"){
        const rel=c.relatedId?records.items.find(x=>x.id===c.relatedId):null;
        const pair=rel&&typeOf(rel)!==typeOf(it)&&rel.reportedBy===c.userEmail&&!isRecovered(rel);
        const question=pair?`Confirm that “${it.name}” and ${c.userName}'s “${rel.name}” are the same returned item? Both reports and their claims will be resolved.`:`Confirm that “${it.name}” has been returned? Its report and claims will be resolved.`;
        if(!confirm(question))return;
        const saved=recoverReport(it.id,c.id);
        setMessage(msg,saved.related?`“${saved.item.name}” and “${saved.related.name}” are recovered and their claims are resolved.`:`“${saved.item.name}” is recovered and its claims are resolved.`,"success");
      }
      render();lfUpdateClaimsBadge();
    }catch(error){setMessage(msg,error.message)}
  });
  filter.addEventListener("change",()=>{try{render()}catch(error){setMessage(msg,error.message)}});
  render();
  if(location.hash === "#sent") document.getElementById("sentTitle").scrollIntoView();
}

/* ---------- Dashboard ---------- */
async function initDashboard(){
  const total = document.getElementById("totalCount"); if(!total) return;
  const u = user(), x = getItems(), open = x.filter(i => !isRecovered(i));
  total.textContent = x.filter(isRecovered).length;
  document.getElementById("lostCount").textContent = open.filter(i => typeOf(i) === "lost").length;
  document.getElementById("foundCount").textContent = open.filter(i => typeOf(i) === "found").length;
  const claimsAlert = document.getElementById("claimsAlert");
  if(claimsAlert && u){
    const mineIds = new Set(x.filter(i => i.reportedBy === u.email).map(i => i.id));
    const pending = getClaims().filter(c => mineIds.has(c.itemId) && c.status === "pending").length;
    claimsAlert.hidden = !pending;
    if(pending) claimsAlert.innerHTML = `<a class="claims-alert" href="claims.html"><span aria-hidden="true">📨</span> You have <b>${pending}</b> pending claim${pending === 1 ? "" : "s"} or response${pending === 1 ? "" : "s"} to review <span aria-hidden="true">→</span></a>`;
  }
  const forYou = document.getElementById("matchesForYou");
  if(forYou && u){
    const rows = lfNewestFirst(open.filter(i => i.reportedBy === u.email))
      .map(i => ({ item: i, matches: findMatches(i, x) })).filter(r => r.matches.length);
    forYou.hidden = !rows.length;
    if(rows.length) forYou.innerHTML = `<div class="section-heading compact"><div><span class="eyebrow">SMART MATCHING</span><h2>Matches for you</h2></div></div>`
      + `<ul class="for-you-list">${rows.map(r => { const best = r.matches[0], cat = lfCategory(r.item.category), [level] = matchLevel(best.score);
        return `<li><a class="for-you" href="item-details.html?id=${encodeURIComponent(r.item.id)}#matches"><span class="for-you-icon" aria-hidden="true">${cat.icon}</span><span class="for-you-text"><strong>Your ${typeOf(r.item)} “${esc(r.item.name)}”</strong><small>${r.matches.length} possible match${r.matches.length === 1 ? "" : "es"} · best: ${esc(best.item.name)}</small></span><span class="match-score ${level}">${best.score}/100</span><span class="for-you-go" aria-hidden="true">→</span></a></li>`; }).join("")}</ul>`;
  }
  document.getElementById("mineCount").textContent = u ? x.filter(i => i.reportedBy === u.email).length : 0;
  const recent = document.getElementById("recentItems");
  if(recent){
    const bag = [];
    const html = open.length ? (await Promise.all(lfNewestFirst(open).slice(0, 3).map(i => card(i, { bag })))).join("") : `<div class="empty-state"><h3>${x.length ? "No open reports" : "No reports yet"}</h3><p>${x.length ? "Everything reported so far has been recovered." : "Be the first to add one."}</p></div>`;
    commit(recent, html, bag);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try{
    await Promise.all([initReport(), initItems(), initDetails(), initMine(), initDashboard(), initRecovered(), initClaims()]);
  }catch(err){lfShowStorageError(err);document.querySelectorAll(".loading-state,.skeleton-card").forEach(el=>el.hidden=true);}
  const u = user(), name = document.getElementById("userName"), av = document.getElementById("avatar");
  if(name && u && u.name){ name.textContent = u.name.split(" ")[0]; if(av) av.textContent = u.name[0].toUpperCase(); }
});
