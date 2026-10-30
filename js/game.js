// FRONTIER — regras do núcleo (Fase 2). Módulo puro: sem DOM, testável em Node.
// Exploradores, pontos de movimento, mantimentos, mochila, recolha, entrega, acampamentos, postos, aldeia.
import { RULES, TERRAINS, TRAITS, SEASONS, TURNS_PER_SEASON, CAMPAIGN_START, UPGRADES, RECRUIT_COST, FOCUS, VALUE,
         EXPLORER_NAMES, EXPLORER_COLORS, BASE_RESOURCES } from './data.js';
import { distance } from './hex-coordinates.js';
import { generateMap, isLand } from './map-generator.js';
import { yieldsFor } from './resources.js';
import { UNKNOWN, DISCOVERED, EXPLORED } from './exploration.js';

export const SCHEMA = 2;

// ---------- criação ----------
function baseState(mode, map) {
  return {
    schema: SCHEMA, mode, seed: map.seed, map, fog: new Uint8Array(map.hexes.length),
    turn: 1, maxTurns: 0, structures: {}, explorers: [], used: {}, investigated: {}, flags: {},
    regionsSeen: [], claimed: [], stats: { explored: 0, delivered: {}, finds: [], camps: 0, regions: 0 },
    log: [], hints: {}, pendingEvent: null, over: null, nextExplorer: 0, fogOn: true
  };
}

function newExplorer(G, hex, extra = {}) {
  const i = G.nextExplorer++;
  const ex = { id: 'e' + i, name: EXPLORER_NAMES[(hashSeed(G.seed) + i) % EXPLORER_NAMES.length], color: EXPLORER_COLORS[i % EXPLORER_COLORS.length],
    hex, pm: RULES.PM, supplies: RULES.SUPPLIES[G.mode], maxSupplies: RULES.SUPPLIES[G.mode], cargo: [],
    fatigue: 0, hunger: 0, acted: false, restBonus: 0, away: 0, undo: null, ...extra };
  G.explorers.push(ex);
  return ex;
}
const hashSeed = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function createCampaign(seed, cols, rows, mapOverride) {
  const map = mapOverride || generateMap({ seed, cols, rows });
  const G = baseState('campaign', map);
  const s = map.start;
  G.structures[s] = makeStructure('village', { name: map.regions[map.hexes[s].region]?.name || 'Aldeia' });
  G.stock = { ...CAMPAIGN_START.stock, herbs: 0, furs: 0, crystals: 0 };
  G.pop = CAMPAIGN_START.pop; G.focus = 'food'; G.upgrades = {}; G.starving = false;
  G.missions = { chapter: 1, done: {} };
  for (let i = 0; i < CAMPAIGN_START.explorers; i++) newExplorer(G, s);
  initFog(G);
  return G;
}

export function createExpedition(seed, cols, rows, length = 'normal', mapOverride) {
  const map = mapOverride || generateMap({ seed, cols, rows });
  const G = baseState('expedition', map);
  const s = map.start;
  G.structures[s] = makeStructure('base', { name: 'Acampamento-base' });
  G.maxTurns = RULES.EXPEDITION_TURNS[length] || 12; G.length = length;
  G.delivered = {}; G.baseSupplies = RULES.BASE_SUPPLIES;
  const ex = newExplorer(G, s, { members: RULES.EXPEDITION_MEMBERS });
  ex.name = 'Expedição de ' + ex.name;
  initFog(G);
  return G;
}

function initFog(G) {
  const s = G.map.hexes[G.map.start];
  for (const h of G.map.hexes) if (distance(h.q, h.r, s.q, s.r) <= 1) G.fog[h.id] = EXPLORED;
  reveal(G, s, 2);
  syncStructures(G);
  G.stats.explored = countExplored(G);
  markRegion(G, s);
}

