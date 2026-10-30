// Interface em DOM: barra de topo, doca de baixo (exploradores e ações), painéis, cartões e janelas.
import { BIOMES, TERRAINS, POIS, RESOURCES, BASE_RESOURCES, RULES, UPGRADES, RECRUIT_COST, FOCUS, TRAITS } from './data.js';
import { vignetteFor, tileCSS } from './assets.js';
import { UNKNOWN, DISCOVERED, EXPLORED } from './exploration.js';
import * as GM from './game.js';
import { OBJECTIVES, SECONDARY, currentChapter } from './modes.js';
import { discoveryFor, choiceBlocked } from './discoveries.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const icon = id => `<svg><use href="#${id}"/></svg>`;
const resIcon = r => icon(RESOURCES[r]?.icon || 'i-stone');
const rname = r => RESOURCES[r]?.name || r;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const turnsTxt = n => !isFinite(n) ? '∞' : plural(n, 'turno', 'turnos');

// ---------- barra de topo ----------
export function renderTopbar(G, village) {
  const s = GM.season(G), y = GM.year(G);
  if (G.mode === 'campaign') {
    const ch = currentChapter(G), done = ch.marks.filter(m => G.missions.done[m.id]).length;
    $('#tbRegion').textContent = `${G.structures[G.map.start]?.name || 'Aldeia'} · ${plural(G.pop, 'habitante', 'habitantes')}`;
    $('#tbSub').textContent = ch.marks.length ? `Capítulo ${ch.n} — ${ch.title} · ${done}/${ch.marks.length} marcos` : `Capítulo ${ch.n} — ${ch.title}`;
    $('#tbTurn').textContent = `Turno ${G.turn}`;
    $('#tbRes').innerHTML = BASE_RESOURCES.map(k => {
      const d = village?.net?.[k] || 0;
      return `<span class="res" title="${rname(k)}: ${G.stock[k]} no armazém, ${d >= 0 ? '+' : ''}${d} por turno">${resIcon(k)}${G.stock[k]}${d ? `<small class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</small>` : ''}</span>`;
    }).join('');
  } else {
    const o = OBJECTIVES[G.exp.main];
    $('#tbRegion').textContent = o.name;
    $('#tbSub').textContent = o.progress(G);
    $('#tbTurn').textContent = `Turno ${Math.min(G.turn, G.maxTurns)} de ${G.maxTurns}`;
    const del = Object.entries(G.delivered).filter(([, n]) => n);
    $('#tbRes').innerHTML = `<span class="res label">Na base</span>` +
      (del.length ? del.map(([k, n]) => `<span class="res" title="${rname(k)} entregue">${resIcon(k)}${n}</span>`).join('') : '<span class="res muted">nada ainda</span>') +
      `<span class="res" title="Reserva de mantimentos na base">${icon('i-supply')}${G.baseSupplies}</span>`;
  }
  $('#tbSeason').textContent = `${s} · Ano ${y}`;
}

// ---------- doca de baixo ----------
function supplyLine(G, ex) {
  const c = GM.consumption(G, ex), aut = GM.autonomy(G, ex), back = GM.returnTurns(G, ex);
  const risk = c > 0 && isFinite(back) && back > aut ? 'bad' : c > 0 && aut <= RULES.WARN_AUTONOMY ? 'warn' : '';
  const autTxt = c === 0 ? 'em território (não gasta)' : `${turnsTxt(aut)} de autonomia · ${isFinite(back) ? `regresso ~${turnsTxt(back)}` : 'sem caminho conhecido de volta'}`;
  return { risk, html: `<span class="sup ${risk}">${icon('i-supply')}<b>${ex.supplies}/${ex.maxSupplies}</b> <span>${autTxt}${c > 1 ? ` · gasta ${c}/turno aqui` : ''}</span></span>` };
}
export function explorerRisk(G, ex) {
  if (ex.away) return null;
  const c = GM.consumption(G, ex); if (!c) return ex.fatigue ? 'warn' : null;
  const aut = GM.autonomy(G, ex), back = GM.returnTurns(G, ex);
  if (ex.supplies < c || (isFinite(back) && back > aut)) return 'bad';
  if (aut <= RULES.WARN_AUTONOMY || ex.fatigue) return 'warn';
  return null;
}
const fatigueTxt = ex => ex.fatigue >= 2 ? '<span class="tag bad">exausto</span>' : ex.fatigue === 1 ? '<span class="tag warn">cansado</span>' : '';

