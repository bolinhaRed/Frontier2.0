// Descobertas: o que acontece ao INVESTIGAR um local especial.
// Tudo em dados: cada local tem texto narrativo e 2–3 escolhas; cada escolha tem um efeito.
// Para acrescentar um local único com consequências permanentes basta juntar uma entrada aqui
// (ver 'keep' e 'portal': usam G.flags e mudam o mapa para sempre).
import { RULES } from './data.js';
import { hexOf, freeSlots, reveal, syncStructures, makeStructure, canPay, costText, trait } from './game.js';
import { EXPLORED } from './exploration.js';

const roll = () => Math.random();
const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------- efeitos reutilizáveis ----------
export function giveCargo(G, ex, res, n) {
  let k = 0; while (k < n && freeSlots(G, ex) > 0) { ex.cargo.push(res); k++; }
  return k;
}
const resName = { food: 'comida', wood: 'madeira', stone: 'pedra', ore: 'minério', gold: 'ouro', water: 'água', furs: 'peles', herbs: 'ervas', crystals: 'cristais' };
function gainText(G, ex, res, n) {
  const got = giveCargo(G, ex, res, n);
  if (!got) return `Encontras ${n} ${resName[res]}, mas a mochila está cheia.`;
  return `+${got} ${resName[res]} na mochila${got < n ? ` (faltou espaço para ${n - got})` : ''}.`;
}
const supplies = (ex, n) => { const k = Math.min(n, ex.maxSupplies - ex.supplies); ex.supplies += k; return k ? `+${k} mantimentos.` : 'Os mantimentos já estavam cheios.'; };
const tire = ex => { ex.fatigue = Math.max(ex.fatigue, 1); return `${ex.name.split(' ').pop()} fica cansado.`; };
const bonus = (G, h) => trait(G, h)?.poiBonus || 0;
const gold = (G, h, n) => n * (trait(G, h)?.gold || 1);