// ---------- utilidades ----------
export const hexOf = (G, ex) => G.map.hexes[ex.hex];
export const season = G => SEASONS[Math.floor((G.turn - 1) / TURNS_PER_SEASON) % 4];
export const year = G => Math.floor((G.turn - 1) / (TURNS_PER_SEASON * 4)) + 1;
export const trait = (G, h) => (h && h.region >= 0 ? TRAITS[G.map.regions[h.region]?.trait] : null) || null;
export const traitSeen = (G, h) => h && h.region >= 0 && G.regionsSeen.includes(h.region);
const countExplored = G => G.fog.reduce((n, v) => n + (v === EXPLORED ? 1 : 0), 0);
export const activeExplorers = G => G.explorers.filter(e => !e.away);
export const packCap = G => RULES.PACK + (G.upgrades?.pack ? RULES.PACK_UPGRADE : 0);
export const freeSlots = (G, ex) => packCap(G) - ex.cargo.length;

// Sincroniza as estruturas com os hexágonos (para o desenho).
export function syncStructures(G) {
  for (const h of G.map.hexes) { h.structure = null; h.flag = false; }
  for (const [id, st] of Object.entries(G.structures)) {
    const h = G.map.hexes[id];
    h.structure = { village: 'village', outpost: 'tower', base: 'camp', camp: 'camp', keep: 'keep' }[st.type];
    h.flag = st.type !== 'village';
  }
  G._territory = null; G._returnField = null;
}

export const SETTLEMENT_TYPES = ['village', 'outpost', 'keep', 'base'];

// Estruturas. Cada povoação já tem a sua zona de influência (raio) e um campo de armazém próprio,
// preparado para a fase em que os postos avançados guardarem e produzirem por conta própria.
// Na Fase 2: armazém partilhado (G.stock); 'store' só é usado pelos acampamentos (carga guardada no local).
export const STRUCTURE_DEFS = {
  village: { territory: 1, work: 2, vision: 2, sharedStock: true },
  outpost: { territory: 1, work: 2, vision: 2, sharedStock: true, ownStoreLater: true },
  keep:    { territory: 2, work: 2, vision: 3, sharedStock: true, ownStoreLater: true },
  base:    { territory: 1, work: 0, vision: 2 },
  camp:    { territory: 0, work: 0, vision: 2, temporary: true, localStore: true }
};
export function makeStructure(type, extra = {}) {
  const d = STRUCTURE_DEFS[type];
  return { type, influence: d.territory, workRadius: d.work, store: d.localStore ? [] : null, ...extra };
}
export const settlements = G => Object.entries(G.structures).filter(([, s]) => SETTLEMENT_TYPES.includes(s.type)).map(([id]) => +id);
export const isSettlement = (G, id) => SETTLEMENT_TYPES.includes(G.structures[id]?.type);

export function territory(G) {
  if (G._territory) return G._territory;
  const set = new Set();
  for (const id of settlements(G)) {
    const c = G.map.hexes[id], rad = G.structures[id].influence ?? RULES.TERRITORY_RADIUS;
    for (const h of G.map.hexes) if (distance(h.q, h.r, c.q, c.r) <= rad) set.add(h.id);
  }
  G._territory = set;
  return set;
}
export const inTerritory = (G, id) => territory(G).has(id);

// ---------- névoa ----------
export function reveal(G, h, radius = 1) {
  const changed = [];
  for (const n of G.map.hexes) {
    if (G.fog[n.id] === UNKNOWN && distance(n.q, n.r, h.q, h.r) <= radius) { G.fog[n.id] = DISCOVERED; changed.push(n.id); }
  }
  if (changed.length) G._returnField = null;
  return changed;
}
const visionOf = (G, h) => (h.feature === 'mountains' || h.feature === 'hills' || h.poi === 'tower' || G.structures[h.id]) ? 2 : 1;

function markRegion(G, h) {
  if (h.region < 0 || G.regionsSeen.includes(h.region)) return null;
  G.regionsSeen.push(h.region); G.stats.regions = G.regionsSeen.length;
  return h.region;
}

