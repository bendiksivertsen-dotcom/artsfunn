import './style.css';
import { searchSpecies, fetchTaxonDetail, filterSeed } from './species.js';
import { load, save, remove, clear } from './storage.js';
import {
  initMap, placeActivePin, placeActiveCircle, updateCircleRadius,
  clearActiveGeom, renderObsGeometries, panTo, invalidateSize,
} from './map.js';
import {
  calcLength, calcArea, centroid, shortId,
  generateLinePoints, generatePolygonPoints, generateCirclePoints,
} from './geometry.js';
import { exportAP2, exportCSV } from './export.js';
import { goTab, toast, updateCount, setLocDisplay, renderObsList } from './ui.js';

// ── App state ──────────────────────────────────────────────────────────────────

let obs          = load();
let selLat       = null;
let selLon       = null;
let selGeoMode   = 'point';
let selVertices  = null;
let stagedSpecies = [];  // [{ sp: {id,no,sci,grp}, antall, enhet }]

const ENHET_OPTIONS = ['', 'Planter', 'Skudd/stilker/strå', 'Tuer',
  'm2', 'dm2', 'cm2', 'Fruktlegemer', 'Mycel', 'Thalli', 'Kapsler'];

function enhetSelectHtml(selected = '') {
  return ENHET_OPTIONS
    .map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${v || '—'}</option>`)
    .join('');
}

function renderSpeciesList() {
  const el  = document.getElementById('speciesList');
  const btn = document.getElementById('submitBtn');
  if (!stagedSpecies.length) {
    el.style.display = 'none';
    btn.textContent  = '✓ Registrer funn';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = stagedSpecies.map((item, i) =>
    `<div class="sp-item" data-idx="${i}">` +
      `<div class="sp-item-info">` +
        `<div class="sp-item-no">${item.sp.no}</div>` +
        `<div class="sp-item-sci">${item.sp.sci}</div>` +
      `</div>` +
      `<input class="sp-item-antall" type="text" value="${item.antall}" ` +
             `placeholder="Ant." inputmode="numeric" data-idx="${i}">` +
      `<select class="sp-item-enhet" data-idx="${i}">${enhetSelectHtml(item.enhet)}</select>` +
      `<button class="sp-item-del" data-idx="${i}" aria-label="Fjern">✕</button>` +
    `</div>`
  ).join('');
  btn.textContent = `✓ Registrer ${stagedSpecies.length} funn`;

  el.onclick = e => {
    const del = e.target.closest('.sp-item-del');
    if (!del) return;
    syncStagedFromDom();
    stagedSpecies.splice(parseInt(del.dataset.idx), 1);
    renderSpeciesList();
  };
}

function syncStagedFromDom() {
  document.querySelectorAll('.sp-item').forEach(row => {
    const i = parseInt(row.dataset.idx);
    if (stagedSpecies[i]) {
      stagedSpecies[i].antall = row.querySelector('.sp-item-antall').value;
      stagedSpecies[i].enhet  = row.querySelector('.sp-item-enhet').value;
    }
  });
}

const today = new Date().toISOString().slice(0, 10);

// ── Initialise ─────────────────────────────────────────────────────────────────

updateCount(obs.length);
document.getElementById('dFrom').value = today;
document.getElementById('dTo').value   = today;

// ── Map ────────────────────────────────────────────────────────────────────────

initMap('map', {
  onPick:       geoData => setActivePos(geoData),
  onModeChange: mode    => onMapModeChange(mode),
});
renderObsGeometries(obs);

function onMapModeChange(mode) {
  selGeoMode  = mode;
  selVertices = null;
  // Show density fields immediately for all non-point modes
  setGeoFieldsVisible(mode, mode !== 'point');
  updatePointCounts();
}

const MAX_POINTS = 5000;

function setGeoFieldsVisible(mode, visible) {
  document.getElementById('lineFields').style.display    = visible && mode === 'line'    ? 'block' : 'none';
  document.getElementById('circleFields').style.display  = visible && mode === 'circle'  ? 'block' : 'none';
  document.getElementById('polygonFields').style.display = visible && mode === 'polygon' ? 'block' : 'none';
}

function countLinePoints() {
  if (!selVertices || selVertices.length < 2) return null;
  const d = parseFloat(document.getElementById('lineDensity').value);
  return Math.max(1, Math.round(d * calcLength(selVertices)));
}

function countAreaPoints(mode) {
  const d = parseFloat(document.getElementById(mode === 'circle' ? 'circleDensity' : 'polygonDensity').value);
  if (!d) return 1;
  if (mode === 'circle') {
    const r = parseInt(document.getElementById('circleRadius').value);
    return Math.max(1, Math.round(d * Math.PI * r * r));
  }
  if (!selVertices || selVertices.length < 3) return null;
  return Math.max(1, Math.round(d * calcArea(selVertices).sqm));
}

function updatePointCounts() {
  const fmt = n => n != null ? `→ ${n.toLocaleString('nb')} punkt${n !== 1 ? 'er' : ''}` : '';

  const lineEl = document.getElementById('linePointCount');
  if (lineEl) lineEl.textContent = selGeoMode === 'line' ? (fmt(countLinePoints()) || 'Tegn linje på kartet') : '';

  const circleEl = document.getElementById('circlePointCount');
  if (circleEl) circleEl.textContent = selGeoMode === 'circle' ? fmt(countAreaPoints('circle')) : '';

  const polyEl = document.getElementById('polygonPointCount');
  if (polyEl) polyEl.textContent = selGeoMode === 'polygon' ? (fmt(countAreaPoints('polygon')) || 'Tegn polygon på kartet') : '';
}

function setActivePos(geoData) {
  const { mode, lat, lon, vertices } = geoData;
  selLat      = lat;
  selLon      = lon;
  selGeoMode  = mode;
  selVertices = vertices ?? null;

  setLocDisplay(lat, lon);
  document.getElementById('mapOverlay').classList.add('hidden');

  let dispText = `lat: ${lat.toFixed(5)}  lon: ${lon.toFixed(5)}`;
  if (mode === 'line' && vertices) {
    dispText += `  — ${calcLength(vertices)} m`;
  } else if (mode === 'polygon' && vertices) {
    const { daa } = calcArea(vertices);
    dispText += `  — ${daa} daa`;
  } else if (mode === 'circle') {
    const r = parseInt(document.getElementById('circleRadius').value);
    dispText += `  r: ${r} m`;
    placeActiveCircle(lat, lon, r);
  } else {
    placeActivePin(lat, lon);
  }

  document.getElementById('coordDisplay').style.display  = 'block';
  document.getElementById('coordDisplay').textContent    = dispText;

  setGeoFieldsVisible(mode, mode !== 'point');
  updatePointCounts();
}

// ── Circle radius slider ───────────────────────────────────────────────────────

const circleRadiusEl  = document.getElementById('circleRadius');
const circleRadiusVal = document.getElementById('circleRadiusVal');

circleRadiusEl.addEventListener('input', () => {
  const r = parseInt(circleRadiusEl.value);
  circleRadiusVal.textContent = `${r} m`;
  if (selGeoMode === 'circle' && selLat !== null) {
    updateCircleRadius(r);
    document.getElementById('coordDisplay').textContent =
      `lat: ${selLat.toFixed(5)}  lon: ${selLon.toFixed(5)}  r: ${r} m`;
  }
  updatePointCounts();
});

['lineDensity', 'circleDensity', 'polygonDensity'].forEach(id => {
  document.getElementById(id).addEventListener('change', updatePointCounts);
});

// ── GPS ────────────────────────────────────────────────────────────────────────

document.getElementById('gpsBtn').addEventListener('click', getGPS);

function getGPS() {
  const status = document.getElementById('gpsStatus');
  status.textContent = 'Henter posisjon…';

  if (!navigator.geolocation) {
    status.textContent = 'GPS ikke tilgjengelig';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
      status.textContent = `± ${Math.round(acc)} m`;

      setActivePos({ mode: selGeoMode, lat, lon });
      panTo(lat, lon);

      const noel = document.getElementById('noyakt');
      if      (acc <= 10)  noel.value = '10 m';
      else if (acc <= 25)  noel.value = '25 m';
      else if (acc <= 50)  noel.value = '50 m';
      else if (acc <= 100) noel.value = '100 m';
      else                 noel.value = '250 m';

      toast(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    },
    err => {
      const msgs = {
        1: 'Posisjon nektet – tillat stedstilgang i innstillinger',
        2: 'Posisjon utilgjengelig',
        3: 'Tidsavbrudd',
      };
      status.textContent = msgs[err.code] ?? 'GPS-feil';
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
  );
}

// ── Species autocomplete ───────────────────────────────────────────────────────

const spInput  = document.getElementById('spInput');
const acDrop   = document.getElementById('acDrop');

let searchTimer = null;
let searchAbort = null;

spInput.addEventListener('input', e => scheduleSearch(e.target.value));
spInput.addEventListener('focus', e => scheduleSearch(e.target.value));

document.addEventListener('click', e => {
  if (!e.target.closest('.ac-wrap')) hideDropdown();
});

function scheduleSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(value), 300);
}

async function runSearch(value) {
  const q = value.trim();
  if (q.length < 2) { hideDropdown(); return; }

  const seedHits = filterSeed(q);
  if (seedHits.length) showDropdown(seedHits);

  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  try {
    const results = await searchSpecies(q, searchAbort.signal);
    if (results.length) showDropdown(results);
    else if (!seedHits.length) hideDropdown();
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
}

function showDropdown(items) {
  if (!items.length) { hideDropdown(); return; }

  let html = '';
  let currentGrp = null;
  items.forEach(s => {
    if (s.grp && s.grp !== currentGrp) {
      html += `<div class="ac-grp-hdr">${s.grp}</div>`;
      currentGrp = s.grp;
    }
    const data = encodeURIComponent(JSON.stringify(s));
    html +=
      `<div class="ac-item" data-sp="${data}">` +
      `<div class="ac-name">${s.no}</div>` +
      `<div class="ac-sci">${s.sci}</div>` +
      `</div>`;
  });

  acDrop.innerHTML     = html;
  acDrop.style.display = 'block';

  acDrop.onclick = e => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    pickSpecies(JSON.parse(decodeURIComponent(item.dataset.sp)));
  };
}

function hideDropdown() {
  acDrop.style.display = 'none';
}

async function pickSpecies(item) {
  const entry = { sp: { ...item }, antall: '', enhet: '' };
  stagedSpecies.push(entry);
  spInput.value = '';
  hideDropdown();
  renderSpeciesList();

  if (item.id > 0 && item.grp === null) {
    try {
      const detail = await fetchTaxonDetail(item.id);
      const idx = stagedSpecies.indexOf(entry);
      if (idx >= 0) stagedSpecies[idx].sp = detail;
    } catch {
      // Stays as grp: null → 'Andre' sheet on export
    }
  }
}

// ── Register observation ───────────────────────────────────────────────────────

document.getElementById('submitBtn').addEventListener('click', registerObs);

function registerObs() {
  if (!selLat) {
    toast('⚠ Velg posisjon med GPS eller klikk på kartet');
    return;
  }
  const locName = document.getElementById('locName').value.trim();
  if (!locName) { toast('⚠ Fyll inn lokalitetsnavn'); return; }

  // Sync any inline edits back into state before reading
  syncStagedFromDom();

  // Allow a free-text species if nothing has been staged via autocomplete
  if (!stagedSpecies.length) {
    const spVal = spInput.value.trim();
    if (!spVal) { toast('⚠ Legg til minst én art'); return; }
    stagedSpecies.push({ sp: { no: spVal, sci: '', grp: 'Andre' }, antall: '', enhet: '' });
  }

  // Build shared geometry + comment prefix once
  let geom       = { mode: 'point' };
  let kommPrefix = '';

  if (selGeoMode === 'circle' && selLat !== null) {
    const r       = parseInt(circleRadiusEl.value);
    const density = parseFloat(document.getElementById('circleDensity').value);
    const pts     = density > 0
      ? generateCirclePoints(selLat, selLon, r, Math.min(density, MAX_POINTS / (Math.PI * r * r)))
      : [[selLat, selLon]];
    if (pts.length > MAX_POINTS) pts.splice(MAX_POINTS);
    geom       = { mode: 'circle', radiusM: r, gridPoints: pts };
    kommPrefix = `Sirkel r=${r} m, ${pts.length} punkt${pts.length !== 1 ? 'er' : ''}`;

  } else if (selGeoMode === 'line' && selVertices?.length >= 2) {
    const lenM    = calcLength(selVertices);
    const density = parseFloat(document.getElementById('lineDensity').value);
    const pts     = generateLinePoints(selVertices, Math.min(density, MAX_POINTS / lenM));
    if (pts.length > MAX_POINTS) pts.splice(MAX_POINTS);
    geom       = { mode: 'line', vertices: selVertices, linePoints: pts };
    kommPrefix = `Linje ${lenM} m, ${pts.length} punkt${pts.length !== 1 ? 'er' : ''}`;

  } else if (selGeoMode === 'polygon' && selVertices?.length >= 3) {
    const { daa, sqm } = calcArea(selVertices);
    const density      = parseFloat(document.getElementById('polygonDensity').value);
    const gid          = shortId();
    const pts          = density > 0
      ? generatePolygonPoints(selVertices, Math.min(density, MAX_POINTS / sqm))
      : [centroid(selVertices)];
    if (pts.length > MAX_POINTS) pts.splice(MAX_POINTS);
    geom       = { mode: 'polygon', vertices: selVertices, gridPoints: pts, gid };
    kommPrefix = `Polygon ${daa} daa, ${pts.length} punkt${pts.length !== 1 ? 'er' : ''}, ID ${gid}`;
  }

  const userKomm = document.getElementById('komm').value;
  const komm     = kommPrefix
    ? (userKomm ? `${kommPrefix}. ${userKomm}` : kommPrefix)
    : userKomm;

  const shared = {
    locName,
    lat:     selLat,
    lon:     selLon,
    geom,
    nin:     document.getElementById('ninSel').value,
    dFrom:   document.getElementById('dFrom').value,
    dTo:     document.getElementById('dTo').value || document.getElementById('dFrom').value,
    noyakt:  document.getElementById('noyakt').value,
    livs:    document.getElementById('livs').value,
    bestmet: document.getElementById('bestmet').value,
    komm,
    usikker: document.getElementById('usikker').checked,
  };

  const now = Date.now();
  stagedSpecies.forEach(({ sp, antall, enhet }, i) => {
    obs.push({ id: now + i, sp, antall, enhet, ...shared });
  });

  if (!save(obs)) toast('⚠ Lagring feilet');

  renderObsGeometries(obs);
  clearActiveGeom();
  updateCount(obs.length);
  const n       = stagedSpecies.length;
  const firstName = stagedSpecies[0]?.sp.no ?? 'Funn';
  resetForm();
  toast(`✓ ${n === 1 ? firstName : `${n} funn`} registrert!`);
  goTab('lst', () => renderObsList(obs, { onDelete }));
}

function resetForm() {
  ['spInput', 'locName', 'komm'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['ninSel', 'livs', 'bestmet'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('usikker').checked = false;
  document.getElementById('dFrom').value = today;
  document.getElementById('dTo').value   = today;
  document.getElementById('coordDisplay').style.display = 'none';
  document.getElementById('mapOverlay').classList.remove('hidden');

  stagedSpecies = [];
  renderSpeciesList();
  selLat      = null;
  selLon      = null;
  selVertices = null;
  setGeoFieldsVisible(selGeoMode, selGeoMode !== 'point');
  updatePointCounts();
}

// ── Observations list ──────────────────────────────────────────────────────────

function onDelete(id) {
  if (!confirm('Slette dette funnet?')) return;
  obs = remove(obs, id);
  renderObsGeometries(obs);
  updateCount(obs.length);
  renderObsList(obs, { onDelete });
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

document.getElementById('t-reg').addEventListener('click', () => { goTab('reg'); invalidateSize(); });
document.getElementById('t-lst').addEventListener('click', () => {
  goTab('lst', () => renderObsList(obs, { onDelete }));
});
document.getElementById('t-exp').addEventListener('click', () => goTab('exp'));

// ── Export ─────────────────────────────────────────────────────────────────────

document.getElementById('btnAP2').addEventListener('click', () => {
  const result = exportAP2(obs);
  if (!result) {
    toast('Ingen funn å eksportere');
  } else if (result.overflowSheets > 0) {
    toast(`Polygon eksportert over ${result.overflowSheets} ark (AP2-grense 2000 rader per ark)`);
  } else {
    toast('Excel lastet ned!');
  }
});

document.getElementById('btnCSV').addEventListener('click', () => {
  if (!exportCSV(obs)) toast('Ingen funn å eksportere');
  else toast('CSV lastet ned!');
});

document.getElementById('btnClearAll').addEventListener('click', () => {
  if (!obs.length) return;
  if (!confirm(`Slette ALLE ${obs.length} registrerte funn? Dette kan ikke angres.`)) return;
  obs = clear();
  renderObsGeometries(obs);
  updateCount(0);
  renderObsList(obs, { onDelete });
  toast('Alle funn slettet');
});
