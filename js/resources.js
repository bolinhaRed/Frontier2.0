// Recursos: o que cada hexágono rende (terreno + bioma + local especial).
import { TERRAINS, BIOME_YIELDS, POIS, RESOURCES } from './data.js';

export function yieldsFor(h) {
  const out = { ...TERRAINS[h.feature].yields };
  if (h.feature !== 'water') for (const [k, v] of Object.entries(BIOME_YIELDS[h.biome] || {})) {
    if (k in out || v > 0) out[k] = (out[k] || 0) + v;
  }
  if (h.poi) for (const [k, v] of Object.entries(POIS[h.poi].yields || {})) out[k] = (out[k] || 0) + v;
  return Object.entries(out).filter(([, v]) => v > 0).sort((a, b) => order(a[0]) - order(b[0]));
}
const ORDER = Object.keys(RESOURCES);
const order = k => ORDER.indexOf(k);