// ---------- os locais ----------
// title / text: narrativa · choices: [{ label, hint, when?(ctx) → motivo se indisponível, run(ctx) → texto do resultado }]
export const DISCOVERIES = {
  ruins: {
    title: 'Ruínas antigas',
    text: 'Entre as pedras caídas há uma escadaria que desce para o escuro. Nas paredes, figuras gravadas apontam todas para o mesmo lado.',
    choices: [
      { label: 'Escavar', hint: '2–4 pedra, talvez ouro · 1 em 6: derrocada',
        run: ({ G, ex, h }) => {
          if (roll() < 1 / 6 + (bonus(G, h) ? 0.1 : 0)) return 'Um degrau cede e meio teto vem abaixo. ' + tire(ex) + ' ' + gainText(G, ex, 'stone', 1);
          let t = gainText(G, ex, 'stone', between(2, 4) + bonus(G, h));
          if (roll() < 0.5) t += ' Entre o pó brilha algo: ' + gainText(G, ex, 'gold', gold(G, h, 2));
          return t;
        } },
      { label: 'Copiar as inscrições', hint: 'revela o terreno à volta (raio 3)',
        run: ({ G, h }) => { G.flags.lore = (G.flags.lore || 0) + 1; const n = reveal(G, h, 3).length; return `As figuras são um mapa. O cartógrafo acrescenta ${n} hexágonos ao esboço. (Saber +1, útil nas tecnologias.)`; } },
      { label: 'Seguir caminho', hint: 'nada acontece', run: () => 'Há sítios que é melhor deixar em paz.' }
    ]
  },
  village: { // a Aldeia Silenciosa
    title: 'A Aldeia Silenciosa',
    text: 'Não há ninguém. As mesas estão postas, o pão ficou duro nos pratos. As portas foram fechadas por fora.',
    choices: [
      { label: 'Revistar as despensas', hint: 'mantimentos e comida',
        run: ({ G, ex }) => supplies(ex, 3) + ' ' + gainText(G, ex, 'food', 2) },
      { label: 'Procurar ferramentas', hint: 'madeira e minério',
        run: ({ G, ex }) => gainText(G, ex, 'wood', 2) + ' ' + gainText(G, ex, 'ore', 1) },
      { label: 'Ler o diário do moleiro', hint: 'uma pista permanente',
        run: ({ G }) => { G.flags.silentVillage = true; return 'A última página diz: "Vieram do portal. Fechem as portas." Fica registado no diário da colónia.'; } }
    ]
  },
  camp: {
    title: 'Acampamento nómada',
    text: 'Tendas de couro e um fogo baixo. Os nómadas observam-te em silêncio, até que a mais velha te faz sinal para te sentares.',
    choices: [
      { label: 'Trocar peles por mantimentos', hint: '1 pele → 3 mantimentos', when: ({ ex }) => ex.cargo.includes('furs') ? null : 'Não tens peles.',
        run: ({ ex }) => { ex.cargo.splice(ex.cargo.indexOf('furs'), 1); return 'Negócio feito. ' + supplies(ex, 3); } },
      { label: 'Pedir indicações', hint: 'revela o terreno (raio 3)', run: ({ G, h }) => `Desenham-te o caminho na areia: ${reveal(G, h, 3).length} hexágonos no esboço.` },
      { label: 'Partilhar a refeição', hint: '+2 mantimentos', run: ({ ex }) => 'Comem contigo e não aceitam nada em troca. ' + supplies(ex, 2) }
    ]
  },
  cave: {
    title: 'Caverna',
    text: 'O ar sai da boca da caverna morno e com cheiro a animal.',
    choices: [
      { label: 'Entrar com uma tocha', hint: 'minério · 1 em 3: um urso',
        run: ({ G, ex }) => roll() < 1 / 3 ? 'Um rugido. Sais a correr. ' + tire(ex) : gainText(G, ex, 'ore', between(2, 3)) },
      { label: 'Montar uma armadilha à entrada', hint: 'peles e comida', run: ({ G, ex }) => gainText(G, ex, 'furs', 2) + ' ' + gainText(G, ex, 'food', 1) },
      { label: 'Seguir caminho', hint: 'nada acontece', run: () => 'Deixas a caverna para outro dia.' }
    ]
  },
  crystals: {
    title: 'Veio de cristais',
    text: 'Cristais rosados brotam da pedra e zumbem baixinho quando lhes tocas.',
    choices: [
      { label: 'Arrancar cristais', hint: '2 cristais (valiosos)', run: ({ G, ex, h }) => gainText(G, ex, 'crystals', 2 + bonus(G, h)) },
      { label: 'Deixá-los em paz', hint: 'nada acontece', run: () => 'O zumbido acompanha-te durante uma hora.' }
    ]
  },
  tower: {
    title: 'Torre em ruínas',
    text: 'A escada em caracol aguenta-se. Lá de cima vê-se meio mundo.',
    choices: [{ label: 'Subir ao topo', hint: 'revela tudo num raio de 3', run: ({ G, h }) => `Do topo, o cartógrafo esboça ${reveal(G, h, 3).length} hexágonos.` }]
  },
  stones: {
    title: 'Círculo de pedras',
    text: 'Dólmenes antigos em círculo. No centro, a erva não cresce.',
    choices: [
      { label: 'Passar a noite no círculo', hint: 'descansa por completo', run: ({ ex }) => { ex.fatigue = 0; ex.hunger = 0; ex.restBonus = 1; return 'Sonhos estranhos, mas acordas como novo. Cansaço curado e +1 PM no próximo turno.'; } },
      { label: 'Seguir caminho', hint: 'nada acontece', run: () => 'Não olhas para trás.' }
    ]
  },
  graveyard: {
    title: 'Ossadas',
    text: 'Esqueletos meio enterrados, todos virados para o mesmo lado. Alguns ainda têm bolsas à cintura.',
    choices: [
      { label: 'Revistar as bolsas', hint: 'ouro · 1 em 4: algo te persegue', run: ({ G, ex, h }) => roll() < 0.25 ? 'Ouves passos atrás de ti a noite inteira. ' + tire(ex) : gainText(G, ex, 'gold', gold(G, h, 2)) },
      { label: 'Enterrar os mortos', hint: 'nada, mas sentes-te melhor', run: () => 'Levas uma hora. O vento acalma.' }
    ]
  },
  hole: {
    title: 'Fenda no chão',
    text: 'Um poço sem fundo visível. Lá de baixo sobe um eco que parece a tua voz, com atraso.',
    choices: [
      { label: 'Descer com uma corda', hint: 'cristais ou minério · arriscado', run: ({ G, ex }) => roll() < 0.35 ? 'A corda parte-se a meio. Sobes a custo. ' + tire(ex) : gainText(G, ex, roll() < 0.5 ? 'crystals' : 'ore', 2) },
      { label: 'Atirar uma pedra e ouvir', hint: 'nada acontece', run: () => 'Nunca chega a bater no fundo.' }
    ]
  },
  deadtrees: {
    title: 'Árvores mortas',
    text: 'Troncos secos e silêncio. Nem um pássaro.',
    choices: [{ label: 'Cortar lenha seca', hint: '3 madeira', run: ({ G, ex }) => gainText(G, ex, 'wood', 3) }]
  },
  keep: { // a Fortaleza Esquecida — consequência permanente na campanha
    title: 'A Fortaleza Esquecida',
    text: 'Muralhas intactas, portão aberto, nenhuma bandeira. No pátio, uma forja ainda tem carvão.',
    choices: [
      { label: 'Reparar as muralhas', hint: '6 pedra do armazém → posto avançado especial (território 2)',
        when: ({ G }) => G.mode !== 'campaign' ? 'Só na campanha.' : canPay(G, { stone: 6 }) ? null : 'Precisas de 6 pedra no armazém.',
        run: ({ G, h }) => {
          G.stock.stone -= 6; h.poi = null;
          G.structures[h.id] = makeStructure('keep', { name: 'Fortaleza de ' + (G.map.regions[h.region]?.name || '?'), region: h.region });
          if (h.region >= 0 && !G.claimed.includes(h.region)) G.claimed.push(h.region);
          G.flags.keep = true; syncStructures(G); reveal(G, h, 3);
          return 'A fortaleza volta a ter dono. Passa a ser um posto avançado com território alargado — para sempre.';
        } },
      { label: 'Usar a forja', hint: '2 minério', run: ({ G, ex }) => gainText(G, ex, 'ore', 2) },
      { label: 'Seguir caminho', hint: 'podes voltar mais tarde', again: true, run: () => 'Marcas o local no mapa.' }
    ]
  },
  portal: { // o Portal Antigo
    title: 'O Portal Antigo',
    text: 'Uma porta de pedra com uma espiral viva no centro. Do outro lado ouve-se vento — mas aqui o ar está parado.',
    choices: [
      { label: 'Atravessar', hint: 'precisa de 4+ mantimentos e não estar cansado',
        when: ({ G, ex, h }) => {
          if (G.mode !== 'campaign') return 'Nas expedições basta chegar ao portal.';
          if (!G.map.hexes.some(o => o.poi === 'portal' && o.id !== h.id)) return 'A espiral não leva a lado nenhum… ainda.';
          return ex.supplies >= 4 && ex.fatigue === 0 ? null : 'Prepara-te primeiro: 4 mantimentos e descansado.';
        },
        again: true,
        run: ({ G, ex, h }) => {
          const other = G.map.hexes.find(o => o.poi === 'portal' && o.id !== h.id);
          ex.hex = other.id; G.fog[other.id] = EXPLORED; reveal(G, other, 2);
          G.flags.portals = true; G.investigated[other.id] = true;
          return `Um passo e o mundo vira do avesso. Estás do outro lado do continente, em ${G.map.regions[other.region]?.name || 'terra sem nome'}. Os dois portais ficam ligados para sempre.`;
        } },
      { label: 'Estudar a espiral', hint: 'Saber +1', run: ({ G }) => { G.flags.lore = (G.flags.lore || 0) + 1; return 'Copias os símbolos. Um dia alguém os há de perceber.'; } }
    ]
  }
};
// Locais sem entrada própria usam uma descoberta genérica.
const GENERIC = { title: 'Local estranho', text: 'Há algo de antigo neste lugar.', choices: [{ label: 'Investigar', hint: 'um pequeno achado', run: ({ G, ex }) => gainText(G, ex, 'stone', 1) }] };

export function discoveryFor(G, h) { return h?.poi ? (DISCOVERIES[h.poi] || GENERIC) : null; }

export function investigateCheck(G, ex) {
  const h = hexOf(G, ex);
  if (!h.poi) return 'Não há nada para investigar aqui.';
  if (ex.acted) return 'Já fez a sua ação neste turno.';
  if (G.investigated[h.id] && !(DISCOVERIES[h.poi]?.choices.some(c => c.again))) return 'Já investigaste este local.';
  return null;
}

// Executa a escolha; investigar conta como a ação do turno.
export function resolveChoice(G, ex, index) {
  const h = hexOf(G, ex), d = discoveryFor(G, h), c = d.choices[index];
  const ctx = { G, ex, h };
  const why = c.when?.(ctx); if (why) return { error: why };
  const text = c.run(ctx);
  if (!c.again) G.investigated[h.id] = true;
  else if (!G.investigated[h.id] && index !== 0) G.investigated[h.id] = false;
  G.stats.finds.push(h.poi || 'keep');
  ex.acted = true; ex.pm = 0; ex.undo = null;
  return { text };
}
export const choiceBlocked = (G, ex, c) => c.when?.({ G, ex, h: hexOf(G, ex) }) || null;