// ---------- mantimentos e autonomia ----------
export function consumption(G, ex, id = ex.hex) {
  if (inTerritory(G, id)) return 0;
  const h = G.map.hexes[id];
  let c = 1;
  if (h.biome === 'sandlands') c += 1;
  if (season(G) === 'Inverno') c += 1;
  const t = trait(G, h);
  if (t?.supply === 'plus1') c += 1;
  if (t?.supply === 'half') c = Math.ceil(c / 2);
  if (G.structures[id]?.type === 'camp') c = Math.max(0, c - 1);
  return c;
}
export function autonomy(G, ex, id = ex.hex, supplies = ex.supplies) {
  const c = consumption(G, ex, id);
  return c === 0 ? Infinity : Math.floor(supplies / c);
}

export function maxPm(G, ex) {
  const base = ex.fatigue >= 2 ? RULES.PM_EXHAUSTED : ex.fatigue === 1 ? RULES.PM_TIRED : RULES.PM + (G.upgrades?.boots ? 1 : 0);
  return base;
}

// ---------- movimento ----------
export function enterCost(G, id) {
  const h = G.map.hexes[id];
  if (G.fog[id] === UNKNOWN) return Infinity;
  let c = TERRAINS[h.feature].move;
  if (c >= 9) return Infinity;
  if (G.fog[id] === DISCOVERED) c += RULES.EXPLORE_EXTRA;
  const t = trait(G, h);
  if (t?.move && t.move.terrain.includes(h.feature)) c += t.move.add;
  if (h.biome === 'icelands' && season(G) === 'Inverno') c += 1;
  return c;
}

class Heap { // fila de prioridade mínima simples
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function dijkstra(G, sources, budget = Infinity) {
  const dist = new Map(), prev = new Map(), h = new Heap();
  for (const s of sources) { dist.set(s, 0); h.push([0, s]); }
  while (h.size) {
    const [d, id] = h.pop();
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const n of G.map.nbrs(G.map.hexes[id])) {
      const c = enterCost(G, n.id); if (!isFinite(c)) continue;
      const nd = d + c; if (nd > budget) continue;
      if (nd < (dist.get(n.id) ?? Infinity)) { dist.set(n.id, nd); prev.set(n.id, id); h.push([nd, n.id]); }
    }
  }
  return { dist, prev };
}

// Hexágonos ao alcance neste turno: Map id → custo
export function reachable(G, ex) {
  if (ex.away || ex.acted || G.over) return { dist: new Map(), prev: new Map() };
  const r = dijkstra(G, [ex.hex], ex.pm);
  r.dist.delete(ex.hex);
  return r;
}

export function pathTo(reach, from, to) {
  const path = []; let cur = to;
  while (cur !== undefined && cur !== from) { path.unshift(cur); cur = reach.prev.get(cur); }
  return cur === from ? path : null;
}

// Custo de regresso (PM) desde cada hexágono conhecido até à povoação mais próxima.
export function returnField(G) {
  if (!G._returnField) {
    // custo invertido: andar de A para B paga a entrada em B; aproximação boa para estimar turnos
    G._returnField = dijkstra(G, settlements(G)).dist;
  }
  return G._returnField;
}
export function returnTurns(G, ex, id = ex.hex) {
  const pm = RULES.PM + (G.upgrades?.boots ? 1 : 0);
  const d = returnField(G).get(id);
  if (d === undefined) return Infinity;
  return Math.ceil(d / pm);
}

// Pré-visualização de um movimento: custo, exploração, autonomia depois, regresso.
export function previewMove(G, ex, reach, target) {
  const path = pathTo(reach, ex.hex, target); if (!path) return null;
  const cost = reach.dist.get(target);
  const exploreSteps = path.filter(id => G.fog[id] === DISCOVERED).length;
  const back = returnTurns(G, ex, target);
  const aut = autonomy(G, ex, target);
  return { path, cost, exploreSteps, explorePm: exploreSteps * RULES.EXPLORE_EXTRA, pmLeft: ex.pm - cost,
           autonomy: aut, back, consumption: consumption(G, ex, target),
           risky: G.mode === 'campaign' || true ? (isFinite(back) && isFinite(aut) && back > aut) : false,
           settlement: isSettlement(G, target) };
}

