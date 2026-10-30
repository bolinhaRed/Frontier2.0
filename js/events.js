// Acontecimentos aleatórios (poucos na Fase 2 — o núcleo vem primeiro). Também em dados.
// Cada um: who (que explorador afeta), when (condição), text, choices[{label, hint, run}].
import { RULES } from './data.js';
import { activeExplorers, hexOf, reveal, inTerritory, trait } from './game.js';
import { giveCargo } from './discoveries.js';

const out = G => activeExplorers(G).filter(e => !inTerritory(G, e.hex));
const short = ex => ex.name.replace('Expedição de ', '');

export const EVENTS = [
  { id: 'storm', w: 3, when: G => out(G).length > 0,
    title: G => (out(G).some(e => hexOf(G, e).biome === 'icelands') ? 'Nevasca' : 'Tempestade'),
    text: () => 'O céu escurece de repente. Quem está fora do território anda mais devagar neste turno.',
    choices: [{ label: 'Aguentar', hint: '−1 PM para quem está fora', run: G => { out(G).forEach(e => { e.pm = Math.max(0, e.pm - (hexOf(G, e).biome === 'icelands' ? 2 : 1)); }); return 'Avançam de cabeça baixa.'; } }] },
  { id: 'spoiled', w: 2, when: G => out(G).some(e => e.supplies > 1),
    title: () => 'Mantimentos estragados',
    text: (G, ex) => `A humidade entrou nos sacos de ${short(ex)}.`,
    pick: G => out(G).filter(e => e.supplies > 1)[0],
    choices: [{ label: 'Deitar fora', hint: '−1 mantimento', run: (G, ex) => { ex.supplies -= 1; return `${short(ex)} fica com ${ex.supplies} mantimentos.`; } }] },
  { id: 'wolves', w: 2, when: G => out(G).length > 0,
    title: () => 'Lobos à espreita', text: (G, ex) => `Uma alcateia segue ${short(ex)} desde o amanhecer.`,
    pick: G => out(G)[0],
    choices: [
      { label: 'Fugir', hint: '−2 PM neste turno', run: (G, ex) => { ex.pm = Math.max(0, ex.pm - 2); return 'Despistam-nos, mas perdem tempo.'; } },
      { label: 'Enfrentar', hint: '50%: +2 peles · 50%: cansado', run: (G, ex) => Math.random() < 0.5 ? `Afugentam a alcateia. +${giveCargo(G, ex, 'furs', 2)} peles.` : (ex.fatigue = Math.max(ex.fatigue, 1), `${short(ex)} sai mordido e cansado.`) }
    ] },
  { id: 'guide', w: 2, when: G => out(G).length > 0,
    title: () => 'Um guia local', text: (G, ex) => `Um caçador solitário oferece-se para mostrar a ${short(ex)} os trilhos da zona.`,
    pick: G => out(G)[0],
    choices: [{ label: 'Aceitar', hint: 'revela o terreno (raio 3)', run: (G, ex) => `${reveal(G, hexOf(G, ex), 3).length} hexágonos novos no esboço.` }] },
  { id: 'haunt', w: 3, when: G => out(G).some(e => trait(G, hexOf(G, e))?.name === 'Terra Assombrada'),
    title: () => 'Vozes na névoa', text: (G, ex) => `${short(ex)} ouve o seu nome chamado da névoa.`,
    pick: G => out(G).find(e => trait(G, hexOf(G, e))?.name === 'Terra Assombrada'),
    choices: [
      { label: 'Seguir a voz', hint: '50%: cristais · 50%: cansado', run: (G, ex) => Math.random() < 0.5 ? `Encontra um veio escondido: +${giveCargo(G, ex, 'crystals', 1)} cristal.` : (ex.fatigue = Math.max(ex.fatigue, 1), 'Anda em círculos a noite toda.') },
      { label: 'Tapar os ouvidos', hint: 'nada acontece', run: () => 'A voz cala-se ao amanhecer.' }
    ] },
  { id: 'harvest', w: 2, when: G => G.mode === 'campaign',
    title: () => 'Boa colheita', text: () => 'O tempo ajudou e os campos deram mais do que o esperado.',
    choices: [{ label: 'Guardar', hint: '+4 comida no armazém', run: G => { G.stock.food = Math.min(RULES.STORE_CAP, G.stock.food + 4); return 'O armazém fica mais cheio.'; } }] },
  { id: 'caravan', w: 1, when: G => G.mode === 'campaign' && G.stock.wood >= 5,
    title: () => 'Caravana à porta', text: () => 'Mercadores pedem madeira para reparar as carroças.',
    choices: [
      { label: 'Trocar', hint: '5 madeira → 3 ouro', run: G => { G.stock.wood -= 5; G.stock.gold = Math.min(RULES.STORE_CAP, G.stock.gold + 3); return 'Partem satisfeitos.'; } },
      { label: 'Recusar', hint: 'nada acontece', run: () => 'Seguem viagem.' }
    ] }
];

export function rollEvent(G) {
  if (G.over || G.turn < RULES.EVENT_FROM_TURN) return null;
  const haunted = out(G).some(e => trait(G, hexOf(G, e))?.name === 'Terra Assombrada');
  if (Math.random() > RULES.EVENT_CHANCE + (haunted ? 0.15 : 0)) return null;
  const opts = EVENTS.filter(e => e.when(G));
  if (!opts.length) return null;
  let x = Math.random() * opts.reduce((s, e) => s + e.w, 0);
  const ev = opts.find(e => (x -= e.w) < 0) || opts[0];
  const ex = ev.pick ? ev.pick(G) : null;
  return { id: ev.id, ex: ex?.id || null };
}

export function eventView(G, pending) {
  const ev = EVENTS.find(e => e.id === pending.id), ex = G.explorers.find(e => e.id === pending.ex);
  return { title: ev.title(G, ex), text: ev.text(G, ex), choices: ev.choices, ex };
}
export function resolveEvent(G, pending, index) {
  const ev = EVENTS.find(e => e.id === pending.id), ex = G.explorers.find(e => e.id === pending.ex);
  const text = ev.choices[index].run(G, ex);
  G.pendingEvent = null;
  return text;
}
