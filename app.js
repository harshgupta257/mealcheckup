'use strict';

const $ = (s) => document.querySelector(s);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('meals:' + key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('meals:' + key, JSON.stringify(value)); } catch {}
  },
};

const DEFAULT_MEALS = [
  { id: 'breakfast', name: 'Breakfast', emoji: '🍳', time: '08:30', on: true },
  { id: 'lunch', name: 'Lunch', emoji: '🥗', time: '13:30', on: true },
  { id: 'snack', name: 'Snack', emoji: '🍎', time: '17:00', on: false },
  { id: 'dinner', name: 'Dinner', emoji: '🍲', time: '20:00', on: true },
];

let meals = store.get('schedule', DEFAULT_MEALS);
let log = store.get('log', {});           // { 'YYYY-MM-DD': { mealId: eatenTimestamp } }
let notified = store.get('notified', {}); // { 'YYYY-MM-DD': ['mealId@HH:MM'] }
let swReg = null;

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const fmtClock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const relative = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const activeMeals = () => meals.filter((m) => m.on && m.time).sort((a, b) => toMin(a.time) - toMin(b.time));
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function pruneOld() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const min = dayKey(cutoff);
  for (const k of Object.keys(log)) if (k < min) delete log[k];
  store.set('log', log);
}

// ---------- checklist ----------
function setEaten(id, force) {
  const k = dayKey();
  log[k] = log[k] || {};
  const eaten = force ?? !log[k][id];
  if (eaten) log[k][id] = Date.now(); else delete log[k][id];
  store.set('log', log);
  renderToday();
  renderHistory();
}

function renderToday() {
  $('#today-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const list = activeMeals();
  const today = log[dayKey()] || {};
  const now = nowMin();
  const eaten = list.filter((m) => today[m.id]).length;

  $('#eaten-count').textContent = eaten;
  $('#total-count').textContent = '/' + list.length;

  const C = 2 * Math.PI * 50;
  const ring = $('#ring-fill');
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - (list.length ? eaten / list.length : 0));

  const due = list.find((m) => !today[m.id] && now >= toMin(m.time) && now < toMin(m.time) + 60);
  const next = list.find((m) => !today[m.id] && toMin(m.time) >= now);
  $('#next-meal').textContent =
    !list.length ? 'No meals scheduled'
    : eaten === list.length ? 'All done for today 🎉'
    : due ? `${due.name} is due now`
    : next ? `Next: ${next.name} in ${relative(toMin(next.time) - now)}`
    : 'Nothing else scheduled today';

  const ul = $('#checklist');
  if (!list.length) {
    ul.innerHTML = '<li class="row empty">Add meals in Schedule</li>';
    return;
  }
  ul.innerHTML = list.map((m) => {
    const done = today[m.id];
    const late = !done && now > toMin(m.time) + 60;
    const sub = done ? `Eaten at ${fmtClock(done)}` : late ? `Missed · ${fmtTime(m.time)}` : fmtTime(m.time);
    return `<li class="row check-row ${done ? 'done' : ''}" data-id="${escapeHTML(m.id)}" role="checkbox" aria-checked="${!!done}" tabindex="0">
      <span class="emoji">${escapeHTML(m.emoji)}</span>
      <div class="row-main">
        <span class="row-title">${escapeHTML(m.name)}</span>
        <span class="row-sub ${late ? 'late' : ''}">${sub}</span>
      </div>
      <span class="check"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span>
    </li>`;
  }).join('');
}

$('#checklist').addEventListener('click', (e) => {
  const row = e.target.closest('.check-row');
  if (row) setEaten(row.dataset.id);
});
$('#checklist').addEventListener('keydown', (e) => {
  const row = e.target.closest('.check-row');
  if (row && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setEaten(row.dataset.id); }
});

// ---------- schedule ----------
function renderSchedule() {
  $('#schedule-list').innerHTML = meals.map((m, i) => `
    <li class="row sched-row" data-i="${i}">
      <input class="emoji-input" data-f="emoji" value="${escapeHTML(m.emoji)}" maxlength="8" aria-label="Icon">
      <input class="name-input" data-f="name" value="${escapeHTML(m.name)}" aria-label="Meal name">
      <input class="time-input" type="time" data-f="time" value="${m.time}" aria-label="Time">
      <input class="switch" type="checkbox" data-f="on" ${m.on ? 'checked' : ''} aria-label="Remind me">
      <button class="del" data-del="${i}" aria-label="Delete ${escapeHTML(m.name)}">−</button>
    </li>`).join('') +
    '<li class="row"><button class="link" id="add-meal">Add Meal</button></li>';
}