function packHTML(G, ex) {
  const cap = GM.packCap(G); let h = '';
  for (let i = 0; i < cap; i++) {
    const r = ex.cargo[i];
    h += r ? `<button class="slot full" data-drop="${i}" title="${rname(r)} — toca para largar">${resIcon(r)}</button>` : '<span class="slot"></span>';
  }
  return `<div class="pack" aria-label="Mochila ${ex.cargo.length} de ${cap}">${icon('i-pack')}<div class="slots">${h}</div><b>${ex.cargo.length}/${cap}</b></div>`;
}

export function dockHTML(G, sel, preview) {
  if (G.over) return '';
  const ex = sel ? G.explorers.find(e => e.id === sel) : null;
  if (!ex) {
    const chips = G.explorers.map(e => {
      const risk = explorerRisk(G, e);
      const st = e.away ? `a recuperar (${e.away})` : e.acted ? 'feito' : `${e.pm} PM`;
      return `<button class="xchip ${e.acted || e.away ? 'done' : ''}" data-ex="${e.id}">
        <i class="dot" style="background:${e.color}"></i><span class="xn">${esc(e.name.replace('Expedição de ', ''))}${e.members ? ` <small>×${e.members}</small>` : ''}</span>
        <span class="xs">${st} · ${icon('i-supply')}${e.supplies} · ${icon('i-pack')}${e.cargo.length}</span>${risk ? `<i class="warnmark ${risk}">!</i>` : ''}</button>`;
    }).join('');
    return `<div class="dock-row chips">${chips}</div>
      <div class="dock-row main">
        ${G.mode === 'campaign' ? `<button class="btn small" data-act="village">${icon('i-home')} Aldeia</button>` : ''}
        <button class="btn small" data-act="goals">${icon('i-missions')} ${G.mode === 'campaign' ? 'Missões' : 'Objetivo'}</button>
        <button class="btn primary endturn" data-act="end">Terminar turno</button>
      </div>`;
  }
  const h = GM.hexOf(G, ex), sup = supplyLine(G, ex);
  const pm = ex.away ? 0 : ex.pm;
  let pv = '';
  if (preview) {
    const tgt = G.map.hexes[preview.path.at(-1)];
    const name = G.fog[tgt.id] === EXPLORED ? (tgt.poi ? POIS[tgt.poi].name : TERRAINS[tgt.feature].name) : TERRAINS[tgt.feature].name + ' (por explorar)';
    const after = preview.consumption === 0 ? 'em território' : `autonomia depois: ${turnsTxt(preview.autonomy)}`;
    pv = `<div class="preview ${preview.risky ? 'bad' : ''}">
      <div><b>${esc(name)}</b> · ${preview.cost} PM${preview.explorePm ? ` <span class="explore-cost">(inclui +${preview.explorePm} de exploração)</span>` : ''} · ficam ${preview.pmLeft} PM
      <br><small>${after} · ${isFinite(preview.back) ? `regresso dali ~${turnsTxt(preview.back)}` : 'sem caminho conhecido de volta'}${preview.settlement ? ' · entrega a carga ao chegar' : ''}</small>
      ${preview.risky ? '<br><small class="riskline">Atenção: com os mantimentos que tem, pode não conseguir voltar.</small>' : ''}</div>
      <button class="btn primary small" data-act="confirm">Ir</button></div>`;
  }
  const acts = [];
  const add = (id, label, ico, err, extra = '') => acts.push(`<button class="act ${err ? 'off' : ''}" data-act="${id}" ${err ? `data-why="${esc(err)}"` : ''}>${icon(ico)}<span>${label}</span>${extra}</button>`);
  add('gather', 'Recolher', 'i-gather', GM.gatherCheck(G, ex), h.feature !== 'water' ? `<small>${GM.reserveLeft(G, h.id)}/${RULES.RESERVE}</small>` : '');
  const inv = h.poi && G.fog[h.id] === EXPLORED;
  if (inv) add('investigate', 'Investigar', 'i-explore', ex.acted ? 'Já fez a sua ação neste turno.' : (G.investigated[h.id] && !discoveryFor(G, h).choices.some(c => c.again)) ? 'Já investigaste este local.' : null);
  add('camp', 'Acampar', 'i-camp', GM.campCheck(G, ex));
  add('rest', 'Descansar', 'i-rest', ex.acted ? 'Já fez a sua ação neste turno.' : null);
  if (GM.canCook(ex)) add('cook', 'Cozinhar', 'i-supply', null, '<small>grátis</small>');
  if (G.mode === 'campaign' && !GM.isSettlement(G, h.id)) add('outpost', 'Posto', 'i-tower', GM.outpostCheck(G, ex));
  if (G.structures[h.id]?.type === 'camp') { add('deposit', 'Guardar', 'i-pack', ex.cargo.length ? null : 'A mochila está vazia.'); add('withdraw', 'Levantar', 'i-pack', G.structures[h.id].store.length ? null : 'Não há nada guardado aqui.', `<small>${G.structures[h.id].store.length}</small>`); }
  if (ex.undo) add('undo', 'Anular', 'i-undo', null);
  return `<div class="exbar">
      <div class="exhead"><i class="dot big" style="background:${ex.color}"></i>
        <div class="exname"><b>${esc(ex.name)}</b>${ex.members ? ` <small>${plural(ex.members, 'membro', 'membros')}</small>` : ''} ${fatigueTxt(ex)}
          <div class="pmline">${ex.away ? 'a recuperar na aldeia' : ex.acted ? 'ação feita · espera pelo próximo turno' : `<b>${pm}</b> de ${GM.maxPm(G, ex) + (pm > GM.maxPm(G, ex) ? pm - GM.maxPm(G, ex) : 0)} PM`}</div></div>
        <button class="icon-btn mini" data-act="next" aria-label="Próximo explorador">${icon('i-next')}</button>
        <button class="icon-btn mini" data-act="deselect" aria-label="Fechar">${icon('i-close')}</button></div>
      <div class="exstats">${sup.html}${packHTML(G, ex)}</div>
      ${pv}
      <div class="acts">${acts.join('')}</div></div>`;
}