// Move ao longo do caminho; devolve o que aconteceu para a interface animar e anunciar.
export function moveExplorer(G, ex, target) {
  const reach = reachable(G, ex);
  const path = pathTo(reach, ex.hex, target);
  if (!path || !path.length) return null;
  const start = ex.hex, startPm = ex.pm;
  const out = { path, revealed: [], explored: [], regions: [], pois: [], arrived: null };
  for (const id of path) {
    ex.pm -= enterCost(G, id);
    ex.hex = id;
    const h = G.map.hexes[id];
    if (G.fog[id] !== EXPLORED) {
      G.fog[id] = EXPLORED; out.explored.push(id);
      if (h.poi) out.pois.push(id);
    }
    out.revealed.push(...reveal(G, h, visionOf(G, h)));
    const r = markRegion(G, h); if (r !== null) out.regions.push(r);
  }
  ex.pm = Math.max(0, ex.pm);
  G.stats.explored = countExplored(G);
  if (out.explored.length) G._returnField = null;
  ex.undo = (!out.explored.length && !out.revealed.length && !out.regions.length) ? { hex: start, pm: startPm } : null;
  if (isSettlement(G, target)) { out.arrived = arrive(G, ex); ex.undo = null; }
  return out;
}

export function undoMove(G, ex) {
  if (!ex.undo) return false;
  ex.hex = ex.undo.hex; ex.pm = ex.undo.pm; ex.undo = null;
  return true;
}

// ---------- chegar a uma povoação: entregar e reabastecer ----------
export function arrive(G, ex) {
  const delivered = {}, lost = {};
  for (const r of ex.cargo) {
    if (G.mode === 'campaign') {
      if ((G.stock[r] || 0) >= RULES.STORE_CAP) lost[r] = (lost[r] || 0) + 1;
      else { G.stock[r] = (G.stock[r] || 0) + 1; delivered[r] = (delivered[r] || 0) + 1; }
    } else { G.delivered[r] = (G.delivered[r] || 0) + 1; delivered[r] = (delivered[r] || 0) + 1; }
    G.stats.delivered[r] = (G.stats.delivered[r] || 0) + (lost[r] ? 0 : 1);
  }
  ex.cargo = [];
  let refilled = 0;
  const need = ex.maxSupplies - ex.supplies;
  if (G.mode === 'campaign') {      // cada mantimento custa 1 comida + 1 água do armazém
    refilled = Math.max(0, Math.min(need, G.stock.food, G.stock.water));
    G.stock.food -= refilled; G.stock.water -= refilled; ex.supplies += refilled;
  } else {                          // expedição: a base tem uma reserva limitada
    refilled = Math.max(0, Math.min(need, G.baseSupplies || 0));
    G.baseSupplies -= refilled; ex.supplies += refilled;
  }
  if (ex.hunger === 0 && ex.fatigue > 0 && G.mode === 'campaign') ex.fatigue = 0;
  return { delivered, lost, refilled, short: ex.supplies < ex.maxSupplies };
}

// ---------- recolha ----------
export function hexYields(G, h) {
  const out = Object.fromEntries(yieldsFor(h));
  const t = trait(G, h);
  if (t?.yield && t.yield.terrain.includes(h.feature)) out[t.yield.res] = (out[t.yield.res] || 0) + t.yield.add;
  return out;
}
export const reserveLeft = (G, id) => RULES.RESERVE - (G.used[id] || 0);

export function gatherCheck(G, ex) {
  const h = hexOf(G, ex);
  if (ex.away) return 'Este explorador está a recuperar.';
  if (ex.acted) return 'Já fez a sua ação neste turno.';
  if (ex.fatigue >= 2) return 'Exausto: não consegue recolher. Precisa de comer e descansar.';
  if (!isLand(h) && h.feature !== 'lake') return 'Não há nada para recolher aqui.';
  if (reserveLeft(G, h.id) <= 0) return 'Este hexágono está esgotado até à próxima estação.';
  if (freeSlots(G, ex) <= 0) return 'A mochila está cheia. Entrega a carga, guarda-a num acampamento ou larga algo.';
  return null;
}

