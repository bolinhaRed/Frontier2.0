// Névoa de guerra: 0 = desconhecido, 1 = descoberto (esboço do cartógrafo), 2 = explorado (a cores).
import { distance } from './hex-coordinates.js';
import { isLand } from './map-generator.js';

export const UNKNOWN = 0, DISCOVERED = 1, EXPLORED = 2;

export function createFog(map, saved = null) {
  const state = new Uint8Array(map.hexes.length);
  if (saved) {
    decode(saved, state);
  } else {
    const s = map.hexes[map.start];
    for (const h of map.hexes) if (distance(h.q, h.r, s.q, s.r) <= 1) state[h.id] = EXPLORED;
    for (const h of map.hexes) if (state[h.id] === EXPLORED) revealAround(map, state, h);
  }
  return state;
}

function revealAround(map, state, h, radius = 1) {
  for (const n of map.hexes) {
    if (state[n.id] === UNKNOWN && distance(n.q, n.r, h.q, h.r) <= radius) state[n.id] = DISCOVERED;
  }
}

// Só se explora um hexágono descoberto que toque no território explorado.
export function canExplore(map, state, h) {
  if (!h || state[h.id] !== DISCOVERED) return false;
  return map.nbrs(h).some(n => state[n.id] === EXPLORED);
}

// Explora e devolve a lista de hexágonos recém-revelados (para animar).
export function explore(map, state, h) {
  if (!canExplore(map, state, h)) return null;
  state[h.id] = EXPLORED;
  const before = new Set(map.nbrs(h).filter(n => state[n.id] === UNKNOWN).map(n => n.id));
  // colinas e montanhas dão vista mais larga
  const radius = (h.feature === 'mountains' || h.feature === 'hills' || h.poi === 'tower') ? 2 : 1;
  revealAround(map, state, h, radius);
  const revealed = map.hexes.filter(n => state[n.id] === DISCOVERED && (before.has(n.id) || distance(n.q, n.r, h.q, h.r) <= radius) && n.id !== h.id).map(n => n.id);
  return revealed;
}

export function revealAll(state) { state.fill(EXPLORED); }

export function stats(map, state) {
  let explored = 0, land = 0, pois = 0;
  for (const h of map.hexes) {
    if (state[h.id] === EXPLORED) { explored++; if (h.poi) pois++; }
    if (isLand(h)) land++;
  }
  return { explored, land, pois };
}

// Guardar de forma compacta (2 bits por hexágono → base64)
export function encode(state) {
  const bytes = new Uint8Array(Math.ceil(state.length / 4));
  for (let i = 0; i < state.length; i++) bytes[i >> 2] |= state[i] << ((i & 3) * 2);
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}
function decode(str, state) {
  const bin = atob(str);
  for (let i = 0; i < state.length; i++) state[i] = (bin.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3;
}