// ---------- ilustração ----------
function artHTML(G, h, st, w = 104) {
  if (st === UNKNOWN) return `<div style="${tileCSS('sketch', 'fog', w)}"></div>`;
  if (st === DISCOVERED) return `<div style="${tileCSS('sketch', h.feature, w)}"></div>`;
  const k = h.structure || h.poi || h.feature;
  const v = h.feature === 'water' ? null : vignetteFor(h.biome, k);
  if (v) { const s = w / v.w; return `<div class="sprite" role="img" aria-label="" style="width:${w}px;height:${Math.round(v.h * s)}px;background-image:url(${v.url});background-size:${v.sheetW * s}px ${v.sheetH * s}px;background-position:${-v.x * s}px ${-v.y * s}px"></div>`; }
  return `<div style="${tileCSS(h.feature === 'water' ? 'greenlands' : h.biome, k, w)}"></div>`;
}
export const poiArt = (G, h) => artHTML(G, h, EXPLORED, 52);

const STRUCT_NAMES = { village: 'Aldeia', outpost: 'Posto avançado', keep: 'Fortaleza', base: 'Acampamento-base', camp: 'Acampamento' };
const STRUCT_DESC = {
  village: 'O coração da colónia. Entrega aqui a carga; os exploradores reabastecem (1 comida + 1 água por mantimento).',
  outpost: 'Estrutura permanente: território à volta, ponto de entrega e de reabastecimento, reivindica a região.',
  keep: 'Posto avançado especial com território alargado.',
  base: 'O ponto de partida da expedição. Entrega aqui a carga. Tem uma reserva limitada de mantimentos.',
  camp: 'Estrutura temporária de exploração: vê mais longe, gasta-se 1 mantimento a menos aqui, e guarda carga no local (não conta como entregue).'
};

