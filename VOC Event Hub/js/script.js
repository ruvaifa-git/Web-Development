const faqItems = document.querySelectorAll('.faq-item');
const form = document.getElementById('register-form');
const navToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

faqItems.forEach((item) => {
  const trigger = item.querySelector('.faq-question');
  const answer = item.querySelector('.faq-answer');

  trigger.addEventListener('click', () => {
    const isOpen = item.classList.contains('active');

    faqItems.forEach((faqItem) => {
      faqItem.classList.remove('active');
      faqItem.querySelector('.faq-answer').hidden = true;
      faqItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      item.classList.add('active');
      answer.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ---------- Registration (frontend only: saved in this browser's localStorage) ---------- */
const REG_KEY = 'vosc_registrations';
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const confirmation = document.getElementById('confirmation');
const countdownEl = document.getElementById('countdown');
const eventConfig = window.VOSC_EVENT || {};
const eventInfo = {
  start: parseEventDate(eventConfig.start || ''),
  end: parseEventDate(eventConfig.end || ''),
  timeZone: eventConfig.timeZone || 'Asia/Kolkata',
  venue: eventConfig.venue || 'Venue to be announced',
};

function parseEventDate(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return new Date(NaN);
  const day=value.slice(0,10),civil=new Date(day+'T00:00:00Z');
  if(Number.isNaN(civil.getTime())||civil.toISOString().slice(0,10)!==day)return new Date(NaN);
  return new Date(value);
}
function hasEventDates(){
  if(!Number.isFinite(eventInfo.start.getTime())||!Number.isFinite(eventInfo.end.getTime())||eventInfo.end<=eventInfo.start)return false;
  try{new Intl.DateTimeFormat('en',{timeZone:eventInfo.timeZone}).format(eventInfo.start);return true}catch(error){return false}
}
function readStoredArray(key,valid){
  const raw=localStorage.getItem(key);if(raw===null)return [];
  try{const list=JSON.parse(raw);if(!Array.isArray(list)||!list.every(valid))throw new Error();return list}
  catch(error){throw new Error('Saved demo data could not be read. Existing data has been kept. Keep this page open and check browser storage before trying again.')}
}
function showStorageProblem(){showFormMessage('<strong>Demo data was not saved.</strong><span>Browser storage may be full, disabled or contain unreadable data. Existing records and your entered details have been kept. Keep this page open and check browser storage.</span>','error')}

function formatEventDate(date) {
  if (!hasEventDates()) return 'Date to be announced';
  try {
    const parts = {};
    new Intl.DateTimeFormat('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: eventInfo.timeZone, timeZoneName: 'short',
    }).formatToParts(date).forEach((part) => { parts[part.type] = part.value; });
    return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} · ${parts.hour}:${parts.minute} ${(parts.dayPeriod || '').toUpperCase()} ${parts.timeZoneName || ''}`.replace(/\s+/g, ' ').trim();
  } catch (error) {
    return date.toLocaleString();
  }
}

// Compare emails the way the mail provider does: case-insensitive, and for Gmail also ignore dots and "+tags"
// (priya.sharma+vosc@gmail.com and priyasharma@gmail.com reach the same inbox).
function canonicalEmail(email) {
  const [local = '', domain = ''] = String(email).trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return `${local}@${domain}`;
}

function findRegistration(email) {
  const key = canonicalEmail(email);
  return getRegistrations().find((entry) => canonicalEmail(entry.email) === key);
}

/* ---------- Event summary, calendar links ---------- */
function eventDay(date) {
  if (!hasEventDates()) return 'To be announced';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: eventInfo.timeZone }).format(date);
}
function eventTimeRange(start, end) {
  if (!hasEventDates()) return 'To be announced';
  const t = (d, zone) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: eventInfo.timeZone, ...(zone ? { timeZoneName: 'short' } : {}) }).format(d).toUpperCase();
  return Number.isNaN(end.getTime()) ? t(start, true) : `${t(start)} – ${t(end, true)}`;
}
const eventEnd = () => eventInfo.end;
const calStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const EVENT_TITLE = 'VOSC Event Hub – Domain Discovery Workshop';
function googleCalendarUrl(ref) {
  if(!hasEventDates())return "";
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: EVENT_TITLE,
    dates: `${calStamp(eventInfo.start)}/${calStamp(eventEnd())}`,
    details: `Your local VOSC demo record${ref ? ` (reference ${ref})` : ''}. Bring a laptop for the hands-on sessions.`,
    location: eventInfo.venue,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
function downloadIcs(ref) {
  if(!hasEventDates())return false;
  const escText = (v) => String(v).replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VOSC Event Hub//Frontend//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${ref || Date.now()}@vosc-event-hub`, `DTSTAMP:${calStamp(new Date())}`,
    `DTSTART:${calStamp(eventInfo.start)}`, `DTEND:${calStamp(eventEnd())}`,
    `SUMMARY:${escText(EVENT_TITLE)}`, `LOCATION:${escText(eventInfo.venue)}`,
    `DESCRIPTION:${escText(`Your local VOSC demo record${ref ? ` (reference ${ref})` : ''}.`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'VOSC-Event-Hub-demo.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fillEventSummary() {
  const set = (key, text) => document.querySelectorAll(`[data-summary="${key}"]`).forEach((el) => { el.textContent = text; });
  set('date', eventDay(eventInfo.start));
  set('time', eventTimeRange(eventInfo.start, eventInfo.end));
  set('venue', eventInfo.venue);
}

function getRegistrations(){
  return readStoredArray(REG_KEY,e=>e&&['name','email','ref'].every(k=>typeof e[k]==='string'&&!!e[k])&&(e.role===undefined||typeof e.role==='string'));
}

function saveRegistration(entry) {
  const list = getRegistrations();
  list.push(entry);
  localStorage.setItem(REG_KEY, JSON.stringify(list));
}

function makeTicketRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return `VOSC-26-${Array.from(bytes, (b) => chars[b % chars.length]).join('')}`;
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  if (error) error.textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

// Inline feedback above the form (replaces alert() popups). type: error | warning
function showFormMessage(html, type) {
  const message = document.getElementById('register-message');
  if (!message) return;
  message.innerHTML = html;
  message.className = `form-message is-${type}`;
  message.hidden = false;
}

function hideFormMessage() {
  const message = document.getElementById('register-message');
  if (message) message.hidden = true;
}

function validateName(value) {
  if (!value) return 'Please enter your full name.';
  if (value.length < 2) return 'Name must be at least 2 characters.';
  if (value.length > 80) return 'Name must be 80 characters or fewer.';
  if (!NAME_RE.test(value)) return 'Name can only contain letters, spaces, dots, apostrophes and hyphens.';
  return '';
}

function validateEmail(value) {
  if (!value) return 'Please enter your email address.';
  if (value.length > 254 || !EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return '';
}

function showConfirmation(entry) {
  if (!confirmation) {
    window.location.href = `dashboard.html?ref=${encodeURIComponent(entry.ref)}`;
    return;
  }
  const roleLabel = entry.role ? entry.role.charAt(0).toUpperCase() + entry.role.slice(1) : 'Participant';
  document.getElementById('confirm-name').textContent = entry.name;
  document.getElementById('confirm-email').textContent = entry.email;
  document.getElementById('ticket-name').textContent = entry.name;
  document.getElementById('ticket-role').textContent = roleLabel;
  document.getElementById('ticket-date').textContent = formatEventDate(eventInfo.start);
  document.getElementById('ticket-venue').textContent = eventInfo.venue;
  document.getElementById('ticket-ref').textContent = entry.ref;
  confirmation.dataset.ref = entry.ref;
  const gcal = document.getElementById('gcal-link');
  const hasDate = hasEventDates();
  if (gcal) { gcal.href = googleCalendarUrl(entry.ref); gcal.hidden = !hasDate; }
  const ics = document.getElementById('ics-download');
  if (ics) ics.hidden = !hasDate;
  const returning = document.getElementById('returning');
  if (returning) returning.hidden = true;
  if (form) form.hidden = true;
  hideFormMessage();
  confirmation.hidden = false;
  confirmation.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  document.getElementById('confirm-title').focus({ preventScroll: true });
  document.getElementById('registrationStatus').textContent='Demo registration saved on this device. Organisers have not received it; no seat is reserved.';
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

if (form) {
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const roleInput = document.getElementById('role');
  const submitBtn = form.querySelector('button[type="submit"]');
  const returning = document.getElementById('returning');

  // Returning visitor: this browser already registered someone, so say so before they fill in the form again.
  const showReturning = () => {
    const list = getRegistrations();
    const last = list[list.length - 1];
    if (!last || !returning) return;
    document.getElementById('returning-name').textContent = last.name;
    document.getElementById('returning-email').textContent = last.email;
    returning.hidden = false;
    form.hidden = true;
    document.getElementById('returning-ticket').onclick = () => showConfirmation(last);
  };
  if (returning) {
    document.getElementById('returning-new').addEventListener('click', () => {
      returning.hidden = true;
      form.hidden = false;
      nameInput.focus();
    });
    try{showReturning()}catch(error){showStorageProblem()}
  }

  // Clear a field's error as soon as the user edits it; re-check filled fields when they leave them.
  [nameInput, emailInput].forEach((input) => {
    input.addEventListener('input', () => { setFieldError(input, ''); hideFormMessage(); });
    input.addEventListener('blur', () => {
      const value = input.value.trim();
      if (!value) return;
      setFieldError(input, input === nameInput ? validateName(value) : validateEmail(value));
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // Ignore double clicks / repeated Enter presses while a registration is being handled.
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    submitBtn.disabled = true;
    const release = () => { setTimeout(() => { form.dataset.busy = ''; submitBtn.disabled = false; }, 400); };

    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    const email = emailInput.value.trim().toLowerCase();
    const nameError = validateName(name);
    let emailError = validateEmail(email);

    let existing;
    try{existing=!emailError&&findRegistration(email)}catch(error){showStorageProblem();release();return}
    if (existing) emailError = 'This email already has a demo record on this device.';

    setFieldError(nameInput, nameError);
    setFieldError(emailInput, emailError);

    if (existing && !nameError) {
      showFormMessage(
        '<strong>Already saved on this device</strong><span>A demo record with this email is stored here. Organisers have not received it.</span><button type="button" class="link-btn" id="show-ticket">Show my demo ticket</button>',
        'warning'
      );
      document.getElementById('show-ticket').addEventListener('click', () => showConfirmation(existing));
      emailInput.focus();
      release();
      return;
    }

    if (nameError || emailError) {
      showFormMessage(`<strong>Please check the form.</strong><span>${nameError && emailError ? 'Two fields need your attention.' : 'One field needs your attention.'}</span>`, 'error');
      (nameError ? nameInput : emailInput).focus();
      release();
      return;
    }

    // Frontend demo: no form action, email or organiser submission is performed.
    const entry = { name, email, role: roleInput.value, ref: makeTicketRef(), registeredAt: new Date().toISOString() };
    try {
      saveRegistration(entry);
    } catch (error) {
      showStorageProblem();
      release();
      return;
    }
    form.reset();
    showConfirmation(entry);
    release();
  });

}

if (confirmation) {
  document.getElementById('download-ticket').addEventListener('click', downloadTicket);
  document.getElementById('ics-download').addEventListener('click', () => downloadIcs(confirmation.dataset.ref));
}

/* ---------- Downloadable ticket (drawn on a canvas, saved as PNG) ---------- */
function fitText(ctx, text, maxWidth, startSize, weight) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 18);
  let out = text;
  while (ctx.measureText(out).width > maxWidth && out.length > 1) out = out.slice(0, -2) + '…';
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function downloadTicket() {
  const name = document.getElementById('ticket-name').textContent;
  const role = document.getElementById('ticket-role').textContent;
  const ref = document.getElementById('ticket-ref').textContent;
  const W = 1200, H = 520, stubX = 900;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1d4ed8');
  roundRect(ctx, 0, 0, W, H, 36); ctx.fillStyle = bg; ctx.fill();

  ctx.setLineDash([10, 12]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(stubX, 40); ctx.lineTo(stubX, H - 40); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = '#93c5fd'; ctx.font = 'bold 26px Arial, sans-serif'; ctx.fillText('VOSC EVENT HUB', 70, 95);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '24px Arial, sans-serif'; ctx.fillText('Domain Discovery Workshop', 70, 135);
  ctx.fillStyle = '#ffffff';
  const shownName = fitText(ctx, name, stubX - 140, 64, 'bold');
  ctx.fillText(shownName, 70, 225);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '26px Arial, sans-serif'; ctx.fillText(role, 70, 270);
  ctx.fillStyle = '#ffffff'; ctx.font = '26px Arial, sans-serif';
  ctx.fillText(fitText(ctx, `Date: ${formatEventDate(eventInfo.start)}`, stubX - 140, 26, 'normal'), 70, 340);
  ctx.fillText(fitText(ctx, `Venue: ${eventInfo.venue}`, stubX - 140, 26, 'normal'), 70, 382);
  roundRect(ctx, 70, 418, 370, 56, 28); ctx.fillStyle = '#22c55e'; ctx.fill();
  ctx.fillStyle = '#052e16'; ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillText('DEMO — local record', 98, 455);

  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText('REF', stubX + 50, 200);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px Arial, sans-serif'; ctx.fillText(fitText(ctx, ref, W - stubX - 90, 26, 'bold'), stubX + 50, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '16px Arial, sans-serif';
  ctx.fillText('For reference only —', stubX + 50, 400); ctx.fillText('not valid for admission.', stubX + 50, 424);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ref || 'VOSC-ticket'}-demo.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/* ---------- Countdown ---------- */
function startCountdown() {
  if (!countdownEl) return;
  const title = document.getElementById('countdown-title');
  const timer = document.getElementById('countdown-timer');
  const status = document.getElementById('countdown-status');
  const sr = document.getElementById('countdown-sr');
  const nums = {};
  timer.querySelectorAll('[data-unit]').forEach((el) => { nums[el.dataset.unit] = el; });
  document.getElementById('event-date').textContent = formatEventDate(eventInfo.start);
  document.getElementById('event-venue').textContent = eventInfo.venue;

  if (!hasEventDates()) {
    title.textContent='Date to be announced';timer.hidden=true;status.hidden=false;status.textContent='The event date and venue are awaiting confirmation.';
    document.getElementById('event-date').removeAttribute('datetime');return;
  }
  document.getElementById('event-date').setAttribute('datetime',eventInfo.start.toISOString());
  const end = eventInfo.end;
  let lastMinute = -1;
  let intervalId = 0;

  const tick = () => {
    const now = Date.now();
    const diff = eventInfo.start.getTime() - now;
    if (diff <= 0) {
      timer.hidden = true;
      status.hidden = false;
      countdownEl.classList.add(now < end.getTime() ? 'is-live' : 'is-over');
      if (now < end.getTime()) {
        title.textContent = 'VOSC is happening now!';
        status.textContent = 'Sessions are under way — see the schedule below.';
      } else {
        title.textContent = 'VOSC has ended';
        status.textContent = 'Thank you to everyone who took part.';
        clearInterval(intervalId);
      }
      sr.textContent = title.textContent;
      return;
    }
    const s = Math.floor(diff / 1000);
    const parts = { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
    Object.entries(parts).forEach(([unit, value]) => { nums[unit].textContent = String(value).padStart(2, '0'); });
    if (parts.minutes !== lastMinute) {
      lastMinute = parts.minutes;
      sr.textContent = `VOSC starts in ${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes.`;
    }
  };
  tick();
  intervalId = setInterval(tick, 1000);
}
startCountdown();
fillEventSummary();

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('is-open');
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isExpanded));
  });

  // Close the mobile menu once a link has been chosen.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&navToggle.getAttribute('aria-expanded')==='true'){navLinks.classList.remove('is-open');navToggle.setAttribute('aria-expanded','false');navToggle.focus()}});
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


/* ---------- Highlight the section currently in view ---------- */
if ('IntersectionObserver' in window && navLinks) {
  const linkFor = {};
  navLinks.querySelectorAll('a[href^="#"]').forEach((link) => { linkFor[link.getAttribute('href').slice(1)] = link; });
  const sections = Object.keys(linkFor).map((id) => document.getElementById(id)).filter(Boolean);
  const setActive = (id) => {
    Object.entries(linkFor).forEach(([key, link]) => {
      const active = key === id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((section) => observer.observe(section));
  // Nothing is highlighted while the hero is in view.
  const hero = document.querySelector('.hero');
  if (hero) new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setActive(''); }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
}

/* ---------- Gentle fade-in for sections (skipped when reduced motion is preferred) ---------- */
if ('IntersectionObserver' in window && !prefersReducedMotion()) {
  const revealTargets = document.querySelectorAll('.content-section, .countdown');
  document.documentElement.classList.add('js-reveal');
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  revealTargets.forEach((el) => revealObserver.observe(el));
  // A section reached through a link (e.g. #register) should never stay hidden.
  window.addEventListener('hashchange', () => {
    const target = document.querySelector(location.hash);
    if (target) target.classList.add('is-visible');
  });
  // Safety net: never leave content hidden (printing, screenshots, or if the observer never fires).
  const revealAll = () => revealTargets.forEach((el) => el.classList.add('is-visible'));
  setTimeout(revealAll, 2500);
  window.addEventListener('beforeprint', revealAll);
}


/* ---------- My Agenda: pick sessions from the schedule (saved in localStorage) ---------- */
const AGENDA_KEY = 'vosc_agenda';
const sessionCards = Array.from(document.querySelectorAll('.schedule-card[data-session-id]'));
const sessions = sessionCards.map((card) => ({
  id: card.dataset.sessionId,
  start: card.dataset.start,
  title: card.querySelector('h3').textContent.trim(),
  desc: card.querySelector('p').textContent.trim(),
  card,
}));

// Only known session ids are kept, each at most once, so corrupted or old data can't break the page.
function loadAgenda(){
  const saved=readStoredArray(AGENDA_KEY,id=>typeof id==='string');
  return sessions.filter(s=>saved.includes(s.id)).map(s=>s.id);
}
function saveAgenda(ids) {
  try {
    localStorage.setItem(AGENDA_KEY, JSON.stringify(Array.from(new Set(ids))));
    return true;
  } catch (error) {
    return false;
  }
}

function renderAgenda() {
  let ids;try{ids=loadAgenda()}catch(error){alertAgendaError(error.message);return;}
  sessions.forEach((s) => {
    const on = ids.includes(s.id);
    const btn = s.card.querySelector('.agenda-btn');
    s.card.classList.toggle('is-selected', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.agenda-icon').textContent = on ? '✓' : '＋';
    btn.querySelector('.agenda-label').textContent = on ? 'In My Agenda — remove' : 'Add to My Agenda';
  });
  const list = document.getElementById('agenda-list');
  const clear = document.getElementById('agenda-clear');
  if (!list) return;
  const chosen = sessions.filter((s) => ids.includes(s.id)).sort((a, b) => a.start.localeCompare(b.start));
  clear.hidden = !chosen.length;
  list.innerHTML = chosen.length
    ? chosen.map((s) => `<li class="agenda-item"><span class="agenda-time"><time>${s.start}</time></span><div class="agenda-text"><strong>${s.title}</strong><span>${s.desc}</span></div><button type="button" class="agenda-remove" data-remove="${s.id}">Remove<span class="sr-only">: ${s.title}</span></button></li>`).join('')
    : '<li class="agenda-empty"><span aria-hidden="true">🗓️</span><div><strong>No sessions in your agenda yet.</strong><span>Use “Add to My Agenda” on the <a href="#schedule">schedule</a> to build your day.</span></div></li>';
}

function announceAgenda(text) {
  const status = document.getElementById('agenda-status');
  if (status) status.textContent = text;
}

function toggleSession(id) {
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  let ids;try{ids=loadAgenda()}catch(error){alertAgendaError(error.message);return;}
  const adding = !ids.includes(id);
  const next = adding ? ids.concat(id) : ids.filter((x) => x !== id);
  if (!saveAgenda(next)) {
    announceAgenda('Could not save your agenda. Browser storage may be full or turned off.');
    alertAgendaError();
    return;
  }
  renderAgenda();
  announceAgenda(adding ? `${session.title} added to My Agenda.` : `${session.title} removed from My Agenda.`);
}

function alertAgendaError(message='Could not save your agenda. Browser storage may be full or turned off.'){
  const list=document.getElementById('agenda-list');if(!list)return;
  let box=document.getElementById('agenda-error');
  if(!box){box=document.createElement('p');box.id='agenda-error';box.className='form-message is-error agenda-error';box.setAttribute('role','alert');list.before(box)}
  box.textContent=message;
}

if (sessions.length) {
  sessionCards.forEach((card) => card.querySelector('.agenda-btn').addEventListener('click', () => toggleSession(card.dataset.sessionId)));
  document.getElementById('agenda-list')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove]');
    if (!btn) return;
    toggleSession(btn.dataset.remove);
    document.getElementById('agenda-title').focus?.();
  });
  document.getElementById('agenda-clear')?.addEventListener('click', () => {
    try{loadAgenda()}catch(error){alertAgendaError(error.message);return;}
    if (!confirm('Remove all sessions from My Agenda?')) return;
    if (!saveAgenda([])) { alertAgendaError(); return; }
    renderAgenda();
    announceAgenda('My Agenda cleared.');
  });
  // Keep two open tabs in sync.
  window.addEventListener('storage', (event) => { if (event.key === AGENDA_KEY) renderAgenda(); });
  renderAgenda();
}

/* ---------- "Now" / "Up next" on the schedule, based on the configured event date and time zone ---------- */
function sessionDate(hhmm) {
  const iso = eventConfig.start || '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T[\d:]+(Z|[+-]\d{2}:\d{2})$/);
  if (!m || !/^\d{2}:\d{2}$/.test(hhmm || '')) return null;
  const d = new Date(`${m[1]}T${hhmm}:00${m[2]}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function updateSessionFlags() {
  const now = Date.now();
  const start = eventInfo.start.getTime();
  const end = eventEnd().getTime();
  const timed = sessions.map((s) => ({ ...s, at: sessionDate(s.start) })).filter((s) => s.at);
  let current = null;
  let next = null;
  if (hasEventDates() && now >= start && now < end && timed.length === sessions.length) {
    timed.forEach((s) => { if (s.at.getTime() <= now) current = s; });
    next = timed.find((s) => s.at.getTime() > now) || null;
  }
  sessions.forEach((s) => {
    const flag = s.card.querySelector('.session-flag');
    const label = current && s.id === current.id ? 'Happening now' : next && s.id === next.id ? 'Up next' : '';
    flag.hidden = !label;
    flag.textContent = label;
    flag.className = `session-flag${label === 'Happening now' ? ' is-now' : ''}`;
    s.card.classList.toggle('is-now', label === 'Happening now');
  });
}
if (sessions.length) {
  updateSessionFlags();
  setInterval(updateSessionFlags, 60 * 1000);
}

/* ---------- Saved registration dashboard ---------- */
function renderRegistrationDashboard() {
  if (!document.querySelector('[data-registration-dashboard]')) return;
  const empty = document.getElementById('dashboard-empty');
  const records = document.getElementById('dashboard-records');
  const select = document.getElementById('registration-select');
  let list;
  try { list = getRegistrations(); } catch (error) {
    empty.hidden = true; records.hidden = true; showStorageProblem(); return;
  }
  hideFormMessage();
  empty.hidden = !!list.length; records.hidden = !list.length;
  if (!list.length) { confirmation.hidden = true; return; }
  const selected = select.value || new URLSearchParams(location.search).get('ref');
  select.replaceChildren();
  list.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.ref; option.textContent = `${entry.name} (${entry.email})`;
    select.appendChild(option);
  });
  const entry = list.find((entry) => entry.ref === selected) || list[list.length - 1];
  select.value = entry.ref;
  showConfirmation(entry);
}
document.getElementById('registration-select')?.addEventListener('change', (event) => {
  history.replaceState(null, '', `dashboard.html?ref=${encodeURIComponent(event.target.value)}`);
  renderRegistrationDashboard();
});
window.addEventListener('storage', (event) => { if (event.key === REG_KEY || event.key === null) renderRegistrationDashboard(); });
renderRegistrationDashboard();

/* ---------- Optional published Google Form; local contact page is the default ---------- */
function googleFormUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (url.hostname === 'forms.gle' && url.pathname.length > 1) return url.href;
    if (url.hostname === 'docs.google.com' && /^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[^/]+\/viewform\/?$/.test(url.pathname)) return url.href;
  } catch (error) { /* Keep the functioning local contact page. */ }
  return '';
}
const contactFormUrl = googleFormUrl(eventConfig.contactFormUrl || '');
if (contactFormUrl) {
  document.querySelectorAll('[data-contact-link]').forEach((link) => {
    link.href = contactFormUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Contact us (opens Google Forms in a new tab)');
  });
  const link = document.getElementById('google-form-link');
  if (link) { link.href = contactFormUrl; document.getElementById('google-form-wrap').hidden = false; }
}
