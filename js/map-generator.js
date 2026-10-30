// Geração procedural do continente. Determinística: a mesma seed + tamanho dá sempre o mesmo mapa.
import { rngFor, makeNoise, shuffle, weightedPick, pick } from './rng.js';
import { offsetToAxial, hexToPixel, neighbors, neighbor, key, distance, DIRS } from './hex-coordinates.js';
import { POIS, NAME_PREFIX, NAME_SUFFIX, TRAITS } from './data.js';

const LAND_FEATURES = new Set(['plain', 'woods', 'forest', 'hills', 'mountains', 'river', 'swamp']);
export const isLand = h => h && LAND_FEATURES.has(h.feature);

// Percentil de cada valor (0..1) — dá proporções estáveis seja qual for a seed.
function ranks(list, get) {
  const sorted = [...list].sort((a, b) => get(a) - get(b));
  const out = new Map();
  sorted.forEach((h, i) => out.set(h, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  return out;
}

export function generateMap({ seed, cols, rows }) {
  const R = (...p) => rngFor(seed, cols, rows, ...p);
  const nE = makeNoise(R('elev')), nM = makeNoise(R('moist')), nT = makeNoise(R('temp')), nR = makeNoise(R('ridge'));
  const off = { x: R('ox')() * 200, y: R('oy')() * 200 };

  const hexes = [], byKey = new Map();
  for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) {
    const { q, r } = offsetToAxial(col, row);
    const p = hexToPixel(q, r, 1);
    const h = { id: hexes.length, q, r, col, row, feature: 'water', biome: 'greenlands', poi: null, structure: null, region: -1, river: null };
    // ruído amostrado no espaço real dos hexágonos (isotrópico)
    const sx = p.x * 0.16 + off.x, sy = p.y * 0.16 + off.y;
    const nx = col / (cols - 1) * 2 - 1, ny = row / (rows - 1) * 2 - 1;
    const edge = Math.pow(Math.max(Math.abs(nx), Math.abs(ny)), 3) * 0.7 + (nx * nx + ny * ny) * 0.18;
    h._e = nE.fbm(sx, sy, 5) - edge;
    h._m = nM.fbm(sx * 0.5 + 50, sy * 0.5, 3);                                  // humidade em grandes manchas
    h._t = (row / (rows - 1)) * 0.85 + nT.fbm(sx * 0.35, sy * 0.35, 2) * 0.3;  // norte frio, sul quente, faixas largas
    h._ridge = 1 - Math.abs(nR.fbm(sx * 0.7, sy * 0.7, 3) * 2 - 1);           // linhas de cumeada → cadeias
    hexes.push(h); byKey.set(key(q, r), h);
  }
  const get = (q, r) => byKey.get(key(q, r));
  const nbrs = h => neighbors(h.q, h.r).map(([q, r]) => get(q, r)).filter(Boolean);

  // 1. Terra e mar — ~38% de oceano, sempre a delimitar o continente.
  const eRank = ranks(hexes, h => h._e);
  for (const h of hexes) {
    const border = h.col === 0 || h.row === 0 || h.col === cols - 1 || h.row === rows - 1;
    h.feature = (!border && eRank.get(h) > 0.38) ? 'plain' : 'water';
  }
  // remove ilhotas de 1 hexágono e buracos de mar de 1 hexágono
  for (const h of hexes) {
    const n = nbrs(h); const land = n.filter(isLand).length;
    if (isLand(h) && land === 0) h.feature = 'water';
    else if (!isLand(h) && land >= 5 && n.length === 6) h.feature = 'plain';
  }
  let land = hexes.filter(isLand);

  // distância ao mar (para rios e humidade costeira)
  const coastDist = new Map();
  let frontier = hexes.filter(h => !isLand(h)); frontier.forEach(h => coastDist.set(h, 0));
  while (frontier.length) {
    const next = [];
    for (const h of frontier) for (const n of nbrs(h)) if (!coastDist.has(n)) { coastDist.set(n, coastDist.get(h) + 1); next.push(n); }
    frontier = next;
  }

  // 2. Relevo: montanhas em cadeias (elevação + cumeada), colinas à volta.
  const landE = ranks(land, h => h._e);
  const mScore = ranks(land, h => landE.get(h) * 0.55 + h._ridge * 0.45 + Math.min(coastDist.get(h), 4) * 0.03);
  for (const h of land) {
    h.elev = landE.get(h);
    const s = mScore.get(h);
    if (s > 0.89) h.feature = 'mountains';
    else if (s > 0.76) h.feature = 'hills';
  }

  // 3. Clima → bioma
  const tRank = ranks(land, h => h._t - h.elev * 0.12);
  const mRank = ranks(land, h => h._m + Math.max(0, 3 - coastDist.get(h)) * 0.04);
  for (const h of land) {
    const t = tRank.get(h), m = mRank.get(h);
    h.temp = t; h.moist = m;
    if (t < 0.17) h.biome = 'icelands';
    else if (t > 0.78 && m < 0.6) h.biome = 'sandlands';
    else if (m < 0.22 || (t > 0.6 && m < 0.38)) h.biome = 'drylands';
    else h.biome = 'greenlands';
  }
  // suavizar fronteiras de bioma (maioria dos vizinhos)
  // (várias passagens: biomas contínuos, sem salpicos isolados)
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map();
    for (const h of land) {
      const count = {};
      for (const n of nbrs(h)) if (isLand(n)) count[n.biome] = (count[n.biome] || 0) + 1;
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      const own = count[h.biome] || 0;
      if (best && best[0] !== h.biome && (best[1] >= 4 || (own <= 1 && best[1] >= 2))) next.set(h, best[0]);
    }
    next.forEach((b, h) => { h.biome = b; });
  }
  // montanhas em cadeia: picos isolados passam a colinas
  for (const h of land) if (h.feature === 'mountains' && !nbrs(h).some(n => n.feature === 'mountains')) h.feature = 'hills';

  // 4. Vegetação: florestas agrupadas onde há humidade.
  const flat = land.filter(h => h.feature === 'plain');
  const vRank = ranks(flat, h => h.moist + (h.biome === 'sandlands' ? -0.5 : 0) + (h.biome === 'drylands' ? -0.25 : 0));
  for (const h of flat) {
    const v = vRank.get(h);
    if (v > 0.74 && h.biome !== 'sandlands') h.feature = 'forest';
    else if (v > 0.52) h.feature = 'woods';
  }
  // florestas compactas: crescem onde já há mata à volta, árvores soltas recuam
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map();
    for (const h of land) {
      if (!['plain', 'woods', 'forest'].includes(h.feature) || h.biome === 'sandlands') continue;
      const f = nbrs(h).filter(n => n.feature === 'forest').length;
      if (h.feature !== 'forest' && f >= 4) next.set(h, 'forest');
      else if (h.feature === 'forest' && f <= 1) next.set(h, 'woods');
    }
    next.forEach((v, h) => { h.feature = v; });
  }
  // pântanos: terras baixas e encharcadas
  const r4 = R('swamp');
  for (const h of land) {
    if ((h.feature === 'plain' || h.feature === 'woods') && h.elev < 0.3 && h.moist > 0.82 && (h.biome === 'greenlands') && r4() < 0.6) h.feature = 'swamp';
  }

  // 5. Lagos interiores
  const rl = R('lakes');
  const lakeCount = Math.max(1, Math.round(land.length / 170));
  const lakeCands = shuffle(land.filter(h => h.feature !== 'mountains' && coastDist.get(h) >= 2 && h.elev < 0.55), rl);
  let lakes = 0;
  for (const h of lakeCands) {
    if (lakes >= lakeCount) break;
    if (nbrs(h).some(n => n.feature === 'lake')) continue;
    h.feature = 'lake'; lakes++;
    if (rl() < 0.4) { const n = pick(nbrs(h).filter(n => isLand(n) && n.feature !== 'mountains'), rl); if (n) n.feature = 'lake'; }
  }

  // 6. Rios: nascem nas montanhas e descem até ao mar ou a um lago.
  const rr = R('rivers');
  const riverCount = land.length > 60 ? Math.max(1, Math.round(land.length / 140)) : 0;
  const sources = shuffle(land.filter(h => (h.feature === 'mountains' || h.feature === 'hills') && coastDist.get(h) >= 3), rr);
  let rivers = 0;
  const dirTo = (a, b) => DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
  for (const src of sources) {
    if (rivers >= riverCount) break;
    if (nbrs(src).some(n => n.feature === 'river')) continue;
    const path = []; const seen = new Set([src]); let cur = src; let end = null;
    for (let step = 0; step < 30; step++) {
      const opts = nbrs(cur).filter(n => !seen.has(n));
      const exit = opts.find(n => n.feature === 'water' || n.feature === 'lake' || (n.feature === 'river' && n !== cur));
      if (exit && path.length >= 2) { end = exit; break; }
      const down = opts.filter(n => isLand(n) && n.feature !== 'mountains' && n.feature !== 'river')
        .sort((a, b) => (a.elev + coastDist.get(a) * 0.08) - (b.elev + coastDist.get(b) * 0.08))[0];
      if (!down) break;
      path.push(down); seen.add(down); cur = down;
    }
    if (path.length < 2) continue;
    if (!end) { const last = path.pop(); last.feature = 'lake'; end = last; }
    let prev = src;
    path.forEach((h, i) => {
      const nextH = path[i + 1] || end;
      h.feature = 'river';
      h.river = { from: dirTo(h, prev), to: dirTo(h, nextH) };
      prev = h;
    });
    rivers++;
  }

  land = hexes.filter(isLand);

  // 7. Ponto de partida: planície ou bosque perto do centro, com terra à volta.
  const mid = offsetToAxial(Math.floor(cols / 2), Math.floor(rows / 2));
  const startCands = land.filter(h => (h.feature === 'plain' || h.feature === 'woods') && h.biome !== 'deadlands');
  const score = h => distance(h.q, h.r, mid.q, mid.r) - nbrs(h).filter(n => isLand(n) && n.feature !== 'mountains').length * 0.9
    - (h.biome === 'greenlands' ? 2 : 0) - (nbrs(h).some(n => n.feature === 'river' || n.feature === 'lake') ? 1.2 : 0);
  const start = startCands.sort((a, b) => score(a) - score(b))[0] || land[0];
  start.feature = 'plain'; start.structure = 'village';

  // 8. Terras Mortas: manchas amaldiçoadas longe do início.
  const rd = R('dead');
  const blobs = land.length > 400 ? 2 : land.length > 120 ? (rd() < 0.55 ? 1 : 0) : 0;
  const far = shuffle(land.filter(h => distance(h.q, h.r, start.q, start.r) >= Math.max(6, Math.min(cols, rows) / 2.2)), rd);
  for (let b = 0; b < blobs && far.length; b++) {
    const c = far.pop(); const rad = land.length > 400 ? 3 : 2;
    for (const h of land) if (distance(h.q, h.r, c.q, c.r) <= rad && rd() < (distance(h.q, h.r, c.q, c.r) === rad ? 0.5 : 0.95)) h.biome = 'deadlands';
  }

  // 9. Locais especiais (POI)
  const rp = R('poi');
  const density = cols * rows < 300 ? 0.1 : 0.065;
  const target = Math.round(land.length * density);
  const rareUsed = {};
  const minGap = cols * rows < 300 ? 2 : 3;
  const placed = [];
  const cands = shuffle(land.filter(h => !h.structure && h.feature !== 'river' && distance(h.q, h.r, start.q, start.r) >= 2), rp);
  for (const h of cands) {
    if (placed.length >= target) break;
    if (placed.some(p => distance(p.q, p.r, h.q, h.r) < minGap)) continue;
    const opts = Object.entries(POIS).filter(([id, p]) => {
      if (!p.on.includes(h.feature)) return false;
      if (p.rare && (rareUsed[id] || 0) >= (land.length > 400 ? 2 : 1)) return false;
      if (p.far && distance(h.q, h.r, start.q, start.r) < Math.min(cols, rows) / 3) return false;
      return true;
    }).map(([id, p]) => [id, p.w * (p.biomes ? (p.biomes.includes(h.biome) ? 2.5 : 0.25) : 1)]);
    if (!opts.length) continue;
    const id = weightedPick(opts, rp);
    h.poi = id; placed.push(h);
    if (POIS[id].rare) rareUsed[id] = (rareUsed[id] || 0) + 1;
  }
  // garante pelo menos um portal (objetivo clássico de expedição)
  if (!placed.some(h => h.poi === 'portal')) {
    const p = land.filter(h => !h.poi && !h.structure && (h.feature === 'plain' || h.feature === 'woods'))
      .sort((a, b) => distance(b.q, b.r, start.q, start.r) - distance(a.q, a.r, start.q, start.r))[0];
    if (p) p.poi = 'portal';
  }
  // mapas grandes: um segundo portal, longe do primeiro (os dois ficam ligados na campanha)
  if (land.length > 400 && land.filter(h => h.poi === 'portal').length < 2) {
    const p1 = land.find(h => h.poi === 'portal');
    const p2 = land.filter(h => !h.poi && !h.structure && (h.feature === 'plain' || h.feature === 'woods'))
      .sort((a, b) => distance(b.q, b.r, p1.q, p1.r) + distance(b.q, b.r, start.q, start.r) * 0.5 - distance(a.q, a.r, p1.q, p1.r) - distance(a.q, a.r, start.q, start.r) * 0.5)[0];
    if (p2) p2.poi = 'portal';
  }

  // 10. Regiões com nome (tabelas PAST de C. Martins)
  const rn = R('names');
  const regionCount = Math.max(2, Math.min(14, Math.round(land.length / 70)));
  const seeds = [start];
  while (seeds.length < regionCount) {
    let best = null, bestD = -1;
    for (const h of land) {
      const d = Math.min(...seeds.map(s => distance(s.q, s.r, h.q, h.r))) + rn() * 1.5;
      if (d > bestD) { bestD = d; best = h; }
    }
    seeds.push(best);
  }
  const usedNames = new Set();
  const regions = seeds.map((s, i) => {
    let name;
    do { name = pick(NAME_PREFIX, rn) + pick(NAME_SUFFIX, rn); } while (usedNames.has(name));
    usedNames.add(name);
    return { id: i, name, q: s.q, r: s.r, hexes: [] };
  });
  // regiões crescem a partir das sementes seguindo a geografia: atravessar montanhas,
  // rios ou mudar de bioma custa mais, por isso as fronteiras ficam nas cumeadas e nos rios
  const owned = new Map(), cost = new Map(), q = [];
  seeds.forEach((s, i) => { cost.set(s.id, 0); owned.set(s.id, i); q.push([0, s.id]); });
  const stepCost = (a, b) => 1 + (b.feature === 'mountains' ? 3 : 0) + (b.feature === 'river' && a.feature !== 'river' ? 1.5 : 0) + (a.biome !== b.biome ? 2.5 : 0);
  while (q.length) {
    q.sort((x, y) => y[0] - x[0]);
    const [d, id] = q.pop();
    if (d > cost.get(id)) continue;
    const a = hexes[id];
    for (const b of nbrs(a)) {
      if (!isLand(b) && b.feature !== 'lake') continue;
      const nd = d + stepCost(a, b);
      if (nd < (cost.get(b.id) ?? Infinity)) { cost.set(b.id, nd); owned.set(b.id, owned.get(id)); q.push([nd, b.id]); }
    }
  }
  for (const h of land.concat(hexes.filter(h => h.feature === 'lake'))) {
    let best = owned.get(h.id);
    if (best === undefined) { // ilha isolada: semente mais próxima
      let bd = Infinity; seeds.forEach((s, i) => { const dd = distance(s.q, s.r, h.q, h.r); if (dd < bd) { bd = dd; best = i; } });
    }
    h.region = best; regions[best].hexes.push(h.id);
  }

  // traços de região (sorteio próprio: não altera o resto do mapa)
  const rt = R('traits');
  regions.forEach(rg => {
    const hs = rg.hexes.map(id => hexes[id]);
    const count = {}; hs.forEach(h => { count[h.biome] = (count[h.biome] || 0) + 1; });
    const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'greenlands';
    const feats = new Set(hs.map(h => h.feature));
    const opts = Object.entries(TRAITS).filter(([, t]) => t.biomes.includes(main) && (!t.needs || t.needs.some(f => feats.has(f)))).map(([id]) => id);
    rg.trait = opts.length ? pick(opts, rt) : null;
    rg.biome = main;
  });

  return finalizeMap({ seed, cols, rows, hexes, regions, start: start.id });
}

