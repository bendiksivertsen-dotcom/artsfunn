const OBS_KEY = 'artsfunn_obs_v1';

export function load() {
  try { return JSON.parse(localStorage.getItem(OBS_KEY) || '[]'); }
  catch { return []; }
}

export function save(obs) {
  try { localStorage.setItem(OBS_KEY, JSON.stringify(obs)); return true; }
  catch { return false; }
}

export function remove(obs, id) {
  const next = obs.filter(o => o.id !== id);
  save(next);
  return next;
}

export function clear() {
  localStorage.removeItem(OBS_KEY);
  return [];
}
