// Artsdatabanken APIs
const SEARCH_API = 'https://artskart.artsdatabanken.no/appapi/api/data/SearchTaxons';
const TAXON_API  = 'https://artskart.artsdatabanken.no/publicapi/api/taxon';

const SEARCH_TTL = 86_400_000;   // 24 h
const TAXON_TTL  = 604_800_000;  // 7 days
const MAX_RESULTS = 15;
const AP2_GROUPS  = new Set(['Karplanter', 'Sopp', 'Moser', 'Lav']);

// Built-in seed: instant results before API responds + offline fallback.
// id:0 means no API id known — grp is set directly, no taxon-detail fetch needed.
export const SEED = [
  { id: 138625, no: 'Blåbær',             sci: 'Vaccinium myrtillus',       grp: 'Karplanter' },
  { id: 0,      no: 'Tyttebær',           sci: 'Vaccinium vitis-idaea',      grp: 'Karplanter' },
  { id: 0,      no: 'Røsslyng',           sci: 'Calluna vulgaris',           grp: 'Karplanter' },
  { id: 0,      no: 'Einstape',           sci: 'Pteridium aquilinum',        grp: 'Karplanter' },
  { id: 0,      no: 'Skogstorkenebb',     sci: 'Geranium sylvaticum',        grp: 'Karplanter' },
  { id: 0,      no: 'Kvitveis',           sci: 'Anemone nemorosa',           grp: 'Karplanter' },
  { id: 0,      no: 'Mjødurt',            sci: 'Filipendula ulmaria',        grp: 'Karplanter' },
  { id: 0,      no: 'Enghumleblom',       sci: 'Geum rivale',                grp: 'Karplanter' },
  { id: 0,      no: 'Gulmaure',           sci: 'Galium verum',               grp: 'Karplanter' },
  { id: 0,      no: 'Tiriltunge',         sci: 'Lotus corniculatus',         grp: 'Karplanter' },
  { id: 0,      no: 'Bergfrue',           sci: 'Saxifraga cotyledon',        grp: 'Karplanter' },
  { id: 0,      no: 'Tepperot',           sci: 'Potentilla erecta',          grp: 'Karplanter' },
  { id: 0,      no: 'Marinøkkel',         sci: 'Botrychium lunaria',         grp: 'Karplanter' },
  { id: 0,      no: 'Vortebjørk',         sci: 'Betula pendula',             grp: 'Karplanter' },
  { id: 0,      no: 'Osp',               sci: 'Populus tremula',            grp: 'Karplanter' },
  { id: 0,      no: 'Gråor',             sci: 'Alnus incana',               grp: 'Karplanter' },
  { id: 0,      no: 'Selje',             sci: 'Salix caprea',               grp: 'Karplanter' },
  { id: 0,      no: 'Ormetelg',          sci: 'Dryopteris filix-mas',       grp: 'Karplanter' },
  { id: 0,      no: 'Skogburkne',        sci: 'Athyrium filix-femina',      grp: 'Karplanter' },
  { id: 0,      no: 'Bjønnkam',          sci: 'Blechnum spicant',           grp: 'Karplanter' },
  { id: 0,      no: 'Kantarell',         sci: 'Cantharellus cibarius',      grp: 'Sopp' },
  { id: 0,      no: 'Steinsopp',         sci: 'Boletus edulis',             grp: 'Sopp' },
  { id: 0,      no: 'Traktkantarell',    sci: 'Craterellus tubaeformis',    grp: 'Sopp' },
  { id: 0,      no: 'Honningsopp',       sci: 'Armillaria mellea',          grp: 'Sopp' },
  { id: 0,      no: 'Rød fluesopp',      sci: 'Amanita muscaria',           grp: 'Sopp' },
  { id: 0,      no: 'Hvit fluesopp',     sci: 'Amanita virosa',             grp: 'Sopp' },
  { id: 0,      no: 'Grønn fluesopp',    sci: 'Amanita phalloides',         grp: 'Sopp' },
  { id: 0,      no: 'Piggsopp',          sci: 'Hydnum repandum',            grp: 'Sopp' },
  { id: 0,      no: 'Skjermsopp',        sci: 'Macrolepiota procera',       grp: 'Sopp' },
  { id: 0,      no: 'Sjampinjong',       sci: 'Agaricus campestris',        grp: 'Sopp' },
  { id: 0,      no: 'Blodrødkremle',     sci: 'Russula sanguinea',          grp: 'Sopp' },
  { id: 0,      no: 'Furumorkkel',       sci: 'Gyromitra esculenta',        grp: 'Sopp' },
  { id: 0,      no: 'Vårmorkel',         sci: 'Morchella esculenta',        grp: 'Sopp' },
  { id: 0,      no: 'Torvmose (vorte)',  sci: 'Sphagnum papillosum',        grp: 'Moser' },
  { id: 0,      no: 'Torvmose (kjøtt)', sci: 'Sphagnum magellanicum',      grp: 'Moser' },
  { id: 0,      no: 'Fjærmose',         sci: 'Ptilium crista-castrensis',   grp: 'Moser' },
  { id: 0,      no: 'Etasjemose',       sci: 'Hylocomium splendens',        grp: 'Moser' },
  { id: 0,      no: 'Sigdmose',         sci: 'Drepanocladus aduncus',       grp: 'Moser' },
  { id: 0,      no: 'Knullav',          sci: 'Lobaria pulmonaria',          grp: 'Lav' },
  { id: 0,      no: 'Islandslav',       sci: 'Cetraria islandica',          grp: 'Lav' },
  { id: 0,      no: 'Reinlav (grå)',    sci: 'Cladonia rangiferina',        grp: 'Lav' },
  { id: 0,      no: 'Reinlav (krypande)', sci: 'Cladonia portentosa',       grp: 'Lav' },
  { id: 0,      no: 'Skjegglav',        sci: 'Usnea filipendula',           grp: 'Lav' },
];

