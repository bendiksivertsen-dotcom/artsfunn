import turfLength from '@turf/length';
import turfArea from '@turf/area';
import turfBbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { lineString, polygon, point } from '@turf/helpers';

// Our coords are [lat, lon]; GeoJSON expects [lon, lat]
function toLonLat(verts) { return verts.map(([lat, lon]) => [lon, lat]); }

/** Total length of a line in metres (rounded to nearest metre). */
export function calcLength(vertices) {
  if (vertices.length < 2) return 0;
  return Math.round(turfLength(lineString(toLonLat(vertices)), { units: 'kilometers' }) * 1000);
}

/** Area of a polygon. Returns { sqm, daa }. */
export function calcArea(vertices) {
  if (vertices.length < 3) return { sqm: 0, daa: 0 };
  const ll = toLonLat(vertices);
  const sqm = Math.round(turfArea(polygon([[...ll, ll[0]]])));
  return { sqm, daa: Math.round(sqm / 100) / 10 };
}

/**
 * Generate grid points inside a polygon.
 * densityM = 0  → returns [centroid] only.
 * Returns [[lat, lon], …].
 */
export function generateGrid(vertices, densityM) {
  if (!densityM) return [centroid(vertices)];

  const ll = toLonLat(vertices);
  const poly = polygon([[...ll, ll[0]]]);
  const [minLon, minLat, maxLon, maxLat] = turfBbox(poly);
  const midLat = (minLat + maxLat) / 2;
  const latStep = densityM / 111319.9;
  const lonStep = densityM / (111319.9 * Math.cos(midLat * Math.PI / 180));

  const pts = [];
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
      if (booleanPointInPolygon(point([lon, lat]), poly)) pts.push([lat, lon]);
    }
  }
  return pts.length ? pts : [centroid(vertices)];
}

/** Arithmetic mean of vertex coordinates. */
export function centroid(vertices) {
  const lat = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
  const lon = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;
  return [lat, lon];
}

/** Six-character random base-36 ID. */
export function shortId() {
  return Math.random().toString(36).slice(2, 8);
}

// ── Density-based point generation ────────────────────────────────────────────

function segLenM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointAtDistM(vertices, targetM) {
  let walked = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const [lat1, lon1] = vertices[i];
    const [lat2, lon2] = vertices[i + 1];
    const seg = segLenM(lat1, lon1, lat2, lon2);
    if (walked + seg >= targetM) {
      const t = (targetM - walked) / seg;
      return [lat1 + t * (lat2 - lat1), lon1 + t * (lon2 - lon1)];
    }
    walked += seg;
  }
  return vertices[vertices.length - 1];
}

/**
 * N = round(densityPerM × length_m) points equally spaced along a line.
 * Points are placed at segment midpoints (step × (i + 0.5)) so they avoid
 * clustering at the endpoints.
 */
export function generateLinePoints(vertices, densityPerM) {
  const lenM = calcLength(vertices);
  const n    = Math.max(1, Math.round(densityPerM * lenM));
  const step = lenM / n;
  return Array.from({ length: n }, (_, i) => pointAtDistM(vertices, step * (i + 0.5)));
}

/**
 * N = round(densityPerM2 × area_m2) points distributed uniformly in a polygon.
 * Uses a regular grid with spacing = sqrt(area / N).
 */
export function generatePolygonPoints(vertices, densityPerM2) {
  const { sqm } = calcArea(vertices);
  const n = Math.max(1, Math.round(densityPerM2 * sqm));
  if (n <= 1) return [centroid(vertices)];
  const spacingM = Math.sqrt(sqm / n);
  const pts = generateGrid(vertices, spacingM);
  return pts.length ? pts : [centroid(vertices)];
}

/**
 * N = round(densityPerM2 × π × r²) points distributed uniformly in a circle.
 */
export function generateCirclePoints(centerLat, centerLon, radiusM, densityPerM2) {
  const sqm = Math.PI * radiusM * radiusM;
  const n   = Math.max(1, Math.round(densityPerM2 * sqm));
  if (n <= 1) return [[centerLat, centerLon]];
  const spacingM = Math.sqrt(sqm / n);
  const latStep  = spacingM / 111319.9;
  const lonStep  = spacingM / (111319.9 * Math.cos(centerLat * Math.PI / 180));
  const maxDLat  = radiusM / 111319.9;
  const maxDLon  = radiusM / (111319.9 * Math.cos(centerLat * Math.PI / 180));
  const pts = [];
  for (let dlat = -maxDLat; dlat <= maxDLat; dlat += latStep) {
    for (let dlon = -maxDLon; dlon <= maxDLon; dlon += lonStep) {
      const dlatM = dlat * 111319.9;
      const dlonM = dlon * 111319.9 * Math.cos(centerLat * Math.PI / 180);
      if (Math.sqrt(dlatM ** 2 + dlonM ** 2) <= radiusM) {
        pts.push([centerLat + dlat, centerLon + dlon]);
      }
    }
  }
  return pts.length ? pts : [[centerLat, centerLon]];
}