// Completa um mapa (gerado ou lido de um save): índices, vizinhos, profundidade do mar.
export function finalizeMap(m) {
  const { hexes } = m;
  const byKey = new Map(hexes.map(h => [key(h.q, h.r), h]));
  const get = (q, r) => byKey.get(key(q, r));
  const nbrs = h => neighbors(h.q, h.r).map(([q, r]) => get(q, r)).filter(Boolean);
  m.regions.forEach(rg => { rg.hexes = []; });
  hexes.forEach(h => { if (h.region >= 0 && m.regions[h.region]) m.regions[h.region].hexes.push(h.id); });
  // profundidade do oceano (para sombrear o alto mar)
  const landDist = new Map();
  let fr = hexes.filter(h => h.feature !== 'water'); fr.forEach(h => landDist.set(h, 0));
  while (fr.length) {
    const next = [];
    for (const h of fr) for (const n of nbrs(h)) if (!landDist.has(n)) { landDist.set(n, landDist.get(h) + 1); next.push(n); }
    fr = next;
  }
  for (const h of hexes) if (h.feature === 'water') h.depth = Math.min(4, landDist.get(h) ?? 4);

  for (const h of hexes) { delete h._e; delete h._m; delete h._t; delete h._ridge; delete h.elev; delete h.temp; delete h.moist; }
  return { ...m, byKey, get, nbrs };
}