// Proposta de recolha: o que o hexágono dá e uma escolha automática que cabe na mochila.
export function gatherOffer(G, ex) {
  const h = hexOf(G, ex);
  const y = hexYields(G, h);
  if (G.upgrades?.tools) { const main = Object.entries(y).sort((a, b) => b[1] - a[1])[0]; if (main) y[main[0]] += 1; }
  const free = freeSlots(G, ex);
  const pick = {}; let left = free;
  const order = Object.keys(y).sort((a, b) => VALUE[b] - VALUE[a] || y[b] - y[a]);
  for (const r of order) { const n = Math.min(left, y[r]); if (n > 0) { pick[r] = n; left -= n; } }
  return { yields: y, free, pick, total: Object.values(y).reduce((a, b) => a + b, 0) };
}

export function gather(G, ex, pick) {
  const err = gatherCheck(G, ex); if (err) return { error: err };
  const offer = gatherOffer(G, ex);
  pick = pick || offer.pick;
  let n = 0;
  for (const [r, k] of Object.entries(pick)) {
    const take = Math.min(k, offer.yields[r] || 0, freeSlots(G, ex));
    for (let i = 0; i < take; i++) ex.cargo.push(r);
    n += take;
  }
  G.used[ex.hex] = (G.used[ex.hex] || 0) + 1;
  ex.acted = true; ex.pm = 0; ex.undo = null;
  return { taken: n };
}

export function dropCargo(G, ex, index) { if (index >= 0 && index < ex.cargo.length) return ex.cargo.splice(index, 1)[0]; return null; }

// Cozinhar: 1 comida + 1 água da mochila → 1 mantimento (não gasta a ação).
export function canCook(ex) { return ex.cargo.includes('food') && ex.cargo.includes('water') && ex.supplies < ex.maxSupplies; }
export function cook(G, ex) {
  if (!canCook(ex)) return false;
  ex.cargo.splice(ex.cargo.indexOf('food'), 1); ex.cargo.splice(ex.cargo.indexOf('water'), 1); ex.supplies++;
  return true;
}

// ---------- acampar, descansar, posto avançado ----------
export function campCheck(G, ex) {
  const h = hexOf(G, ex);
  if (ex.acted) return 'Já fez a sua ação neste turno.';
  if (G.structures[h.id]) return 'Já há uma estrutura aqui.';
  if (!isLand(h) || h.feature === 'river') return 'Não se pode acampar aqui.';
  if (h.poi) return 'Não se acampa em cima de um local especial.';
  if (inTerritory(G, h.id)) return 'Estás dentro do território: um acampamento não serve de nada aqui.';
  const wood = ex.cargo.filter(r => r === 'wood').length;
  if (wood < RULES.CAMP_COST.wood) return `Precisas de ${RULES.CAMP_COST.wood} madeira na mochila.`;
  return null;
}
export function makeCamp(G, ex) {
  const err = campCheck(G, ex); if (err) return { error: err };
  for (let i = 0; i < RULES.CAMP_COST.wood; i++) ex.cargo.splice(ex.cargo.indexOf('wood'), 1);
  G.structures[ex.hex] = makeStructure('camp');
  syncStructures(G);
  const revealed = reveal(G, hexOf(G, ex), 2);
  ex.acted = true; ex.pm = 0; ex.undo = null; G.stats.camps++;
  return { revealed };
}
export function campDeposit(G, ex) { const st = G.structures[ex.hex]; if (st?.type !== 'camp') return 0; const n = ex.cargo.length; st.store.push(...ex.cargo); ex.cargo = []; return n; }
export function campWithdraw(G, ex) { const st = G.structures[ex.hex]; if (st?.type !== 'camp') return 0; let n = 0; while (st.store.length && freeSlots(G, ex) > 0) { ex.cargo.push(st.store.shift()); n++; } return n; }

