import { fmtDate } from './export.js';

const TABS = ['reg', 'lst', 'exp'];

export function goTab(name, onEnterList) {
  TABS.forEach(t => {
    document.getElementById(`p-${t}`).classList.toggle('active', t === name);
    document.getElementById(`t-${t}`).classList.toggle('active', t === name);
  });
  if (name === 'lst') onEnterList?.();
}

let toastTimer = null;
export function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

export function updateCount(n) {
  document.getElementById('headerCount').textContent = `${n} ${n === 1 ? 'funn' : 'funn'}`;
}

export function setLocDisplay(lat, lon) {
  const el = document.getElementById('locDisplay');
  el.textContent = `${lat.toFixed(5)}° N,  ${lon.toFixed(5)}° Ø`;
  el.className = 'loc-display ok';
}

export function renderObsList(obs, { onDelete }) {
  const el = document.getElementById('obsList');

  if (!obs.length) {
    el.innerHTML =
      `<div class="empty-state">` +
      `<div class="empty-icon">🌿</div>` +
      `<p>Ingen funn registrert ennå.<br>Gå til <strong>Registrer</strong> for å legge til.</p>` +
      `</div>`;
    return;
  }

  el.innerHTML = obs
    .slice()
    .reverse()
    .map(o => obsCardHTML(o))
    .join('');

  // Replace handler each render (innerHTML swap removes old child listeners)
  el.onclick = e => {
    const btn = e.target.closest('.del-btn');
    if (btn) onDelete(Number(btn.dataset.id));
  };
}

function obsCardHTML(o) {
  const tags = [
    o.nin     ? `<span class="tag">${o.nin}</span>`          : '',
    o.livs    ? `<span class="tag">${o.livs}</span>`         : '',
    o.usikker ? `<span class="tag warn">usikker</span>` : '',
  ].filter(Boolean).join('');

  const excerpt = o.komm
    ? `<div class="obs-card-meta" style="margin-top:5px;font-style:italic;">${
        o.komm.slice(0, 100)}${o.komm.length > 100 ? '…' : ''}</div>`
    : '';

  return `
    <div class="obs-card">
      <button class="del-btn" data-id="${o.id}" aria-label="Slett">&times;</button>
      <div class="obs-card-name">${o.sp.no}</div>
      ${o.sp.sci ? `<div class="obs-card-sci">${o.sp.sci}</div>` : ''}
      <div class="obs-card-meta">📍 ${o.locName}</div>
      <div class="obs-card-meta">📅 ${fmtDate(o.dFrom)} · ${o.lat.toFixed(4)}° N, ${o.lon.toFixed(4)}° Ø${o.antall ? ` · ×${o.antall}` : ''}</div>
      ${tags ? `<div class="obs-tags">${tags}</div>` : ''}
      ${excerpt}
    </div>`;
}
