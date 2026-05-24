import * as XLSX from 'xlsx';

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// AP2 column headers (artsobservasjoner.no import format v2.20)
const COLS_KARP = [
  'Artsnavn', 'Lokalitetsnavn', 'Nord', 'Øst', 'Nøyaktighet',
  'Fra dato', 'Til dato', 'Fra klokkeslett', 'Til klokkeslett',
  'Antall', 'Enhet', 'Alder', 'Kjønn',
  'Kommentar (synlig for alle)', 'Privat kommentar (kun synlig for deg selv)',
  'Skjul funn til dato',
  'Medobservatør', 'Medobservatør', 'Medobservatør', 'Medobservatør',
  'Medobservatør', 'Medobservatør', 'Medobservatør', 'Medobservatør',
  'Medobservatør', 'Medobservatør',
  'Bestemmelsesmetode', 'Natursystem', 'Beskriv natursystem',
  'Livsmedium', 'Beskriv livsmedium', 'Antall livsmedium',
  'Art som livsmedium', 'Beskriv art som livsmedium',
  'Dybde min', 'Dybde maks', 'Høyde min', 'Høyde maks',
  'Andrehånds', 'Usikker artsbestemming',
  'Ikke spontan', 'Interessant observasjon', 'Ikke gjenfunnet', 'Ikke funnet',
  'Offentlig samling', 'Privat samling', 'Referansenummer i samling',
  'Beskrivelse artsbestemming', 'Bestemt av', 'Bestemt av (fritekst)',
];

// Sopp/Lav sheet has an extra Bestemmelsesår column and no Kjønn
const COLS_SOPP = [
  'Artsnavn', 'Lokalitetsnavn', 'Nord', 'Øst', 'Nøyaktighet',
  'Fra dato', 'Til dato', 'Fra klokkeslett', 'Til klokkeslett',
  'Antall', 'Enhet', 'Alder',
  'Kommentar (synlig for alle)', 'Privat kommentar (kun synlig for deg selv)',
  'Skjul funn til dato',
  'Medobservatør', 'Medobservatør', 'Medobservatør', 'Medobservatør',
  'Medobservatør', 'Medobservatør', 'Medobservatør', 'Medobservatør',
  'Medobservatør', 'Medobservatør',
  'Bestemmelsesmetode', 'Natursystem', 'Beskriv natursystem',
  'Livsmedium', 'Beskriv livsmedium', 'Antall livsmedium',
  'Art som livsmedium', 'Beskriv art som livsmedium',
  'Dybde min', 'Dybde maks', 'Høyde min', 'Høyde maks',
  'Andrehånds', 'Usikker artsbestemming',
  'Ikke spontan', 'Interessant observasjon', 'Ikke gjenfunnet', 'Ikke funnet',
  'Offentlig samling', 'Privat samling', 'Referansenummer i samling',
  'Beskrivelse artsbestemming', 'Bestemt av', 'Bestemt av (fritekst)',
  'Bestemmelsesår',
];

const SHEET_COLS = {
  Karplanter: COLS_KARP,
  Sopp:       COLS_SOPP,
  Moser:      COLS_KARP,
  Lav:        COLS_SOPP,
  Andre:      COLS_KARP,
};

function baseRow(o, cols, lat, lon) {
  const m = Object.fromEntries(cols.map(c => [c, '']));
  m['Artsnavn']                    = o.sp.sci || o.sp.no;
  m['Lokalitetsnavn']              = o.locName;
  m['Nord']                        = lat;
  m['Øst']                         = lon;
  m['Nøyaktighet']                 = o.noyakt;
  m['Fra dato']                    = fmtDate(o.dFrom);
  m['Til dato']                    = fmtDate(o.dTo || o.dFrom);
  m['Antall']                      = o.antall;
  m['Enhet']                       = o.enhet;
  m['Kommentar (synlig for alle)'] = o.komm;
  m['Bestemmelsesmetode']          = o.bestmet;
  m['Natursystem']                 = o.nin;
  m['Beskriv natursystem']         = o.nin;
  m['Livsmedium']                  = o.livs;
  m['Usikker artsbestemming']      = o.usikker ? 'X' : '';
  return cols.map(c => m[c] ?? '');
}

