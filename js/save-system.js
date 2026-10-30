// Gravação v2: 3 espaços de campanha + expedição em curso, mapa guardado dentro do save,
// versões com migração passo a passo, cópia de segurança da gravação anterior, exportar/importar JSON.
import { VERSION } from './data.js';
import { serializeMap, restoreMap, MAP_FORMAT } from './map-generator.js';
import { encode } from './exploration.js';
import { SCHEMA, syncStructures, createCampaign } from './game.js';
import { MAP_SIZES } from './data.js';

const PREFIX = 'frontier.v2.';
const SLOT_KEY = n => `${PREFIX}slot.${n}`;
const EXP_KEY = `${PREFIX}expedition`;
const LAST_KEY = `${PREFIX}last`;
const SETTINGS_KEY = 'frontier.settings.v1';
const V1_KEY = 'frontier.save.v1';
export const SLOTS = [1, 2, 3];

function read(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function remove(k) { try { localStorage.removeItem(k); } catch { /* */ } }

export const loadSettings = () => ({ motion: true, coords: false, seenHelp: false, music: 0.55, sfx: 0.8, muted: false, vibrate: true, ...(read(SETTINGS_KEY) || {}) });
export const saveSettings = s => write(SETTINGS_KEY, s);

// ---------- converter estado ↔ save ----------
const TRANSIENT = new Set(['map', 'fog', '_territory', '_returnField']);
export function toSave(G, extra = {}) {
  const state = {};
  for (const [k, v] of Object.entries(G)) if (!TRANSIENT.has(k)) state[k] = v;
  return {
    game: 'frontier', schema: SCHEMA, gameVersion: VERSION, mapFormat: MAP_FORMAT, savedAt: new Date().toISOString(),
    meta: metaOf(G), map: serializeMap(G.map), fog: encode(G.fog), state, ...extra
  };
}
export function metaOf(G) {
  return { mode: G.mode, seed: G.seed, turn: G.turn, pop: G.pop || 0, chapter: G.missions?.chapter || 0,
    region: G.map.regions[G.map.hexes[G.map.start].region]?.name || G.seed, explorers: G.explorers.length };
}

function decodeFog(str, n) {
  const bin = atob(str), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 2) >> ((i & 3) * 2)) & 3;
  return out;
}

// Migrações: cada função leva um save do esquema N para N+1.
const MIGRATIONS = {
  // v1 (Fase 1): só seed + névoa. O gerador mudou, por isso recomeça-se o mesmo continente (mesma seed) com as regras novas.
  1: old => {
    const { cols, rows } = MAP_SIZES.campaign;
    const G = createCampaign(old.seed, cols, rows);
    const s = toSave(G);
    s.note = 'Campanha da versão 0.1 convertida: o continente foi redesenhado pelo novo gerador e a exploração recomeça (mesma seed).';
    return s;
  }
};

export function migrate(data) {
  if (!data) return { error: 'Save vazio.' };
  let d = data, schema = d.schema || 1;
  if (schema > SCHEMA) return { error: `Este save é de uma versão mais recente do FRONTIER (formato ${schema}). Atualiza o jogo para o abrir — o ficheiro não foi alterado.` };
  const notes = [];
  while (schema < SCHEMA) {
    d = MIGRATIONS[schema](d);
    if (d.note) notes.push(d.note);
    schema = d.schema;
  }
  return { data: d, notes };
}

export function fromSave(raw) {
  const m = migrate(raw);
  if (m.error) return m;
  const d = m.data;
  const map = restoreMap(d.map);
  const G = { ...structuredClone(d.state), map, fog: decodeFog(d.fog, map.hexes.length) };
  syncStructures(G);
  return { G, notes: m.notes, raw: d };
}

// ---------- espaços de campanha ----------
export function slotInfo(n) {
  const d = read(SLOT_KEY(n));
  const bak = read(SLOT_KEY(n) + '.bak');
  if (!d) return { n, empty: true, hasBackup: !!bak };
  return { n, empty: false, meta: d.meta || { seed: d.seed, turn: d.turn, region: d.regionName }, savedAt: d.savedAt, schema: d.schema || 1, hasBackup: !!bak, newer: (d.schema || 1) > SCHEMA };
}
export const listSlots = () => SLOTS.map(slotInfo);

export function saveSlot(n, G) {
  const prev = localStorage.getItem(SLOT_KEY(n));
  try { if (prev) localStorage.setItem(SLOT_KEY(n) + '.bak', prev); } catch { /* */ }
  const ok = write(SLOT_KEY(n), toSave(G, { slot: n }));
  write(LAST_KEY, { kind: 'campaign', slot: n });
  return ok;
}
export function loadSlot(n, backup = false) {
  const d = read(SLOT_KEY(n) + (backup ? '.bak' : ''));
  if (!d) return { error: 'Espaço vazio.' };
  return fromSave(d);
}
export function restoreBackup(n) {
  const bak = localStorage.getItem(SLOT_KEY(n) + '.bak'); if (!bak) return false;
  const cur = localStorage.getItem(SLOT_KEY(n));
  try { localStorage.setItem(SLOT_KEY(n), bak); if (cur) localStorage.setItem(SLOT_KEY(n) + '.bak', cur); } catch { return false; }
  return true;
}
export function deleteSlot(n) { remove(SLOT_KEY(n)); remove(SLOT_KEY(n) + '.bak'); const l = read(LAST_KEY); if (l?.slot === n) remove(LAST_KEY); }

export function exportSlotText(n) { const d = read(SLOT_KEY(n)); return d ? JSON.stringify(d) : null; }
export function importIntoSlot(n, text) {
  let d; try { d = JSON.parse(text); } catch { return { error: 'Isto não é um ficheiro JSON válido.' }; }
  if (d.game !== 'frontier' && !d.fog) return { error: 'Este ficheiro não é um save do FRONTIER.' };
  const r = fromSave(d); if (r.error) return r;
  if (r.G.mode !== 'campaign') return { error: 'Este save não é de uma campanha.' };
  saveSlot(n, r.G);
  return { ok: true, notes: r.notes };
}
export function downloadSlot(n) {
  const txt = exportSlotText(n); if (!txt) return false;
  const meta = slotInfo(n).meta || {};
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = `frontier-${meta.region || 'campanha'}-turno${meta.turn || 0}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return true;
  } catch { return false; }
}

// ---------- expedição em curso ----------
export const saveExpedition = G => { write(EXP_KEY, toSave(G)); write(LAST_KEY, { kind: 'expedition' }); };
export const loadExpedition = () => { const d = read(EXP_KEY); return d ? fromSave(d) : null; };
export const clearExpedition = () => { remove(EXP_KEY); const l = read(LAST_KEY); if (l?.kind === 'expedition') remove(LAST_KEY); };
export const hasExpedition = () => !!read(EXP_KEY);

export function lastPlayed() {
  const l = read(LAST_KEY);
  if (l?.kind === 'campaign' && read(SLOT_KEY(l.slot))) return l;
  if (l?.kind === 'expedition' && hasExpedition()) return l;
  const s = SLOTS.find(n => read(SLOT_KEY(n))); return s ? { kind: 'campaign', slot: s } : null;
}

// Converte o save único da Fase 1 para o espaço 1 (uma vez).
export function migrateLegacy() {
  const old = read(V1_KEY);
  if (!old || read(SLOT_KEY(1))) return null;
  const r = fromSave(old);
  if (r.error) return null;
  saveSlot(1, r.G); remove(V1_KEY);
  return r.notes?.[0] || 'Campanha antiga convertida.';
}
