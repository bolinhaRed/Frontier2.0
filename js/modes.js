// Objetivos: Expeditions (partidas curtas de 12 turnos) e Campanha (capítulos com marcos).
import { RULES, VALUE } from './data.js';
import { rngFor, pick, shuffle } from './rng.js';
import { distance } from './hex-coordinates.js';
import { isLand } from './map-generator.js';
import { EXPLORED } from './exploration.js';

// ===================== EXPEDITIONS =====================
const near = (G, pred, rad) => { const s = G.map.hexes[G.map.start]; return G.map.hexes.filter(h => pred(h) && distance(h.q, h.r, s.q, s.r) <= rad).length; };
const newExplored = G => G.stats.explored - (G.exp?.startExplored || 0);
const dl = (G, r) => G.delivered?.[r] || 0;

export const OBJECTIVES = {
  portal:     { name: 'Atravessa o portal', desc: 'Encontra o portal mágico e entra nele.', ok: G => true,
                progress: G => G.exp.flags.portal ? 'Chegaste ao portal!' : 'Procura a espiral de pedra.', done: G => !!G.exp.flags.portal },
  lumber:     { name: 'Lenhador', desc: 'Entrega 8 madeira no acampamento-base.', ok: G => near(G, h => h.feature === 'forest' || h.feature === 'woods', 5) >= 4,
                progress: G => `Madeira entregue: ${Math.min(8, dl(G, 'wood'))}/8`, done: G => dl(G, 'wood') >= 8 },
  cartographer: { name: 'Cartógrafo', desc: 'Explora 10 hexágonos novos.', ok: G => true,
                progress: G => `Hexágonos explorados: ${Math.min(10, newExplored(G))}/10`, done: G => newExplored(G) >= 10 },
  archaeologist: { name: 'Arqueólogo', desc: 'Investiga 3 locais especiais.', ok: G => near(G, h => !!h.poi && h.poi !== 'portal', 7) >= 4,
                progress: G => `Locais investigados: ${Math.min(3, G.stats.finds.length)}/3`, done: G => G.stats.finds.length >= 3 },
  prospector: { name: 'Prospetor', desc: 'Entrega 4 pedra e 3 minério na base.', ok: G => near(G, h => h.feature === 'hills' || h.feature === 'mountains', 5) >= 3,
                progress: G => `Pedra ${Math.min(4, dl(G, 'stone'))}/4 · Minério ${Math.min(3, dl(G, 'ore'))}/3`, done: G => dl(G, 'stone') >= 4 && dl(G, 'ore') >= 3 },
  pioneer:    { name: 'Pioneiro', desc: 'Monta 2 acampamentos em regiões diferentes.', ok: G => G.map.regions.length >= 2 && near(G, h => h.feature === 'forest' || h.feature === 'woods', 5) >= 3,
                progress: G => `Acampamentos: ${Math.min(2, campRegions(G))}/2 regiões`, done: G => campRegions(G) >= 2 }
};
const campRegions = G => new Set(Object.entries(G.structures).filter(([, s]) => s.type === 'camp').map(([id]) => G.map.hexes[id].region)).size;

export const SECONDARY = {
  intact:  { name: 'Ninguém fica para trás', desc: 'Acaba com os 3 membros da expedição.', done: G => (G.explorers[0]?.members || 0) >= RULES.EXPEDITION_MEMBERS, final: true },
  gold:    { name: 'Bolsa cheia', desc: 'Entrega 2 ouro na base.', done: G => dl(G, 'gold') >= 2 },
  regions: { name: 'Viajante', desc: 'Entra em 2 regiões.', done: G => G.stats.regions >= 2, ok: G => G.map.regions.length >= 2 },
  rested:  { name: 'Passo firme', desc: 'Nunca fiques cansado.', done: G => !G.exp.flags.tired, final: true },
  haul:    { name: 'Carregador', desc: 'Entrega 6 recursos na base.', done: G => Object.values(G.delivered).reduce((a, b) => a + b, 0) >= 6 }
};

export function setupExpedition(G) {
  const r = rngFor(G.seed, 'objective');
  const main = pick(Object.keys(OBJECTIVES).filter(k => OBJECTIVES[k].ok(G)), r);
  const sec = pick(Object.keys(SECONDARY).filter(k => !SECONDARY[k].ok || SECONDARY[k].ok(G)), r);
  G.exp = { main, sec, startExplored: G.stats.explored, flags: {}, mainDoneTurn: 0 };
}

