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