/**
 * Returns one or more rows for an observation:
 * - line     → one row per vertex
 * - polygon  → one row per grid point
 * - point / circle → one row at o.lat / o.lon
 */
function buildRows(o, cols) {
  const geom = o.geom || { mode: 'point' };
  if (geom.mode === 'line' && geom.vertices?.length) {
    return geom.vertices.map(([lat, lon]) => baseRow(o, cols, lat, lon));
  }
  if (geom.mode === 'polygon' && geom.gridPoints?.length) {
    return geom.gridPoints.map(([lat, lon]) => baseRow(o, cols, lat, lon));
  }
  return [baseRow(o, cols, o.lat, o.lon)];
}

function applyHeaderStyle(ws, cols) {
  for (let i = 0; i < cols.length; i++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[addr]) {
      ws[addr].s = {
        font:      { bold: true, color: { rgb: 'FFFFFF' } },
        fill:      { patternType: 'solid', fgColor: { rgb: '2D7D46' } },
        alignment: { horizontal: 'center' },
      };
    }
  }
}

const MAX_DATA_ROWS = 1999;

/**
 * Returns false when there is nothing to export.
 * Otherwise returns { overflowSheets } where overflowSheets is the total
 * number of sheets created for groups that had to be split (0 = no split).
 */
export function exportAP2(obs) {
  if (!obs.length) return false;

  const wb = XLSX.utils.book_new();
  let overflowSheets = 0;

  const groups = {};
  obs.forEach(o => {
    const grp   = o.sp.grp || 'Andre';
    const sheet = SHEET_COLS[grp] ? grp : 'Andre';
    (groups[sheet] ??= []).push(o);
  });

  for (const [sheetName, items] of Object.entries(groups)) {
    const cols    = SHEET_COLS[sheetName];
    const allRows = items.flatMap(o => buildRows(o, cols));

    // Chunk data rows into pages of MAX_DATA_ROWS
    const pages = [];
    for (let i = 0; i < allRows.length; i += MAX_DATA_ROWS) {
      pages.push(allRows.slice(i, i + MAX_DATA_ROWS));
    }

    if (pages.length > 1) overflowSheets += pages.length;

    pages.forEach((pageRows, idx) => {
      const name = idx === 0 ? sheetName : `${sheetName} ${idx + 1}`;
      const ws   = XLSX.utils.aoa_to_sheet([cols, ...pageRows]);
      applyHeaderStyle(ws, cols);
      ws['!cols'] = cols.map((_, i) => ({ wch: i < 2 ? 22 : i < 6 ? 14 : 12 }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
  }

  XLSX.writeFile(wb, `artsfunn_AP2_${today()}.xlsx`);
  return { overflowSheets };
}

export function exportCSV(obs) {
  if (!obs.length) return false;

  const hdr = [
    'Artsnavn', 'Vitenskapelig', 'Gruppe', 'Lokalitetsnavn',
    'Nord', 'Øst', 'Nøyaktighet', 'Fra dato', 'Til dato',
    'Antall', 'Enhet', 'NiN type', 'Livsmedium',
    'Bestemmelsesmetode', 'Kommentar', 'Usikker',
  ];
  const rows = obs.map(o => [
    o.sp.no, o.sp.sci, o.sp.grp, o.locName,
    o.lat, o.lon, o.noyakt, fmtDate(o.dFrom), fmtDate(o.dTo || o.dFrom),
    o.antall, o.enhet, o.nin, o.livs,
    o.bestmet, o.komm, o.usikker ? 'X' : '',
  ]);

  const csv = [hdr, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const a = document.createElement('a');
  a.href = `data:text/csv;charset=utf-8,﻿${encodeURIComponent(csv)}`;
  a.download = `artsfunn_${today()}.csv`;
  a.click();
  return true;
}