export function rest(G, ex) {
  if (ex.acted) return { error: 'Já fez a sua ação neste turno.' };
  if (ex.hunger === 0) ex.fatigue = 0; else ex.fatigue = Math.max(1, ex.fatigue - 1);
  ex.restBonus = 1; ex.acted = true; ex.pm = 0; ex.undo = null;
  return { ok: true };
}

export function outpostCheck(G, ex) {
  if (G.mode !== 'campaign') return 'Só na campanha.';
  const h = hexOf(G, ex);
  if (ex.acted) return 'Já fez a sua ação neste turno.';
  if (G.structures[h.id]) return 'Já há uma estrutura aqui.';
  if (!isLand(h) || h.feature === 'mountains' || h.feature === 'river' || h.poi) return 'Escolhe planície, bosque, floresta, colinas ou pântano sem local especial.';
  const near = settlements(G).map(id => G.map.hexes[id]).some(s => distance(s.q, s.r, h.q, h.r) < RULES.OUTPOST_MIN_DIST);
  if (near) return `Demasiado perto de outra povoação (mínimo ${RULES.OUTPOST_MIN_DIST} hexágonos).`;
  for (const [r, n] of Object.entries(RULES.OUTPOST_COST)) if ((G.stock[r] || 0) < n) return `Faltam recursos no armazém: ${costText(RULES.OUTPOST_COST)}.`;
  return null;
}
export function foundOutpost(G, ex) {
  const err = outpostCheck(G, ex); if (err) return { error: err };
  for (const [r, n] of Object.entries(RULES.OUTPOST_COST)) G.stock[r] -= n;
  const h = hexOf(G, ex);
  G.structures[h.id] = makeStructure('outpost', { name: 'Posto de ' + (G.map.regions[h.region]?.name || '?'), region: h.region });
  if (h.region >= 0 && !G.claimed.includes(h.region)) G.claimed.push(h.region);
  syncStructures(G);
  const revealed = reveal(G, h, 2);
  ex.acted = true; ex.pm = 0; ex.undo = null;
  const arrived = arrive(G, ex);
  return { revealed, arrived };
}

export const costText = cost => Object.entries(cost).map(([r, n]) => `${n} ${({ food: 'comida', wood: 'madeira', stone: 'pedra', ore: 'minério', gold: 'ouro', water: 'água', furs: 'peles', herbs: 'ervas', crystals: 'cristais' })[r]}`).join(', ');
export const canPay = (G, cost) => Object.entries(cost).every(([r, n]) => (G.stock[r] || 0) >= n);
const pay = (G, cost) => { for (const [r, n] of Object.entries(cost)) G.stock[r] -= n; };

// ---------- aldeia (campanha) ----------
export function hasFreshWater(G) {
  return settlements(G).some(id => { const h = G.map.hexes[id]; return h.feature === 'river' || G.map.nbrs(h).some(n => n.feature === 'river' || n.feature === 'lake'); });
}
export function workers(G) { return Math.max(0, G.pop - G.explorers.length); }