function onScheduleEdit(e) {
  const input = e.target.closest('input[data-f]');
  if (!input) return;
  const meal = meals[input.closest('.sched-row').dataset.i];
  const f = input.dataset.f;
  meal[f] = f === 'on' ? input.checked : input.value;
  if (f === 'name' && !meal.name.trim() && e.type === 'change') meal.name = 'Meal';
  store.set('schedule', meals);
  renderToday();
  renderHistory();
}
$('#schedule-list').addEventListener('input', onScheduleEdit);
$('#schedule-list').addEventListener('change', onScheduleEdit);

$('#schedule-list').addEventListener('click', (e) => {
  if (e.target.id === 'add-meal') {
    meals.push({ id: 'm' + Date.now(), name: 'Meal', emoji: '🍽️', time: '12:00', on: true });
    store.set('schedule', meals);
    renderSchedule(); renderToday(); renderHistory();
    const inputs = document.querySelectorAll('.name-input');
    inputs[inputs.length - 1].select();
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    // First tap arms the button (iOS style), second tap deletes
    if (!del.classList.contains('armed')) {
      document.querySelectorAll('.del.armed').forEach((b) => { b.classList.remove('armed'); b.textContent = '−'; });
      del.classList.add('armed');
      del.textContent = 'Delete';
      return;
    }
    meals.splice(del.dataset.del, 1);
    store.set('schedule', meals);
    renderSchedule(); renderToday(); renderHistory();
  }
});

// ---------- notifications ----------
const notifState = () => ('Notification' in window ? Notification.permission : 'unsupported');

function renderNotif() {
  const s = notifState();
  const needsHomeScreen = s === 'unsupported' && isIOS() && !isStandalone();
  $('#notif-status').textContent = {
    granted: 'On. You’ll be reminded at meal times.',
    denied: 'Blocked. Allow it in your browser settings.',
    default: 'Off',
    unsupported: needsHomeScreen ? 'Add to Home Screen first' : 'Not supported in this browser',
  }[s];
  $('#notif-btn').hidden = s !== 'default';

  const banner = $('#notif-banner');
  banner.classList.toggle('hidden', !(s === 'default' || needsHomeScreen));
  if (needsHomeScreen) {
    $('#banner-title').textContent = 'Install for reminders';
    $('#banner-sub').textContent = 'Tap Share, then Add to Home Screen.';
    $('#banner-btn').hidden = true;
  }
}

async function enableNotifs() {
  if (notifState() !== 'default') return;
  let p;
  try { p = await Notification.requestPermission(); } catch { p = 'denied'; }
  if (p !== 'granted') toast('Notifications were not allowed');
  renderNotif();
  if (p === 'granted') toast('Reminders are on');
}
$('#notif-btn').addEventListener('click', enableNotifs);
$('#banner-btn').addEventListener('click', enableNotifs);

async function notify(title, body, mealId) {
  if (document.visibilityState === 'visible') toast(`${title}`);
  if (notifState() !== 'granted') return;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: mealId || 'test', renotify: true, data: { mealId } };
  const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
  if (reg) {
    if (mealId) opts.actions = [{ action: 'eaten', title: 'Mark as eaten' }];
    return reg.showNotification(title, opts);
  }
  try { new Notification(title, opts); } catch {}
}

$('#test-btn').addEventListener('click', () => {
  if (notifState() === 'default') return enableNotifs().then(() => notify('🍽️ Test reminder', 'Notifications are working.'));
  if (notifState() !== 'granted') return toast('Notifications are not enabled');
  notify('🍽️ Test reminder', 'Notifications are working.');
});

function checkReminders() {
  const k = dayKey();
  const now = nowMin();
  const today = log[k] || {};
  if (!notified[k]) notified = { [k]: [] };

  for (const m of activeMeals()) {
    const t = toMin(m.time);
    const tag = `${m.id}@${m.time}`;
    // Fire within the first hour after the meal time, once per day, only if not already eaten
    if (now >= t && now < t + 60 && !today[m.id] && !notified[k].includes(tag)) {
      notified[k].push(tag);
      notify(`${m.emoji} Time for ${m.name}`, `It’s ${fmtTime(m.time)}. Don’t skip it!`, m.id);
    }
  }
  store.set('notified', notified);
  renderToday();
}

// ---------- calendar (.ics) ----------
const icsEsc = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

