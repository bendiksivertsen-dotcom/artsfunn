import './style.css';
import { searchSpecies, fetchTaxonDetail, filterSeed } from './species.js';
import { load, save, remove, clear } from './storage.js';
import {
  initMap, placeActivePin, placeActiveCircle, updateCircleRadius,
  clearActiveGeom, renderObsGeometries, panTo, invalidateSize,
} from './map.js';
import { calcLength, calcArea, generateGrid, shortId } from './geometry.js';
import { exportAP2, exportCSV } from './export.js';
import { goTab, toast, updateCount, setLocDisplay, renderObsList } from './ui.js';

// ── App state ──────────────────────────────────────────────────────────────────

let obs        = load();
let selLat     = null;
let selLon     = null;
let selGeoMode = 'point';
let selVertices = null;
let selSpecies  = null;  // { id, no, sci, grp }

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
  // Hide mode-specific fields when switching modes (they'll show again on pick)
  setGeoFieldsVisible(mode, false);
}

function setGeoFieldsVisible(mode, visible) {
  document.getElementById('circleFields').style.display  = visible && mode === 'circle'  ? 'block' : 'none';
  document.getElementById('polygonFields').style.display = visible && mode === 'polygon' ? 'block' : 'none';
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

  setGeoFieldsVisible(mode, true);
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
  selSpecies    = { ...item };
  spInput.value = `${item.no} — ${item.sci}`;
  hideDropdown();
  spInput.blur();

  if (item.id > 0 && item.grp === null) {
    try {
      const detail = await fetchTaxonDetail(item.id);
      if (selSpecies?.id === item.id) selSpecies = detail;
    } catch {
      // Fall back to 'Andre' sheet on export
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

  const spVal = spInput.value.trim();
  if (!spVal)  { toast('⚠ Velg en art'); return; }

  const sp = selSpecies ?? { no: spVal, sci: '', grp: 'Andre' };

  // Build geometry and comment prefix
  let geom       = { mode: 'point' };
  let kommPrefix = '';

  if (selGeoMode === 'circle' && selLat !== null) {
    const r = parseInt(circleRadiusEl.value);
    geom       = { mode: 'circle', radiusM: r };
    kommPrefix = `r=${r} m`;
  } else if (selGeoMode === 'line' && selVertices?.length >= 2) {
    const lenM = calcLength(selVertices);
    geom       = { mode: 'line', vertices: selVertices };
    kommPrefix = `Linje ${lenM} m`;
  } else if (selGeoMode === 'polygon' && selVertices?.length >= 3) {
    const { daa }   = calcArea(selVertices);
    const density   = parseInt(document.getElementById('gridDensity').value);
    const gid       = shortId();
    const gridPoints = generateGrid(selVertices, density);
    geom       = { mode: 'polygon', vertices: selVertices, gridPoints, gid };
    kommPrefix = density
      ? `Grid ${density}×${density} m, ${daa} daa, polygon-ID ${gid}`
      : `${daa} daa, polygon-ID ${gid}`;
  }

  const userKomm = document.getElementById('komm').value;
  const komm     = kommPrefix
    ? (userKomm ? `${kommPrefix}. ${userKomm}` : kommPrefix)
    : userKomm;

  const o = {
    id:      Date.now(),
    sp,
    locName,
    lat:     selLat,
    lon:     selLon,
    geom,
    nin:     document.getElementById('ninSel').value,
    dFrom:   document.getElementById('dFrom').value,
    dTo:     document.getElementById('dTo').value || document.getElementById('dFrom').value,
    antall:  document.getElementById('antall').value,
    enhet:   document.getElementById('enhet').value,
    noyakt:  document.getElementById('noyakt').value,
    livs:    document.getElementById('livs').value,
    bestmet: document.getElementById('bestmet').value,
    komm,
    usikker: document.getElementById('usikker').checked,
  };

  obs.push(o);
  if (!save(obs)) toast('⚠ Lagring feilet');

  renderObsGeometries(obs);
  clearActiveGeom();
  updateCount(obs.length);
  resetForm();
  toast(`✓ ${o.sp.no} registrert!`);
  goTab('lst', () => renderObsList(obs, { onDelete }));
}

function resetForm() {
  ['spInput', 'locName', 'antall', 'komm'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['ninSel', 'enhet', 'livs', 'bestmet'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('usikker').checked = false;
  document.getElementById('dFrom').value = today;
  document.getElementById('dTo').value   = today;
  document.getElementById('coordDisplay').style.display = 'none';
  document.getElementById('mapOverlay').classList.remove('hidden');

  selSpecies  = null;
  selLat      = null;
  selLon      = null;
  selVertices = null;
  setGeoFieldsVisible(selGeoMode, false);
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