// Relatório transparente: quem trabalha onde, produção, consumo e saldo.
export function villageReport(G) {
  const homes = settlements(G).filter(id => G.structures[id].type !== 'base').map(id => G.map.hexes[id]);
  // A produção da aldeia NÃO gasta as reservas de recolha: um hexágono trabalhado continua a poder ser recolhido à mão.
  const cands = G.map.hexes.filter(h => G.fog[h.id] === EXPLORED && !G.structures[h.id] && (isLand(h) || h.feature === 'lake')
    && homes.some(s => distance(s.q, s.r, h.q, h.r) <= (G.structures[s.id].workRadius ?? RULES.WORK_RADIUS)));
  const focusRes = FOCUS[G.focus].res;
  const opts = cands.map(h => {
    const y = hexYields(G, h);
    const best = focusRes.map(r => [r, y[r] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    const any = BASE_RESOURCES.map(r => [r, y[r] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    const [res, v] = best || any || [null, 0];
    return { id: h.id, res, amt: Math.min(RULES.WORK_MAX_YIELD, v), focusHit: !!best };
  }).filter(o => o.res);
  // Primeiro cobre-se o que falta (comida e água para a população), depois segue-se o foco escolhido.
  const cons = { food: Math.ceil(G.pop / 2), water: hasFreshWater(G) ? 0 : Math.ceil(G.pop / 3) };
  const running = { food: -cons.food, water: -cons.water };
  const n = workers(G), chosen = [], count = {};
  const pool = [...opts];
  for (let i = 0; i < n && pool.length; i++) {
    let bi = 0, bs = -Infinity;
    pool.forEach((o, k) => {
      const y = hexYields(G, G.map.hexes[o.id]);
      // se falta comida ou água, este hexágono passa a produzir o que falta, se puder
      const short = ['food', 'water'].filter(r => (running[r] || 0) < 0 && (y[r] || 0) > 0).sort((a, b) => running[a] - running[b])[0];
      const res = short || o.res, amt = Math.min(RULES.WORK_MAX_YIELD, short ? y[short] : o.amt);
      const sc = amt + (short ? 3 : 0) + (o.focusHit ? 1 : 0) - (G.focus === 'balanced' ? 0.8 * (count[res] || 0) : 0) - o.id * 1e-6;
      if (sc > bs) { bs = sc; bi = k; o._res = res; o._amt = amt; }
    });
    const o = pool.splice(bi, 1)[0];
    const pickd = { id: o.id, res: o._res, amt: o._amt, why: o._res !== o.res ? 'falta' : 'foco' };
    chosen.push(pickd); count[pickd.res] = (count[pickd.res] || 0) + 1; running[pickd.res] = (running[pickd.res] || 0) + pickd.amt;
  }
  const prod = {};
  chosen.forEach(o => { prod[o.res] = (prod[o.res] || 0) + o.amt; });
  const net = {};
  for (const r of new Set([...Object.keys(prod), ...Object.keys(cons)])) net[r] = (prod[r] || 0) - (cons[r] || 0);
  return { workers: chosen, idle: n - chosen.length, n, prod, cons, net, freshWater: cons.water === 0 };
}

export function setFocus(G, f) { if (FOCUS[f]) G.focus = f; }

export function recruitCheck(G) {
  if (G.explorers.length >= RULES.MAX_EXPLORERS) return `Máximo de ${RULES.MAX_EXPLORERS} exploradores nesta fase.`;
  if (G.pop - G.explorers.length <= 1) return 'Não há habitantes livres: a aldeia precisa de quem trabalhe.';
  if (!canPay(G, RECRUIT_COST)) return `Custa ${costText(RECRUIT_COST)}.`;
  return null;
}
export function recruit(G) {
  const err = recruitCheck(G); if (err) return { error: err };
  pay(G, RECRUIT_COST);
  const ex = newExplorer(G, G.map.start); ex.acted = false;
  return { ex };
}
export function upgradeCheck(G, k) {
  if (G.upgrades[k]) return 'Já tens esta melhoria.';
  if (!canPay(G, UPGRADES[k].cost)) return `Custa ${costText(UPGRADES[k].cost)}.`;
  return null;
}
export function buyUpgrade(G, k) {
  const err = upgradeCheck(G, k); if (err) return { error: err };
  pay(G, UPGRADES[k].cost); G.upgrades[k] = true;
  if (k === 'boots') G.explorers.forEach(e => { if (!e.acted && !e.away && e.fatigue === 0) e.pm += 1; });
  return { ok: true };
}

// ---------- avisos antes de terminar o turno ----------
export function endTurnWarnings(G) {
  const w = [];
  for (const ex of activeExplorers(G)) {
    const c = consumption(G, ex);
    if (!ex.acted && ex.pm > 0) w.push({ ex: ex.id, level: 'info', text: `${ex.name} ainda tem ${ex.pm} PM e a ação por fazer.` });
    if (c > ex.supplies) w.push({ ex: ex.id, level: 'bad', text: `${ex.name} fica sem mantimentos este turno e vai ficar ${ex.hunger ? 'exausto' : 'cansado'}.` });
    else {
      const aut = Math.floor((ex.supplies - c) / Math.max(1, c)), back = returnTurns(G, ex);
      if (c > 0 && aut <= RULES.WARN_AUTONOMY) w.push({ ex: ex.id, level: back > aut ? 'bad' : 'warn', text: `${ex.name}: ${aut} ${aut === 1 ? 'turno' : 'turnos'} de autonomia depois deste; precisa de ~${isFinite(back) ? back : '?'} para voltar.` });
    }
  }
  return w;
}

// ---------- fim de turno ----------
export function endTurn(G) {
  const rep = { lines: [], hungry: [], collapsed: [], seasonChanged: false, grew: 0, starved: false, stockLost: {}, over: null };
  // 1. mantimentos
  for (const ex of activeExplorers(G)) {
    const c = consumption(G, ex);
    if (ex.supplies >= c) {
      ex.supplies -= c;
      ex.hunger = 0;
      if (c === 0 && ex.fatigue > 0) ex.fatigue = 0;                 // em casa recupera
    } else {
      ex.supplies = 0; ex.hunger++;
      ex.fatigue = Math.min(2, ex.hunger);
      rep.hungry.push(ex.id);
      const limit = RULES.HUNGER_COLLAPSE[G.mode];
      if (ex.hunger >= limit) {
        if (G.mode === 'campaign') {
          rep.collapsed.push({ id: ex.id, text: `${ex.name} desmaiou de fome. Caçadores da aldeia trouxeram-no de volta: perdeu a carga e fica 2 turnos a recuperar.` });
          ex.hex = G.map.start; ex.cargo = []; ex.away = 2; ex.hunger = 0; ex.fatigue = 1; ex.supplies = 0;
        } else {
          ex.members = Math.max(0, (ex.members || 1) - 1); ex.hunger = limit - 1;
          rep.collapsed.push({ id: ex.id, text: ex.members ? `A fome levou um membro da expedição. Restam ${ex.members}.` : 'Já ninguém tem forças para continuar.' });
          if (!ex.members) rep.over = 'starved';
        }
      }
    }
  }
  // 2. avançar o tempo
  const before = season(G);
  G.turn++;
  if (season(G) !== before) { rep.seasonChanged = season(G); G.used = {}; }
  // 3. aldeia
  if (G.mode === 'campaign') {
    const vr = villageReport(G);
    for (const [r, v] of Object.entries(vr.net)) {
      let nv = (G.stock[r] || 0) + v;
      if (nv > RULES.STORE_CAP) { rep.stockLost[r] = nv - RULES.STORE_CAP; nv = RULES.STORE_CAP; }
      if (nv < 0) { if (r === 'food' || r === 'water') G.starving = true; nv = 0; }
      G.stock[r] = nv;
    }
    rep.village = vr;
    if (rep.seasonChanged) {
      if (G.starving && G.pop > G.explorers.length + 1) { G.pop--; rep.starved = true; }
      else if (!G.starving && G.stock.food >= RULES.GROW.food && G.stock.water >= RULES.GROW.water && G.pop < RULES.MAX_POP) {
        G.stock.food -= RULES.GROW.food; G.stock.water -= RULES.GROW.water; G.pop++; rep.grew = 1;
      }
      G.starving = false;
    }
  }
  // 4. preparar os exploradores
  for (const ex of G.explorers) {
    if (ex.away) { ex.away--; if (!ex.away) { ex.fatigue = 0; ex.hex = G.map.start; } }
    ex.pm = ex.away ? 0 : maxPm(G, ex) + ex.restBonus; ex.restBonus = 0;
    ex.acted = false; ex.undo = null;
  }
  // 5. fim da expedição
  if (G.mode === 'expedition' && G.turn > G.maxTurns && !rep.over) rep.over = 'time';
  if (rep.over) G.over = rep.over;
  return rep;
}

export { countExplored };
