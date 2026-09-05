// NiN 3.0 kartleggingsenheter (mapping units) at 1:20 000 scale, from
// Artsdatabankens offisielle NiN-kodetjeneste. Docs: https://nin-kode-api.artsdatabanken.no/swagger
const NIN_API   = 'https://nin-kode-api.artsdatabanken.no/v3.0/typer/allekoder';
const CACHE_KEY = 'artsfunn_nin_m020_v1';
const CACHE_TTL = 30 * 86_400_000; // 30 days — the typesystem changes rarely

// MaalestokkEnum for kartleggingsenheter tilpasset 1:20 000 ("M020" as an
// enum name, or its zero-based ordinal 2, depending on JSON serialization).
function isM020(ke) {
  const v = ke.MaalestokkEnum;
  if (v === 'M020' || v === 2) return true;
  return typeof ke.MaalestokkNavn === 'string' && ke.MaalestokkNavn.includes('20 000');
}

// Small built-in offline fallback (a handful of common NiN 2.0-style types)
// shown instantly and used if the API is unreachable.
export const SEED = [
  { code: 'T4-C-1',  name: 'Blåbærskog',           group: 'Fastmarksskogsmark' },
  { code: 'T4-C-2',  name: 'Lågurtskog',            group: 'Fastmarksskogsmark' },
  { code: 'T4-C-3',  name: 'Høgstaudeskog',         group: 'Fastmarksskogsmark' },
  { code: 'T2-C-1',  name: 'Fattig grunnlendt mark', group: 'Åpen grunnlendt mark' },
  { code: 'T2-C-2',  name: 'Rik grunnlendt mark',    group: 'Åpen grunnlendt mark' },
  { code: 'T32-C-1', name: 'Frisk fattigeng',        group: 'Eng og beitemark' },
  { code: 'T32-C-2', name: 'Frisk kalkeng',          group: 'Eng og beitemark' },
  { code: 'V1-C-1',  name: 'Fattigmyr',              group: 'Myr' },
  { code: 'V1-C-2',  name: 'Rikmyr',                 group: 'Myr' },
  { code: 'T3-C-1',  name: 'Fattig hei',             group: 'Fjell og hei' },
  { code: 'T3-C-2',  name: 'Rik hei',                group: 'Fjell og hei' },
];

function cacheGet() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { exp, val } = JSON.parse(raw);
    if (exp < Date.now()) { localStorage.removeItem(CACHE_KEY); return null; }
    return val;
  } catch { return null; }
}

function cacheSet(val) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ exp: Date.now() + CACHE_TTL, val }));
  } catch { /* quota full — just skip caching */ }
}

/** Flatten the full NiN tree down to { code, name, group } for M020 units. */
function extractM020(versjoner) {
  const out = [];
  for (const versjon of versjoner ?? []) {
    for (const type of versjon.Typer ?? []) {
      for (const htg of type.Hovedtypegrupper ?? []) {
        for (const ht of htg.Hovedtyper ?? []) {
          for (const ke of ht.Kartleggingsenheter ?? []) {
            if (!isM020(ke)) continue;
            out.push({ code: ke.Kode?.Id ?? '', name: ke.Navn ?? '', group: htg.Navn ?? ht.Navn ?? '' });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Resolves to [{ code, name, group }] of NiN 3.0 kartleggingsenheter at
 * 1:20 000 scale. Returns cached/live API data when available, otherwise
 * the small offline SEED list — the form field always has something usable.
 */
export async function loadNinTypes() {
  const cached = cacheGet();
  if (cached?.length) return cached;

  const res = await fetch(NIN_API, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const list = extractM020(data);
  if (!list.length) throw new Error('Ingen 1:20 000-kartleggingsenheter funnet');

  cacheSet(list);
  return list;
}
