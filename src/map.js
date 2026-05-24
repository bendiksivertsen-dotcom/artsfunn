import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Kartverket WMTS (XYZ-compatible). Path order is z/row/col, so Leaflet template uses {z}/{y}/{x}.
const TILE_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';

let map              = null;
let obsLayer         = null;
let activeGeomGroup  = null;   // LayerGroup for the current active (green) geometry
let inProgressGroup  = null;   // LayerGroup for the dashed in-progress drawing

let drawMode     = 'point';
let drawVertices = [];
let _callbacks   = {};         // { onPick, onModeChange }
let toolbarEl    = null;
let cancelBtn    = null;

// ── Icons ──────────────────────────────────────────────────────────────────────

function pinIcon(color, size) {
  const h = Math.round(size * 1.5);
  return L.divIcon({
    html:
      `<svg width="${size}" height="${h}" viewBox="0 0 12 18" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M6 0C2.7 0 0 2.7 0 6c0 4.5 6 12 6 12s6-7.5 6-12C12 2.7 9.3 0 6 0z" fill="${color}"/>` +
      `<circle cx="6" cy="6" r="2.5" fill="white"/>` +
      `</svg>`,
    className:   '',
    iconSize:    [size, h],
    iconAnchor:  [size / 2, h],
    popupAnchor: [0, -h + 4],
  });
}

const ICON_ACTIVE = pinIcon('#2d7d46', 28);
const ICON_OBS    = pinIcon('#555555', 18);

// ── SVG icons for toolbar buttons ──────────────────────────────────────────────

