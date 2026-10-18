const USERS_KEY="lf_users", CURRENT_KEY="lf_currentUser";
function getUsers(){return lfReadArray(USERS_KEY,u=>u&&["id","name","email","password"].every(k=>typeof u[k]==="string"))}
function saveUsers(u){lfWrite(USERS_KEY,u)}
function currentUser(){return lfCurrentUser()}
function sessionUser(u){return {id:u.id,name:u.name,email:u.email}}
function requireAuth(){if(!currentUser()){goToLogin();return false}return true}
function showError(id,msg){const e=document.getElementById(id);if(e){e.textContent=msg;e.classList.add("show")}}
const LOGIN_NOTICES={"dashboard.html":"Please log in to open your dashboard.","my-reports.html":"Please log in to see your reports.","report.html":"Please log in to report an item.","items.html":"Please log in to browse lost and found reports.","item-details.html":"Please log in to view this report.","recovered.html":"Please log in to see recovered items.","claims.html":"Please log in to review claims and responses."};

// Field checks shared by login and sign-up. Returns true when every field is valid.
function checkFields(form,checks){
  lfClearFieldErrors(form);
  const failed=checks.filter(([,bad])=>bad);
  failed.forEach(([el,,msg])=>lfFieldError(el,msg));
  if(failed.length)failed[0][0].focus();
  return !failed.length;
}

document.addEventListener("DOMContentLoaded",()=>{
 const lf=location.pathname.split("/").pop();
 if(["dashboard.html","report.html","my-reports.html"].includes(lf)) requireAuth();
 const next=safeNext(new URLSearchParams(location.search).get("next")||"");
 if(next){
  const notice=document.getElementById("loginNotice");
  if(notice){notice.textContent=LOGIN_NOTICES[next.split("?")[0]]||"Please log in to continue.";notice.hidden=false}
  document.querySelectorAll('a[href="register.html"],a[href="login.html"]').forEach(a=>a.setAttribute("href",a.getAttribute("href")+"?next="+encodeURIComponent(next)));
 }
 const login=document.getElementById("loginForm");
 if(login){
  login.addEventListener("input",e=>{lfClearFieldError(e.target);document.getElementById("loginError").textContent=""});
  login.addEventListener("submit",e=>{
   e.preventDefault();
   const emailEl=document.getElementById("loginEmail"),passEl=document.getElementById("loginPassword");
   const email=emailEl.value.trim().toLowerCase(),pass=passEl.value;
   if(!checkFields(login,[
    [emailEl,!email,"Email is required."],
    [emailEl,!!email&&!LF_EMAIL_RE.test(email),"Please enter a valid email address."],
    [passEl,!pass,"Password is required."]
   ]))return;
   try{
    const u=getUsers().find(x=>x.email===email&&x.password===pass);
    if(!u)return showError("loginError","Email or password is incorrect.");
    lfWrite(CURRENT_KEY,sessionUser(u));location.href=next||"dashboard.html";
   }catch(error){showError("loginError",error.message)}
  });
 }
 const reg=document.getElementById("registerForm");
 if(reg){
  reg.addEventListener("input",e=>{lfClearFieldError(e.target);document.getElementById("registerError").textContent=""});
  reg.addEventListener("submit",e=>{
   e.preventDefault();
   const nameEl=document.getElementById("registerName"),emailEl=document.getElementById("registerEmail"),passEl=document.getElementById("registerPassword");
   const name=nameEl.value.trim().replace(/\s+/g," "),email=emailEl.value.trim().toLowerCase(),password=passEl.value;
   if(!checkFields(reg,[
    [nameEl,!name,"Full name is required."],
    [nameEl,!!name&&name.length<2,"Name must be at least 2 characters."],
    [nameEl,name.length>60,"Name must be 60 characters or fewer."],
    [emailEl,!email,"Email is required."],
    [emailEl,!!email&&!LF_EMAIL_RE.test(email),"Please enter a valid email address."],
    [passEl,!password,"Password is required."],
    [passEl,!!password&&password.length<6,"Password must be at least 6 characters."]
   ].filter((c,i,all)=>c[1]&&all.findIndex(x=>x[0]===c[0]&&x[1])===i)))return;
   let accountSaved=false;
   try{
    const users=getUsers();
    if(users.some(x=>x.email===email))return showError("registerError","An account with this email already exists. Try logging in instead.");
    const u={id:crypto.randomUUID?crypto.randomUUID():Date.now().toString(),name,email,password};
    users.push(u);saveUsers(users);accountSaved=true;lfWrite(CURRENT_KEY,sessionUser(u));location.href=next||"dashboard.html";
   }catch(error){showError("registerError",accountSaved?"Your account was saved on this device, but sign-in failed. Keep your details and use Log in to try again.":error.message)}
  });
 }
});