// ── Cache helpers ──────────────────────────────────────────────────────────────

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { exp, val } = JSON.parse(raw);
    if (exp < Date.now()) { localStorage.removeItem(key); return null; }
    return val;
  } catch { return null; }
}

function cacheSet(key, val, ttl) {
  try {
    localStorage.setItem(key, JSON.stringify({ exp: Date.now() + ttl, val }));
  } catch {
    evictExpiredCache();
    try { localStorage.setItem(key, JSON.stringify({ exp: Date.now() + ttl, val })); } catch { /* quota still full */ }
  }
}

function evictExpiredCache() {
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith('artsfunn_c_')) continue;
    try {
      const { exp } = JSON.parse(localStorage.getItem(k));
      if (exp < now) localStorage.removeItem(k);
    } catch { localStorage.removeItem(k); }
  }
}

// ── API calls ──────────────────────────────────────────────────────────────────

/**
 * Search the full Artsdatabanken taxon name database.
 * Returns [{id, no, sci, grp}] where grp is null until fetchTaxonDetail is called.
 * Pass an AbortSignal to cancel in-flight requests when the query changes.
 */
export async function searchSpecies(query, signal) {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = 'artsfunn_c_s_' + q.toLowerCase();
  const hit = cacheGet(key);
  if (hit) return hit;

  const url = `${SEARCH_API}?name=${encodeURIComponent(q)}&maxCount=${MAX_RESULTS}`;
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const items = await res.json();
  const results = items.map(x => ({
    id:  x.Id,
    no:  x.PopularName || x.ScientificName,
    sci: x.ScientificName,
    grp: null,
  }));

  cacheSet(key, results, SEARCH_TTL);
  return results;
}

/**
 * Fetch full taxon record (including TaxonGroup) for a single taxon id.
 * Used after the user picks a species to resolve the AP2 sheet group.
 */
export async function fetchTaxonDetail(id) {
  if (!id) throw new Error('missing id');

  const key = 'artsfunn_c_t_' + id;
  const hit = cacheGet(key);
  if (hit) return hit;

  const res = await fetch(`${TAXON_API}/${id}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const x = await res.json();
  const detail = {
    id:  x.TaxonId,
    no:  x.PrefferedPopularname || x.ValidScientificName,
    sci: x.ValidScientificName,
    grp: AP2_GROUPS.has(x.TaxonGroup) ? x.TaxonGroup : 'Andre',
  };

  cacheSet(key, detail, TAXON_TTL);
  return detail;
}

export function filterSeed(query) {
  const q = query.toLowerCase();
  return SEED.filter(s =>
    s.no.toLowerCase().includes(q) || s.sci.toLowerCase().includes(q)
  ).slice(0, MAX_RESULTS);
}