const SVG = {
  point:
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>`,

  circle:
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">` +
    `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,

  line:
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">` +
    `<polyline points="3,20 9,8 15,14 21,4"/></svg>`,

  polygon:
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
    `<polygon points="12,3 21,9 18,20 6,20 3,9"/></svg>`,

  cancel:
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">` +
    `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// ── Toolbar ────────────────────────────────────────────────────────────────────

function buildToolbar() {
  const ToolbarControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-toolbar leaflet-bar');
      div.innerHTML =
        `<button class="map-tool-btn active" data-mode="point"   title="Punkt">${SVG.point}</button>` +
        `<button class="map-tool-btn"        data-mode="circle"  title="Sirkel">${SVG.circle}</button>` +
        `<button class="map-tool-btn"        data-mode="line"    title="Linje">${SVG.line}</button>` +
        `<button class="map-tool-btn"        data-mode="polygon" title="Polygon">${SVG.polygon}</button>` +
        `<button class="map-tool-btn cancel hidden" id="mapCancelBtn" title="Avbryt tegning">${SVG.cancel}</button>`;

      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      div.addEventListener('click', e => {
        const modeBtn = e.target.closest('[data-mode]');
        if (modeBtn) { setMode(modeBtn.dataset.mode); return; }
        if (e.target.closest('#mapCancelBtn')) cancelDraw();
      });

      toolbarEl  = div;
      cancelBtn  = div.querySelector('#mapCancelBtn');
      return div;
    },
  });
  new ToolbarControl().addTo(map);
}

function setMode(mode) {
  drawMode = mode;
  drawVertices = [];
  clearInProgress();

  if (toolbarEl) {
    toolbarEl.querySelectorAll('[data-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
  }
  showCancel(false);
  map.getContainer().style.cursor = mode !== 'point' ? 'crosshair' : '';
  _callbacks.onModeChange?.(mode);
}

function showCancel(visible) {
  cancelBtn?.classList.toggle('hidden', !visible);
}

function cancelDraw() {
  drawVertices = [];
  clearInProgress();
  showCancel(false);
}

// ── Active / in-progress geometry helpers ──────────────────────────────────────

function clearInProgress() {
  inProgressGroup?.clearLayers();
}

/** Remove the confirmed active (green) geometry. */
export function clearActiveGeom() {
  activeGeomGroup?.clearLayers();
}

function updateInProgressLine() {
  inProgressGroup.clearLayers();
  if (drawVertices.length < 2) return;
  L.polyline(drawVertices, { color: '#2d7d46', weight: 2.5, dashArray: '6 5', opacity: 0.8 })
    .addTo(inProgressGroup);
}

function updateInProgressPolygon() {
  inProgressGroup.clearLayers();
  if (drawVertices.length < 2) return;
  if (drawVertices.length === 2) {
    L.polyline(drawVertices, { color: '#2d7d46', weight: 2.5, dashArray: '6 5', opacity: 0.8 })
      .addTo(inProgressGroup);
  } else {
    L.polygon(drawVertices, {
      color: '#2d7d46', weight: 2.5, dashArray: '6 5',
      fillColor: '#2d7d46', fillOpacity: 0.15,
    }).addTo(inProgressGroup);
  }
  // Highlight first vertex as a close-target
  const [lat, lon] = drawVertices[0];
  L.circleMarker([lat, lon], { radius: 6, color: '#2d7d46', fillColor: 'white', fillOpacity: 1, weight: 2 })
    .addTo(inProgressGroup);
}

function vCentroid(verts) {
  const lat = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const lon = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  return [lat, lon];
}

function finishLine() {
  const verts = [...drawVertices];
  drawVertices = [];
  clearInProgress();
  showCancel(false);

  activeGeomGroup.clearLayers();
  L.polyline(verts, { color: '#2d7d46', weight: 3 }).addTo(activeGeomGroup);

  const [lat, lon] = vCentroid(verts);
  _callbacks.onPick({ mode: 'line', lat, lon, vertices: verts });
}

function finishPolygon() {
  const verts = [...drawVertices];
  drawVertices = [];
  clearInProgress();
  showCancel(false);

  activeGeomGroup.clearLayers();
  L.polygon(verts, { color: '#2d7d46', weight: 2, fillColor: '#2d7d46', fillOpacity: 0.25 })
    .addTo(activeGeomGroup);

  const [lat, lon] = vCentroid(verts);
  _callbacks.onPick({ mode: 'polygon', lat, lon, vertices: verts });
}

// ── Circle active geometry ─────────────────────────────────────────────────────

let _circleLayer  = null;
let _circleCenter = null;

export function placeActiveCircle(lat, lon, radiusM) {
  activeGeomGroup.clearLayers();
  _circleCenter = [lat, lon];
  L.marker([lat, lon], { icon: ICON_ACTIVE, zIndexOffset: 1000 }).addTo(activeGeomGroup);
  _circleLayer = L.circle([lat, lon], {
    radius: radiusM, color: '#2d7d46', weight: 2, fillColor: '#2d7d46', fillOpacity: 0.2,
  }).addTo(activeGeomGroup);
}

export function updateCircleRadius(radiusM) {
  _circleLayer?.setRadius(radiusM);
}

// ── Point active geometry ──────────────────────────────────────────────────────

export function placeActivePin(lat, lon) {
  activeGeomGroup.clearLayers();
  _circleLayer = null;
  L.marker([lat, lon], { icon: ICON_ACTIVE, zIndexOffset: 1000 }).addTo(activeGeomGroup);
}

// ── Init ───────────────────────────────────────────────────────────────────────

/**
 * @param {string} containerId
 * @param {{ onPick: function, onModeChange?: function }} callbacks
 */
export function initMap(containerId, callbacks) {
  _callbacks = callbacks;

  map = L.map(containerId, {
    center:         [65.0, 14.5],
    zoom:           5,
    zoomControl:    true,
    doubleClickZoom: false,
  });

  L.tileLayer(TILE_URL, {
    maxZoom:     18,
    crossOrigin: 'anonymous',
    attribution: '&copy; <a href="https://kartverket.no">Kartverket</a>',
  }).addTo(map);

  obsLayer        = L.layerGroup().addTo(map);
  activeGeomGroup = L.layerGroup().addTo(map);
  inProgressGroup = L.layerGroup().addTo(map);

  buildToolbar();

  // ── Map click handler ──────────────────────────────────────────────────────
  map.on('click', e => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (drawMode === 'point') {
      placeActivePin(lat, lon);
      _callbacks.onPick({ mode: 'point', lat, lon });
      return;
    }

    if (drawMode === 'circle') {
      placeActiveCircle(lat, lon, 100);
      _callbacks.onPick({ mode: 'circle', lat, lon });
      return;
    }

    if (drawMode === 'line') {
      drawVertices.push([lat, lon]);
      updateInProgressLine();
      showCancel(drawVertices.length > 0);
      return;
    }

    if (drawMode === 'polygon') {
      // Close polygon if clicking near the first vertex
      if (drawVertices.length >= 3) {
        const first = drawVertices[0];
        const px1   = map.latLngToLayerPoint([first[0], first[1]]);
        const px2   = map.latLngToLayerPoint(e.latlng);
        if (px1.distanceTo(px2) < 20) {
          finishPolygon();
          return;
        }
      }
      drawVertices.push([lat, lon]);
      updateInProgressPolygon();
      showCancel(drawVertices.length > 0);
    }
  });

  // ── Double-click: finish line / polygon ────────────────────────────────────
  map.on('dblclick', () => {
    if (drawMode === 'line') {
      // dblclick fires two preceding click events; pop the duplicate
      if (drawVertices.length > 0) drawVertices.pop();
      if (drawVertices.length >= 2) finishLine();
      return;
    }
    if (drawMode === 'polygon') {
      if (drawVertices.length > 0) drawVertices.pop();
      if (drawVertices.length >= 3) finishPolygon();
    }
  });
}

// ── Saved observation geometries ───────────────────────────────────────────────

/** Re-render all saved-observation geometries. Call after every obs add/delete. */
export function renderObsGeometries(obs) {
  obsLayer.clearLayers();
  obs.forEach(o => {
    const geom  = o.geom || { mode: 'point' };
    const popup =
      `<strong>${o.sp.no}</strong><br><em>${o.sp.sci}</em><br>📍 ${o.locName}`;

    if (geom.mode === 'circle') {
      L.circle([o.lat, o.lon], {
        radius: geom.radiusM || 100, color: '#555', weight: 2, fillOpacity: 0.15,
      }).bindPopup(popup).addTo(obsLayer);
      L.marker([o.lat, o.lon], { icon: ICON_OBS }).bindPopup(popup).addTo(obsLayer);

    } else if (geom.mode === 'line' && geom.vertices?.length) {
      L.polyline(geom.vertices, { color: '#555', weight: 3 })
        .bindPopup(popup).addTo(obsLayer);

    } else if (geom.mode === 'polygon' && geom.vertices?.length) {
      L.polygon(geom.vertices, { color: '#555', weight: 2, fillOpacity: 0.2 })
        .bindPopup(popup).addTo(obsLayer);

    } else {
      L.marker([o.lat, o.lon], { icon: ICON_OBS })
        .bindPopup(popup).addTo(obsLayer);
    }
  });
}

// ── Misc exports ───────────────────────────────────────────────────────────────

/** Fly the map to GPS coordinates; zoom in if currently zoomed out. */
export function panTo(lat, lon) {
  map.setView([lat, lon], Math.max(map.getZoom(), 14), { animate: true });
}

/** Call when the map container becomes visible after being hidden. */
export function invalidateSize() {
  map?.invalidateSize();
}