export function expeditionTick(G) {
  const ex = G.explorers[0];
  if (ex.fatigue > 0) G.exp.flags.tired = true;
  if (G.map.hexes[ex.hex].poi === 'portal') G.exp.flags.portal = true;
  const o = OBJECTIVES[G.exp.main];
  if (!G.exp.mainDoneTurn && o.done(G)) { G.exp.mainDoneTurn = G.turn; return 'main'; }
  return null;
}

export function expeditionScore(G) {
  const ex = G.explorers[0], main = OBJECTIVES[G.exp.main], sec = SECONDARY[G.exp.sec];
  const mainDone = !!G.exp.mainDoneTurn || main.done(G);
  const secDone = sec.done(G);
  const cargo = Object.entries(G.delivered).reduce((s, [k, n]) => s + VALUE[k] * n, 0);
  const turnsLeft = mainDone ? Math.max(0, G.maxTurns - G.turn + 1) : 0;
  const parts = [
    ['Objetivo principal', mainDone ? 100 : 0],
    ['Objetivo secundário', secDone ? 50 : 0],
    ['Hexágonos explorados', newExplored(G) * 5],
    ['Carga entregue', cargo],
    ['Membros vivos', (ex.members || 0) * 10],
    ['Turnos que sobraram', turnsLeft * 5]
  ];
  return { parts, total: parts.reduce((s, p) => s + p[1], 0), mainDone, secDone };
}

// ===================== CAMPANHA =====================
export const CHAPTERS = [
  { n: 1, title: 'Chegada', intro: 'O barco foi-se embora. Cinco pessoas, duas mochilas e um continente sem nome. Primeiro, saber onde estamos.',
    marks: [
      { id: 'explore20', text: 'Explora 20 hexágonos', done: G => G.stats.explored - 7 >= 20, reward: { wood: 5 } },
      { id: 'wood10', text: 'Entrega 10 madeira na aldeia', done: G => (G.stats.delivered.wood || 0) >= 10, reward: { gold: 3 } },
      { id: 'camp1', text: 'Monta um acampamento', done: G => G.stats.camps >= 1, reward: { food: 4 } },
      { id: 'recruit', text: 'Recruta um terceiro explorador', done: G => G.explorers.length >= 3, reward: { furs: 1 } }
    ] },
  { n: 2, title: 'Raízes', intro: 'Já sabemos onde estamos. Agora é preciso ficar — e chegar mais longe.',
    marks: [
      { id: 'outpost', text: 'Funda o primeiro posto avançado', done: G => Object.values(G.structures).some(s => s.type === 'outpost' || s.type === 'keep'), reward: { stone: 3 } },
      { id: 'pop7', text: 'Chega a 7 habitantes', done: G => G.pop >= 7, reward: { food: 5 } },
      { id: 'claim', text: 'Reivindica uma região com um posto', done: G => G.claimed.length >= 1, reward: { gold: 3 } },
      { id: 'regions4', text: 'Entra em 4 regiões', done: G => G.stats.regions >= 4, reward: { ore: 2 } }
    ] },
  { n: 3, title: 'Expansão', intro: 'O resto da história chega nas próximas fases: edifícios, tecnologias e os segredos dos portais.', marks: [] }
];

export function currentChapter(G) { return CHAPTERS.find(c => c.n === G.missions.chapter) || CHAPTERS.at(-1); }

// Verifica marcos; aplica recompensas; devolve o que mudou para anunciar.
export function checkMissions(G) {
  const ch = currentChapter(G), news = [];
  for (const m of ch.marks) {
    if (!G.missions.done[m.id] && m.done(G)) {
      G.missions.done[m.id] = true;
      for (const [r, n] of Object.entries(m.reward)) G.stock[r] = Math.min(RULES.STORE_CAP, (G.stock[r] || 0) + n);
      news.push({ type: 'mark', mark: m });
    }
  }
  if (ch.marks.length && ch.marks.every(m => G.missions.done[m.id])) {
    G.missions.chapter++;
    news.push({ type: 'chapter', chapter: currentChapter(G) });
  }
  return news;
}