export function hexPanelHTML(G, h, worked) {
  const st = G.fogOn ? G.fog[h.id] : EXPLORED;
  const terr = TERRAINS[h.feature], biome = h.feature === 'water' ? null : BIOMES[h.biome];
  const struct = G.structures[h.id];
  let kicker, title, desc;
  if (st === UNKNOWN) { kicker = 'Terra desconhecida'; title = 'Névoa'; desc = 'Ninguém da tua gente viu estas terras. Leva um explorador para perto para as avistar.'; }
  else if (st === DISCOVERED) { kicker = 'Avistado ao longe'; title = terr.name; desc = `O cartógrafo esboçou o terreno. Entrar aqui custa ${terr.move >= 9 ? '—' : terr.move + ' PM + ' + RULES.EXPLORE_EXTRA + ' de exploração'} e revela o que esconde.`; }
  else if (struct) { kicker = STRUCT_NAMES[struct.type]; title = struct.name || STRUCT_NAMES[struct.type]; desc = STRUCT_DESC[struct.type]; }
  else if (h.poi) { kicker = 'Local especial'; title = POIS[h.poi].name; desc = POIS[h.poi].desc + (G.investigated[h.id] ? ' <i>(já investigado)</i>' : ' Leva um explorador até cá e escolhe <b>Investigar</b>.'); }
  else { kicker = 'Terreno'; title = terr.name; desc = terr.desc; }
  const badge = st === EXPLORED ? '<span class="badge explored">Explorado</span>' : st === DISCOVERED ? '<span class="badge discovered">Esboçado</span>' : '<span class="badge unknown">Desconhecido</span>';
  const rg = h.region >= 0 ? G.map.regions[h.region] : null;
  const tr = rg && G.regionsSeen.includes(h.region) && rg.trait ? TRAITS[rg.trait] : null;

  let body = '';
  if (st !== UNKNOWN && h.feature !== 'water') {
    const y = GM.hexYields(G, h);
    const entries = Object.entries(y).filter(([k]) => st === EXPLORED || !RESOURCES[k].rare);
    const left = GM.reserveLeft(G, h.id);
    body += `<div class="pn-sec"><h4>Recolher aqui (por recolha)</h4><div class="yields">${entries.length ? entries.map(([k, v]) => `<span class="yield${RESOURCES[k].rare ? ' rare' : ''}">${resIcon(k)}${v} ${rname(k)}</span>`).join('') : '<span class="pn-hint">Nada que se aproveite.</span>'}${st === DISCOVERED ? '<span class="yield">+ ?</span>' : ''}</div>
      <div class="reserve" title="Reservas de recolha nesta estação">${'<i class="on"></i>'.repeat(Math.max(0, left))}${'<i></i>'.repeat(RULES.RESERVE - Math.max(0, left))}<span>${left} de ${RULES.RESERVE} recolhas nesta estação</span></div></div>`;
    if (worked) body += `<div class="pn-sec worked"><h4>Trabalhado pela aldeia</h4><p>Dá <b>+${worked.amt} ${rname(worked.res)}</b> por turno ao armazém${worked.why === 'falta' ? ' (faz falta à população)' : ''}. A produção da aldeia não gasta as reservas: continua a dar para recolher à mão.</p></div>`;
  }
  if (struct?.type === 'camp' && struct.store.length) {
    const c = {}; struct.store.forEach(r => { c[r] = (c[r] || 0) + 1; });
    body += `<div class="pn-sec"><h4>Guardado neste acampamento</h4><div class="yields">${Object.entries(c).map(([k, n]) => `<span class="yield">${resIcon(k)}${n}</span>`).join('')}</div><p class="pn-hint">Ainda não conta como entregue: leva-o a uma povoação.</p></div>`;
  }
  if (st !== UNKNOWN) body += `<div class="pn-sec"><dl class="kv">
      <dt>Região</dt><dd>${esc(rg?.name || 'Mar Desconhecido')}${tr ? ` — <i>${tr.name}</i>` : rg ? ' <span class="muted">(traço por descobrir)</span>' : ''}</dd>
      ${tr ? `<dt></dt><dd class="muted">${tr.desc}</dd>` : ''}
      ${biome ? `<dt>Bioma</dt><dd>${biome.name}</dd>` : ''}
      <dt>Movimento</dt><dd>${terr.move >= 9 ? 'Intransitável' : terr.move + ' PM' + (st === DISCOVERED ? ` (+${RULES.EXPLORE_EXTRA} por explorar)` : '')}</dd>
      <dt>Mantimentos</dt><dd>${GM.inTerritory(G, h.id) ? 'não se gasta (território)' : `${GM.consumption(G, {}, h.id)} por turno aqui`}</dd>
    </dl></div>`;
  return `<div class="pn"><div class="grip"></div>
    <button class="icon-btn pn-close" data-pn="close" aria-label="Fechar">${icon('i-close')}</button>
    <div class="pn-head"><div class="pn-art">${artHTML(G, h, st, window.innerWidth < 820 ? 84 : 104)}</div>
      <div><div class="pn-kicker">${kicker}</div><h3 class="pn-title">${esc(title)}</h3>${biome && st !== UNKNOWN ? `<div class="pn-biome">${biome.name}</div>` : ''}${badge}</div></div>
    <p class="pn-desc">${desc}</p>${body}</div>`;
}