function downloadICS() {
  const list = activeMeals();
  if (!list.length) return toast('Turn on at least one meal');
  const start = dayKey().replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meals//Reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const m of list) {
    const hm = m.time.replace(':', '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}-${hm}@meals.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}T${hm}00`,
      'DURATION:PT15M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsEsc(`${m.emoji} ${m.name}`)}`,
      'DESCRIPTION:Meal reminder',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`Time for ${m.name}`)}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');

  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meal-reminders.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Open the file to add it to your calendar');
}
$('#ics-btn').addEventListener('click', downloadICS);

// ---------- history ----------
function renderHistory() {
  const list = activeMeals();
  const isFull = (k) => list.length > 0 && list.every((m) => (log[k] || {})[m.id]);

  let rows = '', eatenWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const day = log[dayKey(d)] || {};
    const n = list.filter((m) => day[m.id]).length;
    eatenWeek += n;
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long' });
    rows += `<li class="row">
      <div class="row-main">
        <span class="row-title">${label}</span>
        <span class="row-sub">${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
      </div>
      <span class="dots">${list.map((m) => `<i class="${day[m.id] ? 'on' : ''}" title="${escapeHTML(m.name)}"></i>`).join('')}</span>
      <span class="count">${n}/${list.length}</span>
    </li>`;
  }
  $('#history-list').innerHTML = rows;
  $('#week-pct').textContent = list.length ? Math.round((eatenWeek / (7 * list.length)) * 100) : 0;

  // Streak: consecutive fully-completed days; today counts only once it's complete
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (isFull(dayKey(d))) streak++;
    else if (i > 0) break;
  }
  $('#streak').textContent = streak;
}

// ---------- themes ----------
const THEMES = [
  { id: 'classic', name: 'Classic', emoji: '🍏', bg: '#f2f2f7', accent: '#34c759' },
  { id: 'strawberry', name: 'Strawberry Milk', emoji: '🍓', bg: '#fff0f4', accent: '#ff5c8a' },
  { id: 'matcha', name: 'Matcha Latte', emoji: '🍵', bg: '#f0f4e6', accent: '#7cb342' },
  { id: 'blueberry', name: 'Blueberry Cloud', emoji: '🫐', bg: '#eef0ff', accent: '#6c7cff' },
  { id: 'peach', name: 'Peach Sorbet', emoji: '🍑', bg: '#fff3ea', accent: '#ff9466' },
  { id: 'lavender', name: 'Lavender Dream', emoji: '🦄', bg: '#f6f0ff', accent: '#a77bff' },
  { id: 'bunny', name: 'Midnight Bunny', emoji: '🐰', bg: '#17142b', accent: '#ff9ecb' },
];

function applySkin(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  if (theme.id === 'classic') delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = theme.id;
  // Status bar colour: Classic follows light/dark, cute themes use their own background
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.original) m.dataset.original = m.content;
    m.content = theme.id === 'classic' ? m.dataset.original : theme.bg;
  });
  store.set('skin', theme.id);
  return theme;
}

function renderSkins() {
  const current = store.get('skin', 'classic');
  $('#skin-list').innerHTML = THEMES.map((t) => `
    <button class="skin" role="radio" data-skin="${t.id}" aria-checked="${t.id === current}">
      <span class="swatch" style="--sw-bg:${t.bg};--sw-accent:${t.accent}">${t.emoji}</span>
      <span class="skin-name">${t.name}</span>
    </button>`).join('');
}

$('#skin-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.skin');
  if (!btn) return;
  const theme = applySkin(btn.dataset.skin);
  renderSkins();
  toast(`${theme.emoji} ${theme.name}`);
});

function renderWatermark() {
  const el = $('#watermark');
  // Enough copies to cover the rotated area at this screen size
  const count = Math.ceil(((innerWidth * 2) / 190) * ((innerHeight * 2) / 52));
  if (el.childElementCount === count) return;
  el.innerHTML = '<span>harshu...mendhak</span>'.repeat(count);
}

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  store.set('tab', name);
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- boot ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'eaten') setEaten(e.data.mealId, true);
  });
}

const params = new URLSearchParams(location.search);
if (params.get('eaten')) {
  setEaten(params.get('eaten'), true);
  history.replaceState(null, '', location.pathname);
}

pruneOld();
applySkin(store.get('skin', 'classic'));
renderSkins();
renderWatermark();
addEventListener('resize', renderWatermark);
renderSchedule();
renderToday();
renderHistory();
renderNotif();
showView(store.get('tab', 'today'));
checkReminders();
setInterval(checkReminders, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkReminders(); });