// ---------- guardar o mapa dentro do save (formato compacto) ----------
const FEATS = ['water', 'plain', 'woods', 'forest', 'hills', 'mountains', 'river', 'swamp', 'lake'];
const BIOME_CODES = ['greenlands', 'sandlands', 'drylands', 'icelands', 'deadlands'];
const POI_CODES = Object.keys(POIS);
export const MAP_FORMAT = 1;

export function serializeMap(m) {
  return {
    format: MAP_FORMAT, seed: m.seed, cols: m.cols, rows: m.rows, start: m.start,
    f: m.hexes.map(h => FEATS.indexOf(h.feature).toString(36)).join(''),
    b: m.hexes.map(h => BIOME_CODES.indexOf(h.biome).toString(36)).join(''),
    p: m.hexes.map(h => h.poi ? (POI_CODES.indexOf(h.poi) + 1).toString(36) : '0').join(''),
    g: m.hexes.map(h => h.region),
    rv: m.hexes.filter(h => h.river).map(h => [h.id, h.river.from, h.river.to]),
    regions: m.regions.map(r => ({ name: r.name, q: r.q, r: r.r, trait: r.trait, biome: r.biome }))
  };
}

export function restoreMap(d) {
  const hexes = [];
  let i = 0;
  for (let col = 0; col < d.cols; col++) for (let row = 0; row < d.rows; row++) {
    const { q, r } = offsetToAxial(col, row);
    hexes.push({ id: i, q, r, col, row, feature: FEATS[parseInt(d.f[i], 36)], biome: BIOME_CODES[parseInt(d.b[i], 36)],
      poi: d.p[i] === '0' ? null : POI_CODES[parseInt(d.p[i], 36) - 1], structure: null, region: d.g[i], river: null });
    i++;
  }
  d.rv.forEach(([id, from, to]) => { hexes[id].river = { from, to }; });
  return finalizeMap({ seed: d.seed, cols: d.cols, rows: d.rows, start: d.start, hexes, regions: d.regions.map((r, k) => ({ id: k, ...r, hexes: [] })) });
}