export function villagePanelHTML(G, vr) {
  const all = [...new Set([...Object.keys(vr.prod), ...Object.keys(vr.cons)])].sort((a, b) => BASE_RESOURCES.indexOf(a) - BASE_RESOURCES.indexOf(b));
  const sign = n => (n > 0 ? '+' : '') + n;
  const rows = all.map(r => `<tr><td>${resIcon(r)} ${rname(r)}</td><td>${vr.prod[r] ? '+' + vr.prod[r] : '—'}</td><td>${vr.cons[r] ? '−' + vr.cons[r] : '—'}</td><td class="${vr.net[r] > 0 ? 'up' : vr.net[r] < 0 ? 'down' : ''}"><b>${sign(vr.net[r] || 0)}</b></td><td>${G.stock[r]}</td></tr>`).join('');
  const orders = [];
  const rc = GM.recruitCheck(G);
  orders.push(`<button class="order ${rc ? 'off' : ''}" data-order="recruit" ${rc ? `data-why="${esc(rc)}"` : ''}><b>Recrutar explorador</b><span>${GM.costText(RECRUIT_COST)} · 1 habitante</span></button>`);
  for (const [k, u] of Object.entries(UPGRADES)) {
    const e = GM.upgradeCheck(G, k);
    orders.push(`<button class="order ${G.upgrades[k] ? 'owned' : e ? 'off' : ''}" data-order="${k}" ${e ? `data-why="${esc(e)}"` : ''}><b>${u.name}${G.upgrades[k] ? ' ✓' : ''}</b><span>${u.desc} ${G.upgrades[k] ? '' : '· ' + GM.costText(u.cost)}</span></button>`);
  }
  const rare = ['herbs', 'furs', 'crystals'].filter(r => G.stock[r]).map(r => `${resIcon(r)}${G.stock[r]} ${rname(r)}`).join(' · ');
  return `<div class="pn"><div class="grip"></div>
    <button class="icon-btn pn-close" data-pn="close" aria-label="Fechar">${icon('i-close')}</button>
    <div class="pn-head"><div class="pn-art"><div style="${tileCSS(G.map.hexes[G.map.start].biome, 'village', window.innerWidth < 820 ? 84 : 104)}"></div></div>
      <div><div class="pn-kicker">Aldeia</div><h3 class="pn-title">${esc(G.structures[G.map.start].name)}</h3>
      <div class="pn-biome">${plural(G.pop, 'habitante', 'habitantes')}: ${vr.n} a trabalhar, ${G.explorers.length} ${G.explorers.length === 1 ? 'explorador' : 'exploradores'}</div></div></div>
    <div class="pn-sec"><h4>Foco do trabalho</h4><div class="seg">${Object.entries(FOCUS).map(([k, f]) => `<button data-focus="${k}" aria-pressed="${G.focus === k}">${f.name}</button>`).join('')}</div>
      <p class="pn-hint">A aldeia trabalha sozinha os hexágonos explorados a até ${RULES.WORK_RADIUS} de distância (marcados no mapa). Primeiro garante a comida e a água da população; depois segue o foco.</p></div>
    <div class="pn-sec"><h4>Produção por turno — ${GM.season(G)}</h4>
      <table class="eco"><thead><tr><th></th><th>Produz</th><th>Gasta</th><th>Saldo</th><th>Tens</th></tr></thead><tbody>${rows}</tbody></table>
      ${vr.idle ? `<p class="pn-hint">${plural(vr.idle, 'habitante sem', 'habitantes sem')} trabalho: explora mais hexágonos perto da aldeia.</p>` : ''}
      <p class="pn-hint">Armazém: máximo ${RULES.STORE_CAP} de cada recurso. ${vr.freshWater ? 'Há água doce ao lado: a água não se gasta.' : 'Sem rio ou lago ao lado: a população bebe água do armazém.'} Para crescer: ${RULES.GROW.food} comida e ${RULES.GROW.water} água de sobra no fim da estação.</p>
      ${rare ? `<p class="pn-hint">Raros: ${rare}</p>` : ''}</div>
    <div class="pn-sec"><h4>Ordens</h4><div class="orders">${orders.join('')}</div>
      <p class="pn-hint">Postos avançados: leva um explorador a 3+ hexágonos de distância e escolhe <b>Posto</b> (${GM.costText(RULES.OUTPOST_COST)} do armazém).</p></div></div>`;
}

// ---------- cartões ----------
export function discoveryHTML(G, ex) {
  const h = GM.hexOf(G, ex), d = discoveryFor(G, h);
  return `<div class="card-art">${artHTML(G, h, EXPLORED, 150)}</div>
    <p class="m-eyebrow">${esc(G.map.regions[h.region]?.name || '')}</p><h2>${d.title}</h2>
    <p class="story">${d.text}</p>
    <div class="choices">${d.choices.map((c, i) => { const why = choiceBlocked(G, ex, c); return `<button class="choice ${why ? 'off' : ''}" data-choice="${i}" ${why ? 'disabled' : ''}><b>${c.label}</b><span>${why || c.hint}</span></button>`; }).join('')}</div>
    <p class="pn-hint">Investigar conta como a ação do turno.</p>`;
}
export function eventHTML(view) {
  return `<p class="m-eyebrow">Acontecimento</p><h2>${view.title}</h2><p class="story">${view.text}</p>
    <div class="choices">${view.choices.map((c, i) => `<button class="choice" data-choice="${i}"><b>${c.label}</b><span>${c.hint}</span></button>`).join('')}</div>`;
}
export function warningsHTML(ws) {
  return `<h2>Terminar o turno?</h2>
    <ul class="warns">${ws.map(w => `<li class="${w.level}">${esc(w.text)}</li>`).join('')}</ul>
    <div class="modal-actions"><button class="btn" data-modal-close>Voltar</button><button class="btn primary" id="endAnyway">Terminar mesmo assim</button></div>`;
}
export function goalsHTML(G) {
  if (G.mode === 'expedition') {
    const o = OBJECTIVES[G.exp.main], s = SECONDARY[G.exp.sec];
    return `<p class="m-eyebrow">Expedição · turno ${G.turn} de ${G.maxTurns}</p><h2>${o.name}</h2><p class="story">${o.desc}</p><p><b>${o.progress(G)}</b></p>
      <h3>Secundário — ${s.name}</h3><p>${s.desc} ${s.done(G) ? '<b>(a cumprir)</b>' : ''}</p>
      <h3>Pontuação</h3><p class="pn-hint">Objetivo 100 · secundário 50 · 5 por hexágono explorado · valor da carga entregue · 10 por membro vivo · 5 por turno que sobrar se cumprires o objetivo.</p>
      <div class="modal-actions"><button class="btn primary" data-modal-close>Continuar</button></div>`;
  }
  const ch = currentChapter(G);
  return `<p class="m-eyebrow">Campanha</p><h2>Capítulo ${ch.n} — ${ch.title}</h2><p class="story">${ch.intro}</p>
    <ul class="marks">${ch.marks.map(m => `<li class="${G.missions.done[m.id] ? 'done' : ''}">${G.missions.done[m.id] ? '✓' : '○'} ${m.text}<small>recompensa: ${GM.costText(m.reward)}</small></li>`).join('') || '<li>Continua nas próximas fases.</li>'}</ul>
    <div class="modal-actions"><button class="btn primary" data-modal-close>Continuar</button></div>`;
}
export function scoreHTML(G, sc, why) {
  const o = OBJECTIVES[G.exp.main];
  const lead = why === 'starved' ? 'A fome venceu a expedição.' : sc.mainDone ? `${o.name}: cumprido!` : `${o.name}: não cumprido.`;
  return `<p class="m-eyebrow">Fim da expedição</p><h2>${sc.total} pontos</h2><p class="lead">${lead}</p>
    <table class="eco score"><tbody>${sc.parts.map(([k, v]) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`).join('')}</tbody></table>`;
}

// ---------- ajuda ----------
export function helpHTML() {
  return `<h2>Como jogar</h2>
  <p class="lead">Exploradores levam a tua gente ao desconhecido e voltam com o que encontram.</p>
  <h3>1. Mover</h3>
  <p>Toca num explorador (o peão). Os hexágonos dourados estão ao alcance; o número é o custo em <b>pontos de movimento</b> (5 por turno). Toca num destino para ver o caminho e o custo; <b>Ir</b> (ou tocar outra vez) confirma.</p>
  <p>Entrar num hexágono <b>esboçado</b> custa +1 PM — é explorá-lo. Planície 1 · floresta, colinas e rio 2 · montanha e pântano 3. Lagos e mar não se atravessam.</p>
  <h3>2. Uma ação por turno</h3>
  <p><b>Recolher</b> enche a mochila com o que o hexágono dá (cada hexágono dá 3 recolhas por estação). <b>Investigar</b> abre a história de um local especial. <b>Acampar</b> (2 madeira) monta um acampamento. <b>Descansar</b> tira o cansaço e dá +1 PM amanhã. Depois da ação o explorador pára.</p>
  <h3>3. Mantimentos e mochila</h3>
  <p>São compartimentos separados: <b>mantimentos</b> (6 na campanha, 8 nas expedições) e <b>mochila</b> com 6 espaços só para recursos. Fora do território gasta-se 1 mantimento por turno (+1 nos Areais, +1 no inverno). Vês sempre a <b>autonomia</b> e quantos turnos precisas para voltar; o peão ganha um <b>!</b> quando o regresso está em risco. Sem comida: primeiro cansado, depois exausto — perder alguém é muito raro e o jogo avisa antes.</p>
  <p><b>Cozinhar</b> transforma 1 comida + 1 água da mochila num mantimento.</p>
  <h3>4. Entregar</h3>
  <p>Os recursos só contam quando chegam a uma povoação (aldeia, posto ou base). Ao chegar, a carga entra no armazém e os mantimentos são repostos.</p>
  <h3>5. A aldeia (campanha)</h3>
  <p>Trabalha sozinha os hexágonos explorados à volta. No painel da aldeia vês produção, consumo e saldo de cada recurso e escolhes o foco. Com o armazém compras exploradores e equipamento.</p>
  <h3>Controlos</h3>
  <dl class="controls"><dt>Toque</dt><dd>arrastar move · pinça faz zoom · botão Voltar fecha painéis</dd>
  <dt>Teclado</dt><dd>setas mover · + − zoom · Tab próximo explorador · Enter terminar turno · F névoa · H aldeia · M som · Esc fechar</dd></dl>
  <div class="modal-actions"><button class="btn primary" data-modal-close>Entendido</button></div>`;
}

export function creditsHTML() {
  return `<h2>Créditos</h2>
  <div class="credit"><img src="assets/ui/credit_cmartins_ccby.png" alt="Art by C. Martins, CC BY">
  <p><b>Ilustrações dos hexágonos</b> — Carlos Martins (<a href="https://cmartins.itch.io/" target="_blank" rel="noopener">cmartins.itch.io</a>): pacote “foundation tiles” (mapa) e pacotes Forest, Desert, Mountain e Tundra (ilustrações). Licença CC BY.</p></div>
  <p><b>Nomes</b> — tabelas “PAST · Printable Adventures &amp; Systemless Tools”, de C. Martins.</p>
  <p><b>Tipografia</b> — IM Fell English SC (Igino Marini) e Alegreya (Huerta Tipográfica), SIL Open Font License.</p>
  <p><b>Música e efeitos</b> — sintetizados em tempo real (alaúde, flauta, bordão e tambor generativos, que mudam com as estações).</p>
  <p class="small-print">FRONTIER — Realms of the Unknown · inspirado em Catan, Civilization, The Settlers e nos roguelites.</p>
  <div class="modal-actions"><button class="btn primary" data-modal-close>Fechar</button></div>`;
}

// ---------- avisos, faixa e janelas ----------
export function toast(html, { kind = '', ms = 3200, art = '' } = {}) {
  const box = $('#toasts'), el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (art ? `<div class="t-art">${art}</div>` : '') + `<div>${html}</div>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}
export function banner(title, sub) {
  const b = $('#banner');
  b.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
  b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 3600);
}
export function hint(text) {
  const el = $('#hint');
  if (!text) { el.hidden = true; return; }
  el.innerHTML = `<span>${text}</span><button class="icon-btn mini" data-hint-close aria-label="Fechar dica">${icon('i-close')}</button>`;
  el.hidden = false;
}

let onModalClose = null;
export function openModal(html, onClose, cls = '') {
  const card = $('#modalCard');
  card.className = 'modal-card ' + cls;
  card.innerHTML = (cls.includes('locked') ? '' : `<button class="icon-btn x" data-modal-close aria-label="Fechar">${icon('i-close')}</button>`) + html;
  $('#modal').hidden = false;
  onModalClose = onClose || null;
  card.scrollTop = 0;
  return card;
}
export function closeModal() {
  if ($('#modal').hidden) return false;
  $('#modal').hidden = true;
  const cb = onModalClose; onModalClose = null; cb?.();
  return true;
}
export const modalOpen = () => !$('#modal').hidden;
document.addEventListener('click', e => {
  if (e.target.closest('[data-modal-close]') || (e.target.id === 'modal' && !$('#modalCard').classList.contains('locked'))) closeModal();
});
