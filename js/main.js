// FRONTIER — arranque, menus e fluxo de jogo (Fase 2: exploradores, movimento, mantimentos, recolha).
import { VERSION, MAP_SIZES, POIS, TRAITS, RULES, UPGRADES } from './data.js';
import { randomSeed, cleanSeed } from './rng.js';
import { loadAssets, tileCSS } from './assets.js';
import { generateMap } from './map-generator.js';
import { MapView } from './map-engine.js';
import { UNKNOWN, EXPLORED } from './exploration.js';
import * as GM from './game.js';
import { setupExpedition, expeditionTick, expeditionScore, checkMissions, currentChapter, OBJECTIVES } from './modes.js';
import { rollEvent, eventView, resolveEvent } from './events.js';
import { investigateCheck, resolveChoice } from './discoveries.js';
import * as SS from './save-system.js';
import { sound } from './audio.js';
import { $, esc, icon, renderTopbar, dockHTML, hexPanelHTML, villagePanelHTML, discoveryHTML, eventHTML, warningsHTML, goalsHTML,
         scoreHTML, helpHTML, creditsHTML, toast, banner, hint, openModal, closeModal, modalOpen, poiArt, explorerRisk } from './ui.js';

const RECORDS_KEY = 'frontier.records.v2';
const settings = SS.loadSettings();
let view, G = null, slot = 0, menuDrift = null;
const S = { sel: null, preview: null, reach: null, panel: null, panelHex: -1, busy: false };
const isPhone = () => window.matchMedia('(max-width: 819px)').matches;
const buzz = ms => { if (settings.vibrate) try { navigator.vibrate?.(ms); } catch { /* */ } };

// ---------- botão Voltar (Android) ----------
const backStack = [];
function pushBack(name, close) { backStack.push({ name, close }); try { history.pushState({ fr: backStack.length }, ''); } catch { /* */ } }
function popBack(name) { const i = backStack.map(b => b.name).lastIndexOf(name); if (i >= 0) { backStack.splice(i, 1); try { history.back(); } catch { /* */ } ignorePop++; } }
let ignorePop = 0;
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  const top = backStack.pop();
  if (top) top.close(true);
  else if (G) { history.pushState({ fr: 0 }, ''); pauseMenu(); }
});

// ---------- arranque ----------
async function boot() {
  try {
    await loadAssets(p => { $('#loadBar').style.width = Math.round(p * 100) + '%'; });
    await document.fonts?.ready;
  } catch (err) {
    $('#loadText').textContent = 'Não foi possível carregar os gráficos. Abre o jogo a partir de um servidor (GitHub Pages ou localhost).';
    console.error(err); return;
  }
  view = new MapView($('#map'), { onSelect: onMapTap, onCamera: () => G && persistSoon() });
  view.motion = settings.motion; view.showCoords = settings.coords;
  sound.vol.music = settings.music; sound.vol.sfx = settings.sfx; sound.setMuted(settings.muted);
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
  syncSoundButtons(); bindUI();
  const note = SS.migrateLegacy();
  $('#loading').hidden = true;
  try { history.replaceState({ fr: 0 }, ''); } catch { /* */ }
  showMenu();
  if (note) toast(note, { ms: 6000 });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ---------- menu principal ----------
function showMenu() {
  if (G) persist();
  G = null; slot = 0; S.sel = null; S.preview = null; S.reach = null; closePanel(true);
  sound.setMood('menu');
  $('#app').hidden = false; $('#menu').hidden = false;
  for (const el of ['.topbar', '#dock', '#mapctl', '#hint']) $(el).hidden = true;
  const demo = generateMap({ seed: randomSeed(), cols: 26, rows: 20 });
  const fog = new Uint8Array(demo.hexes.length).fill(EXPLORED);
  view.setMap(demo, fog); view.fogOn = false; view.overlay = {}; view.tokens = [];
  view.cam.z = isPhone() ? 0.32 : 0.42;
  const s = view.pos[demo.start]; view.cam.x = s.x; view.cam.y = s.y; view.resize();
  clearInterval(menuDrift);
  const drift = () => { if (!settings.motion) return; const h = demo.hexes[Math.floor(Math.random() * demo.hexes.length)], p = view.pos[h.id]; view.flyTo(p.x, p.y, view.cam.z, 14000); };
  drift(); menuDrift = setInterval(drift, 14000);
  $('#menuTiles').innerHTML = [['greenlands', 'village'], ['icelands', 'mountains'], ['sandlands', 'wonder'], ['drylands', 'vulcano'], ['greenlands', 'portal']]
    .map(([b, f]) => `<div class="t" style="${tileCSS(b, f, 74)}"></div>`).join('');
  const last = SS.lastPlayed();
  let sub = 'nada para continuar';
  if (last?.kind === 'campaign') { const m = SS.slotInfo(last.slot).meta; sub = `campanha ${last.slot} · ${m.region} · turno ${m.turn}`; }
  if (last?.kind === 'expedition') sub = 'expedição a meio';
  $('#mContinue').disabled = !last;
  $('#mContinue').innerHTML = `Continuar<span class="menu-sub">${esc(sub)}</span>`;
  $('#menuFoot').textContent = `Protótipo · Fase 2 (núcleo) · v${VERSION.split('-')[0]}`;
}

function continueLast() {
  const last = SS.lastPlayed(); if (!last) return;
  if (last.kind === 'campaign') openSlot(last.slot);
  else { const r = SS.loadExpedition(); if (r?.G) startWith(r.G, 0); else toast(r?.error || 'Não foi possível abrir a expedição.'); }
}

function slotsDialog() {
  const slots = SS.listSlots();
  const card = openModal(`<h2>Campanhas</h2><p class="lead">Três espaços. Cada campanha grava sozinha no fim de cada turno e guarda a versão anterior.</p>
    <div class="slotlist">${slots.map(s => s.empty ? `<div class="slotcard empty"><b>Espaço ${s.n}</b><span>vazio</span>
        <div class="slot-actions"><button class="btn small primary" data-new="${s.n}">Nova campanha</button><button class="btn small" data-import="${s.n}">Importar</button>${s.hasBackup ? `<button class="btn small" data-restore="${s.n}">Recuperar</button>` : ''}</div></div>`
      : `<div class="slotcard"><b>Espaço ${s.n} — ${esc(s.meta.region)}</b><span>Turno ${s.meta.turn} · ${s.meta.pop} habitantes · capítulo ${s.meta.chapter} · ${new Date(s.savedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}${s.newer ? ' · <b>versão mais recente do jogo</b>' : ''}</span>
        <div class="slot-actions"><button class="btn small primary" data-open="${s.n}">Jogar</button><button class="btn small" data-export="${s.n}">Exportar</button><button class="btn small" data-import="${s.n}">Importar</button>${s.hasBackup ? `<button class="btn small" data-restore="${s.n}">Versão anterior</button>` : ''}<button class="btn small" data-del="${s.n}">Apagar</button></div></div>`).join('')}</div>
    <input type="file" id="slotFile" accept="application/json,.json" hidden>`);
  let importTo = 0;
  card.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.open) { closeModal(); openSlot(+d.open); }
    if (d.new) newGameDialog('campaign', +d.new);
    if (d.export) exportDialog(+d.export);
    if (d.import) { importTo = +d.import; importDialog(importTo); }
    if (d.restore) { if (SS.restoreBackup(+d.restore)) { toast('Versão anterior recuperada.'); slotsDialog(); } }
    if (d.del) { if (b.dataset.sure) { SS.deleteSlot(+d.del); slotsDialog(); } else { b.dataset.sure = 1; b.textContent = 'Confirmar'; } }
  };
}
function exportDialog(n) {
  SS.downloadSlot(n);
  const txt = SS.exportSlotText(n);
  const card = openModal(`<h2>Exportar campanha</h2><p class="lead">Se o ficheiro não descarregar (por exemplo, dentro de outra app), copia o texto e guarda-o num ficheiro .json.</p>
    <textarea class="savetext" readonly>${esc(txt)}</textarea>
    <div class="modal-actions"><button class="btn" id="copySave">Copiar texto</button><button class="btn primary" data-modal-close>Fechar</button></div>`);
  card.querySelector('#copySave').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Copiado.'); } catch { card.querySelector('textarea').select(); toast('Seleciona e copia o texto.'); } };
}
function importDialog(n) {
  const card = openModal(`<h2>Importar para o espaço ${n}</h2><p class="lead">Escolhe um ficheiro .json exportado do FRONTIER, ou cola o texto aqui.</p>
    <textarea class="savetext" placeholder="Cola aqui o texto do save…"></textarea>
    <div class="modal-actions"><button class="btn" id="pickFile">Escolher ficheiro</button><button class="btn primary" id="doImport">Importar</button></div>
    <input type="file" accept="application/json,.json" hidden id="impFile">`);
  const finish = txt => { const r = SS.importIntoSlot(n, txt); if (r.error) toast(r.error, { ms: 5000 }); else { toast('Campanha importada.' + (r.notes?.length ? ' ' + r.notes[0] : '')); slotsDialog(); } };
  card.querySelector('#pickFile').onclick = () => card.querySelector('#impFile').click();
  card.querySelector('#impFile').onchange = async e => { const f = e.target.files[0]; if (f) finish(await f.text()); };
  card.querySelector('#doImport').onclick = () => finish(card.querySelector('textarea').value);
}

function openSlot(n) {
  const r = SS.loadSlot(n);
  if (r.error) { toast(r.error, { ms: 6000 }); return; }
  if (r.notes?.length) toast(r.notes[0], { ms: 6000 });
  startWith(r.G, n);
}

function newGameDialog(mode, slotN = 0) {
  const isC = mode === 'campaign';
  if (isC && !slotN) { slotsDialog(); return; }
  const exp = !isC && SS.hasExpedition();
  const card = openModal(`<h2>${isC ? `Nova campanha · espaço ${slotN}` : 'Nova expedição'}</h2>
    <p class="lead">${isC ? 'Um continente grande e persistente. Cinco colonos, dois exploradores e névoa por todo o lado.'
      : 'Uma partida curta: um objetivo principal e um secundário, sorteados para o mapa.'}</p>
    ${isC ? '' : `<div class="field"><label>Duração</label><div class="seg wide"><button data-len="normal" aria-pressed="true">Normal · ${RULES.EXPEDITION_TURNS.normal} turnos<small>2–5 min</small></button><button data-len="long" aria-pressed="false">Longa · ${RULES.EXPEDITION_TURNS.long} turnos<small>5–8 min</small></button></div></div>`}
    <div class="field"><label for="seedIn">Seed do mapa</label>
      <div class="row"><input type="text" id="seedIn" maxlength="12" autocomplete="off" spellcheck="false" value="${randomSeed()}">
      <button class="icon-btn" id="seedRoll" aria-label="Nova seed">${icon('i-dice')}</button></div>
      <small>A mesma seed gera sempre o mesmo mapa${isC ? '' : ' e o mesmo objetivo'}.</small></div>
    ${isC && !SS.slotInfo(slotN).empty ? `<p class="pn-hint">Atenção: substitui a campanha do espaço ${slotN} (a anterior fica como "versão anterior").</p>` : ''}
    ${exp ? '<p class="pn-hint">Tens uma expedição a meio; começar outra substitui-a.</p>' : ''}
    <div class="modal-actions">${exp ? '<button class="btn" id="contExp">Continuar a outra</button>' : '<button class="btn" data-modal-close>Cancelar</button>'}<button class="btn primary" id="goBtn">Partir</button></div>`);
  let len = 'normal';
  card.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { len = b.dataset.len; card.querySelectorAll('[data-len]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  card.querySelector('#seedRoll').onclick = () => { card.querySelector('#seedIn').value = randomSeed(); };
  card.querySelector('#contExp')?.addEventListener('click', () => { closeModal(); continueLast(); });
  const go = () => {
    const seed = cleanSeed(card.querySelector('#seedIn').value) || randomSeed();
    closeModal();
    if (isC) { const { cols, rows } = MAP_SIZES.campaign; const g = GM.createCampaign(seed, cols, rows); startWith(g, slotN, true); }
    else { const { cols, rows } = MAP_SIZES.expedition; const g = GM.createExpedition(seed, cols, rows, len); setupExpedition(g); startWith(g, 0, true); }
  };
  card.querySelector('#goBtn').onclick = go;
  card.querySelector('#seedIn').onkeydown = e => { if (e.key === 'Enter') go(); };
}

// ---------- partida ----------
function startWith(g, slotN, fresh = false) {
  clearInterval(menuDrift); view.tween = null; closeModal();
  G = g; slot = slotN; S.sel = null; S.preview = null; S.reach = null;
  G.fogOn = G.fogOn ?? true;
  view.setMap(G.map, G.fog); view.fogOn = G.fogOn;
  $('#menu').hidden = true;
  for (const el of ['.topbar', '#dock', '#mapctl']) $(el).hidden = false;
  $('[data-ctl="fog"]').setAttribute('aria-pressed', String(G.fogOn));
  view.resize();
  if (G.cam) Object.assign(view.cam, G.cam);
  else { const s = view.pos[G.map.start]; view.cam.x = s.x; view.cam.y = s.y; view.cam.z = isPhone() ? 0.38 : 0.5; }
  view._clamp(); view.dirty = true;
  closePanel(true);
  sound.setMood(GM.season(G)); if (fresh) sound.play('start');
  render();
  persist();
  if (fresh) {
    if (G.mode === 'expedition') setTimeout(() => openModal(goalsHTML(G)), 300);
    else setTimeout(() => openModal(goalsHTML(G)), 300);
  }
  if (!settings.seenHelp) { settings.seenHelp = true; SS.saveSettings(settings); setTimeout(() => openModal(helpHTML()), 350); }
  showHint();
  if (G.pendingEvent) setTimeout(showEvent, 500);
}

let village = null;
function render() {
  if (!G) return;
  village = G.mode === 'campaign' ? GM.villageReport(G) : null;
  renderTopbar(G, village);
  const ex = S.sel ? G.explorers.find(e => e.id === S.sel) : null;
  if (ex && (ex.away)) S.sel = null;
  $('#dock').innerHTML = dockHTML(G, S.sel, S.preview);
  document.documentElement.style.setProperty('--dock-h', ($('#dock').offsetHeight || 0) + 'px');
  // camadas do mapa
  S.reach = ex && !ex.acted && !ex.away ? GM.reachable(G, ex) : null;
  view.overlay = {
    territory: GM.territory(G),
    reach: S.reach && !S.preview ? S.reach.dist : (S.reach ? new Map([...S.reach.dist].filter(([id]) => id === S.preview.path.at(-1))) : null),
    path: S.preview?.path || null, from: ex?.hex, risky: S.preview?.risky,
    worked: S.panel === 'village' && village ? village.workers : null
  };
  view.tokens = G.explorers.map(e => ({ id: e.id, hex: e.hex, color: e.color, selected: e.id === S.sel, away: e.away, done: e.acted, warn: explorerRisk(G, e) }));
  view.refreshFog(); view.dirty = true;
  if (S.panel === 'hex' && S.panelHex >= 0) $('#panel').innerHTML = hexPanelHTML(G, G.map.hexes[S.panelHex], village?.workers.find(w => w.id === S.panelHex));
  if (S.panel === 'village') $('#panel').innerHTML = villagePanelHTML(G, village);
  showHint();
}

// ---------- toques no mapa ----------
function onMapTap(id) {
  if (!G || S.busy || G.over) { if (G && id >= 0) openHexPanel(id); return; }
  if (id < 0) { deselect(); closePanel(); return; }
  const here = G.explorers.filter(e => e.hex === id && !e.away);
  const ex = S.sel ? G.explorers.find(e => e.id === S.sel) : null;
  // tocar outra vez no destino confirma
  if (ex && S.preview && S.preview.path.at(-1) === id) { confirmMove(); return; }
  // tocar num explorador seleciona-o (vários no mesmo sítio: alterna)
  if (here.length && (!ex || ex.hex !== id || here.length > 1)) {
    const i = here.findIndex(e => e.id === S.sel);
    selectExplorer(here[(i + 1) % here.length].id);
    return;
  }
  if (ex && ex.hex === id) { openHexPanel(id); return; }
  if (ex && S.reach && S.reach.dist.has(id)) {
    S.preview = GM.previewMove(G, ex, S.reach, id);
    closePanel(true); sound.play('select', 3); render();
    if (!G.hints.preview) { G.hints.preview = 1; showHint(); }
    return;
  }
  if (ex) {
    const why = ex.acted ? `${ex.name} já fez a sua ação: espera pelo próximo turno.` : G.fog[id] === UNKNOWN ? 'Desconhecido: aproxima-te para o avistar primeiro.' : GM.enterCost(G, id) === Infinity ? 'Não se pode entrar aqui.' : 'Fora de alcance neste turno.';
    toast(why, { ms: 1800 }); sound.play('deny');
    S.preview = null; render();
  }
  if (GM.isSettlement(G, id) && G.structures[id].type === 'village' && !ex) { openVillage(); return; }
  openHexPanel(id);
}

function selectExplorer(id) {
  const ex = G.explorers.find(e => e.id === id); if (!ex) return;
  if (ex.away) { toast(`${ex.name} está a recuperar na aldeia (${ex.away} ${ex.away === 1 ? 'turno' : 'turnos'}).`); return; }
  S.sel = id; S.preview = null; closePanel(true);
  sound.play('select', 4); buzz(8);
  const p = view.pos[ex.hex], sp = view.worldToScreen(p.x, p.y);
  if (sp.x < 40 || sp.x > view.W - 40 || sp.y < 110 || sp.y > view.H * 0.6) view.centerOnHex(ex.hex, Math.max(view.cam.z, 0.36), isPhone() ? view.H * 0.18 : 0);
  render();
  if (!G.hints.selected) { G.hints.selected = 1; showHint(); }
}
function deselect() { if (!S.sel) return; S.sel = null; S.preview = null; render(); }

async function confirmMove() {
  const ex = G.explorers.find(e => e.id === S.sel); if (!ex || !S.preview || S.busy) return;
  const target = S.preview.path.at(-1), from = ex.hex;
  S.busy = true; S.preview = null;
  const r = GM.moveExplorer(G, ex, target);
  buzz(15); sound.play('click');
  view.overlay = { ...view.overlay, path: null, reach: null };
  view.tokens = G.explorers.map(e => ({ id: e.id, hex: e.hex, color: e.color, selected: e.id === S.sel, away: e.away, done: e.acted, warn: null }));
  view.animateToken(ex.id, [from, ...r.path]);
  if (r.explored.length || r.revealed.length) { view.reveal([...r.explored, ...r.revealed]); sound.play('explore'); sound.play('reveal', r.revealed.length); }
  await new Promise(res => setTimeout(res, settings.motion ? Math.min(1400, 170 * r.path.length + 60) : 0));
  S.busy = false;
  for (const reg of r.regions) {
    const rg = G.map.regions[reg], tr = TRAITS[rg.trait];
    banner(`Entraste em ${rg.name}`, tr ? `${tr.name} — ${tr.desc}` : 'Uma região sem nada de especial.');
    sound.play(rg.trait === 'haunted' ? 'dark' : 'season');
  }
  for (const id of r.pois) {
    const h = G.map.hexes[id];
    toast(`<b>${POIS[h.poi].name}</b>Descoberto! Escolhe <b>Investigar</b> para saber mais.`, { kind: 'find', art: poiArt(G, h), ms: 4200 });
    setTimeout(() => sound.play(['portal', 'floating', 'crystals', 'wonder', 'stones'].includes(h.poi) ? 'magic' : ['graveyard', 'hole', 'deadtrees'].includes(h.poi) ? 'dark' : 'find'), 200);
  }
  if (r.arrived) announceArrival(ex, r.arrived);
  if (!G.hints.moved) { G.hints.moved = 1; }
  afterAction();
}

function announceArrival(ex, a) {
  const parts = Object.entries(a.delivered).map(([k, n]) => `${n} ${resName(k)}`);
  let t = parts.length ? `Entregou ${parts.join(', ')}.` : 'Chegou sem carga.';
  if (Object.keys(a.lost).length) t += ` Armazém cheio: perderam-se ${Object.entries(a.lost).map(([k, n]) => `${n} ${resName(k)}`).join(', ')}.`;
  if (a.refilled) t += ` Reabasteceu ${a.refilled} mantimentos.`;
  if (a.short) t += G.mode === 'campaign' ? ' Faltou comida ou água no armazém para encher tudo.' : ` A base já não tem mantimentos${G.baseSupplies ? '' : ' de reserva'}.`;
  toast(`<b>${esc(ex.name)}</b>${t}`, { ms: 3800 });
  if (parts.length) sound.play('find');
}
const resName = k => ({ food: 'comida', wood: 'madeira', stone: 'pedra', ore: 'minério', gold: 'ouro', water: 'água', furs: 'peles', herbs: 'ervas', crystals: 'cristais' })[k] || k;

function afterAction() {
  if (G.mode === 'expedition') {
    if (expeditionTick(G) === 'main' && !G.over) {
      sound.play('end');
      const left = G.maxTurns - G.turn + 1;
      const card = openModal(`<p class="m-eyebrow">Objetivo cumprido</p><h2>${OBJECTIVES[G.exp.main].name}!</h2>
        <p class="story">Podes terminar já (5 pontos por cada um dos ${left} turnos que sobram) ou continuar para o objetivo secundário e mais carga.</p>
        <div class="modal-actions"><button class="btn" data-modal-close>Continuar</button><button class="btn primary" id="finishNow">Terminar já</button></div>`);
      card.querySelector('#finishNow').onclick = () => { closeModal(); finishExpedition('done'); };
    }
  } else {
    for (const n of checkMissions(G)) announceMission(n);
  }
  render(); persist();
}

function announceMission(n) {
  if (n.type === 'mark') { toast(`<b>Marco cumprido</b>${n.mark.text}. Recompensa: ${GM.costText(n.mark.reward)}.`, { kind: 'find', ms: 4200 }); sound.play('find'); }
  else { sound.play('end'); setTimeout(() => openModal(`<p class="m-eyebrow">Novo capítulo</p><h2>Capítulo ${n.chapter.n} — ${n.chapter.title}</h2><p class="story">${n.chapter.intro}</p>
    <ul class="marks">${n.chapter.marks.map(m => `<li>○ ${m.text}</li>`).join('')}</ul><div class="modal-actions"><button class="btn primary" data-modal-close>Avançar</button></div>`), 600); }
}

// ---------- ações do explorador ----------
function doAction(act, why) {
  const ex = G.explorers.find(e => e.id === S.sel);
  if (why) { toast(why, { ms: 2400 }); sound.play('deny'); return; }
  switch (act) {
    case 'confirm': return confirmMove();
    case 'next': return nextExplorer();
    case 'deselect': return deselect();
    case 'gather': return gatherDialog(ex);
    case 'investigate': return investigate(ex);
    case 'camp': { const r = GM.makeCamp(G, ex); if (r.error) return toast(r.error); view.reveal(r.revealed); sound.play('season'); toast('Acampamento montado. Vês mais longe e podes guardar carga aqui.'); break; }
    case 'rest': GM.rest(G, ex); sound.play('click'); toast(`${ex.name} descansa. Amanhã terá +1 PM${ex.hunger ? ', mas sem comida o cansaço não passa' : ''}.`); break;
    case 'cook': GM.cook(G, ex); sound.play('find'); toast('Mantimento preparado: −1 comida e −1 água da mochila.', { ms: 1800 }); break;
    case 'outpost': { const r = GM.foundOutpost(G, ex); if (r.error) return toast(r.error); view.reveal(r.revealed); sound.play('start'); toast(`<b>Posto avançado fundado</b>Novo território e ponto de entrega. A região ${G.map.regions[GM.hexOf(G, ex).region]?.name} é tua.`, { kind: 'find', ms: 4500 }); break; }
    case 'deposit': toast(`Guardaste ${GM.campDeposit(G, ex)} recursos no acampamento.`, { ms: 1800 }); sound.play('click'); break;
    case 'withdraw': toast(`Levantaste ${GM.campWithdraw(G, ex)} recursos.`, { ms: 1800 }); sound.play('click'); break;
    case 'undo': GM.undoMove(G, ex); S.preview = null; sound.play('page'); break;
    case 'village': return openVillage();
    case 'goals': return openModal(goalsHTML(G));
    case 'end': return tryEndTurn();
  }
  if (act === 'gather' || act === 'rest' || act === 'camp' || act === 'outpost') { if (!G.hints.acted) { G.hints.acted = 1; } }
  afterAction();
}

function gatherDialog(ex) {
  const off = GM.gatherOffer(G, ex);
  const keys = Object.keys(off.yields);
  if (off.total <= off.free) { // cabe tudo: recolhe já
    GM.gather(G, ex, off.yields); sound.play('explore'); buzz(10);
    toast(`Recolheu ${keys.map(k => `${off.yields[k]} ${resName(k)}`).join(', ')}.`, { ms: 2200 });
    if (!G.hints.gathered) { G.hints.gathered = 1; showHint(); }
    afterAction(); return;
  }
  const pick = { ...off.pick };
  const draw = () => {
    const used = Object.values(pick).reduce((a, b) => a + b, 0);
    card.querySelector('.picker').innerHTML = keys.map(k => `<div class="pickrow"><span>${icon(({ food: 'i-food', wood: 'i-wood', stone: 'i-stone', ore: 'i-ore', gold: 'i-gold', water: 'i-water', herbs: 'i-herbs', furs: 'i-furs', crystals: 'i-crystal' })[k])} ${resName(k)} <small>(há ${off.yields[k]})</small></span>
      <button class="icon-btn mini" data-dec="${k}" ${pick[k] ? '' : 'disabled'}>${icon('i-minus')}</button><b>${pick[k] || 0}</b><button class="icon-btn mini" data-inc="${k}" ${(pick[k] || 0) < off.yields[k] && used < off.free ? '' : 'disabled'}>${icon('i-plus')}</button></div>`).join('');
    card.querySelector('#pickInfo').textContent = `${used} de ${off.free} espaços livres`;
  };
  const card = openModal(`<h2>O que levas?</h2><p class="lead">Este hexágono dá ${off.total} recursos e só tens ${off.free} ${off.free === 1 ? 'espaço livre' : 'espaços livres'} na mochila.</p>
    <div class="picker"></div><p class="pn-hint" id="pickInfo"></p>
    <div class="modal-actions"><button class="btn" data-modal-close>Cancelar</button><button class="btn primary" id="takeBtn">Recolher</button></div>`);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.inc) { pick[b.dataset.inc] = (pick[b.dataset.inc] || 0) + 1; draw(); }
    if (b.dataset.dec) { pick[b.dataset.dec]--; draw(); }
  };
  card.querySelector('#takeBtn').onclick = () => { closeModal(); GM.gather(G, ex, pick); sound.play('explore'); buzz(10); if (!G.hints.gathered) { G.hints.gathered = 1; showHint(); } afterAction(); };
  draw();
}

function investigate(ex) {
  const err = investigateCheck(G, ex); if (err) { toast(err); return; }
  sound.play('page');
  const card = openModal(discoveryHTML(G, ex), null, 'story-card');
  card.onclick = e => {
    const b = e.target.closest('[data-choice]'); if (!b || b.disabled) return;
    const r = resolveChoice(G, ex, +b.dataset.choice);
    if (r.error) { toast(r.error); return; }
    if (ex.hex !== GM.hexOf(G, ex).id || true) view.setMap(G.map, G.fog);
    card.innerHTML = `<h2>${esc(card.querySelector('h2').textContent)}</h2><p class="story">${r.text}</p><div class="modal-actions"><button class="btn primary" data-modal-close>Continuar</button></div>`;
    sound.play('find');
    if (G.flags.portals) { const p = view.pos[ex.hex]; view.flyTo(p.x, p.y); }
    afterAction();
  };
}

function nextExplorer() {
  const list = GM.activeExplorers(G).filter(e => !e.acted);
  if (!list.length) { toast('Todos os exploradores já agiram. Podes terminar o turno.', { ms: 2000 }); deselect(); return; }
  const i = list.findIndex(e => e.id === S.sel);
  selectExplorer(list[(i + 1) % list.length].id);
}

// ---------- fim de turno ----------
function tryEndTurn() {
  if (S.busy || G.over) return;
  const ws = GM.endTurnWarnings(G);
  if (ws.some(w => w.level !== 'info') || ws.length > 1 || (ws.length && G.turn < 3)) {
    const card = openModal(warningsHTML(ws));
    card.querySelector('#endAnyway').onclick = () => { closeModal(); endTurn(); };
  } else endTurn();
}

function endTurn() {
  S.sel = null; S.preview = null; closePanel(true);
  const rep = GM.endTurn(G);
  sound.play('page');
  rep.collapsed.forEach(c => toast(c.text, { kind: 'bad', ms: 6000 }));
  if (rep.hungry.length) { sound.play('dark'); toast(`Sem mantimentos: ${rep.hungry.map(id => G.explorers.find(e => e.id === id).name.replace('Expedição de ', '')).join(', ')} — cansaço a aumentar. Volta para reabastecer ou cozinha.`, { kind: 'bad', ms: 5000 }); }
  if (rep.seasonChanged) { sound.setMood(rep.seasonChanged); setTimeout(() => { sound.play('season'); banner(rep.seasonChanged, rep.seasonChanged === 'Inverno' ? 'Mais 1 mantimento por turno fora do território. As reservas de recolha voltam a encher.' : 'As reservas de recolha voltam a encher.'); }, 400); }
  if (rep.village) {
    const net = Object.entries(rep.village.net).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${resName(k)}`).join(' · ');
    if (net) toast(`<b>Turno ${G.turn}</b>Aldeia: ${net}`, { ms: 2400 });
    if (Object.keys(rep.stockLost).length) toast(`Armazém cheio: perdeu-se ${Object.entries(rep.stockLost).map(([k, v]) => `${v} ${resName(k)}`).join(', ')}. Gasta recursos em ordens!`, { ms: 4000 });
    if (rep.grew) { toast('<b>A aldeia cresceu</b>+1 habitante.', { kind: 'find' }); sound.play('find'); }
    if (rep.starved) toast('<b>Fome na aldeia</b>Um habitante partiu. Muda o foco para Comida.', { kind: 'bad', ms: 5000 });
  }
  if (G.over) { finishExpedition(G.over); return; }
  G.pendingEvent = rollEvent(G);
  if (G.mode === 'campaign') checkMissions(G).forEach(announceMission);
  render(); persist();
  if (G.pendingEvent) setTimeout(showEvent, 450);
  else if (!G.hints.turn) { G.hints.turn = 1; showHint(); }
}

function showEvent() {
  if (!G?.pendingEvent) return;
  const v = eventView(G, G.pendingEvent);
  sound.play('dark');
  const card = openModal(eventHTML(v), null, 'story-card locked');
  card.onclick = e => {
    const b = e.target.closest('[data-choice]'); if (!b) return;
    const text = resolveEvent(G, G.pendingEvent, +b.dataset.choice);
    view.refreshFog();
    card.classList.remove('locked');
    card.innerHTML = `<h2>${esc(v.title)}</h2><p class="story">${text}</p><div class="modal-actions"><button class="btn primary" data-modal-close>Continuar</button></div>`;
    render(); persist();
  };
}

function finishExpedition(why) {
  G.over = G.over || why;
  const sc = expeditionScore(G);
  const recs = readRecords();
  recs.push({ seed: G.seed, obj: G.exp.main, score: sc.total, done: sc.mainDone, len: G.length, date: new Date().toISOString().slice(0, 10) });
  recs.sort((a, b) => b.score - a.score);
  const rank = recs.findIndex(r => r.score === sc.total && r.seed === G.seed) + 1;
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(recs.slice(0, 30))); } catch { /* */ }
  SS.clearExpedition();
  sound.play('end');
  const seed = G.seed, len = G.length;
  const card = openModal(scoreHTML(G, sc, why) + `<p class="pn-hint">${rank === 1 ? 'Novo recorde!' : `${rank}.º lugar nos teus recordes.`}</p>
    <div class="modal-actions"><button class="btn" id="eMenu">Menu</button><button class="btn" id="eSame">Repetir seed</button><button class="btn primary" id="eNew">Nova expedição</button></div>`, null, 'locked');
  const fresh = s => { closeModal(); const { cols, rows } = MAP_SIZES.expedition; const g = GM.createExpedition(s, cols, rows, len); setupExpedition(g); startWith(g, 0, true); };
  card.querySelector('#eMenu').onclick = () => { closeModal(); G = null; showMenu(); };
  card.querySelector('#eSame').onclick = () => fresh(seed);
  card.querySelector('#eNew').onclick = () => fresh(randomSeed());
  render();
}
const readRecords = () => { try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; } catch { return []; } };

// ---------- painéis ----------
function openHexPanel(id) {
  S.panel = 'hex'; S.panelHex = id; view.select(id);
  $('#panel').hidden = false; $('#app').classList.add('panel-open');
  pushOnce('panel', () => closePanel(true));
  render(); $('#panel').scrollTop = 0;
}
function openVillage() {
  S.sel = null; S.preview = null;
  S.panel = 'village'; S.panelHex = -1; view.select(G.map.start);
  $('#panel').hidden = false; $('#app').classList.add('panel-open');
  pushOnce('panel', () => closePanel(true));
  render(); $('#panel').scrollTop = 0;
  if (!G.hints.village) { G.hints.village = 1; }
}
function closePanel(fromBack) {
  if (S.panel && !fromBack) popBack('panel');
  else if (S.panel) { const i = backStack.findIndex(b => b.name === 'panel'); if (i >= 0 && !fromBack) backStack.splice(i, 1); }
  S.panel = null; S.panelHex = -1; view?.select(-1);
  $('#panel').hidden = true; $('#app').classList.remove('panel-open');
  if (G) render();
}
function pushOnce(name, close) { if (!backStack.some(b => b.name === name)) pushBack(name, close); }

// ---------- dicas (tutorial leve) ----------
function showHint() {
  if (!G) return;
  const ex = G.explorers[0], h = G.hints;
  let t = null;
  if (h.off) t = null;
  else if (!h.selected) t = `Toca no peão de <b>${esc(ex.name.replace('Expedição de ', ''))}</b> (ou na ficha em baixo) para ver até onde pode ir.`;
  else if (!h.moved && !h.preview) t = 'Hexágonos dourados = ao alcance; o número é o custo em PM (inclui +1 para explorar). Toca num destino.';
  else if (!h.moved) t = 'Vê o custo e a autonomia em baixo. Toca em <b>Ir</b> (ou no mesmo hexágono) para confirmar.';
  else if (!h.gathered) t = 'Cada explorador tem <b>uma ação</b> por turno. Experimenta <b>Recolher</b>: o que o hexágono dá vai para a mochila.';
  else if (!h.turn) t = `A carga só conta quando chega a ${G.mode === 'campaign' ? 'uma povoação' : 'à base'}. Quando acabares, toca em <b>Terminar turno</b>.`;
  hint(t);
  if (!t) $('#hint').hidden = true;
}

// ---------- gravação ----------
function persist() {
  if (!G) return;
  G.cam = { x: Math.round(view.cam.x), y: Math.round(view.cam.y), z: +view.cam.z.toFixed(3) };
  if (G.mode === 'campaign' && slot) SS.saveSlot(slot, G);
  else if (G.mode === 'expedition' && !G.over) SS.saveExpedition(G);
}
let persistTimer = 0;
function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 900); }

// ---------- janelas do menu ----------
function pauseMenu() {
  const card = openModal(`<h2>Menu</h2>
    <p class="lead">${G.mode === 'campaign' ? `Campanha · espaço ${slot}` : 'Expedição'} · seed <b>${G.seed}</b> · turno ${G.turn} · gravado automaticamente</p>
    <div class="menu-list">
      <button class="btn primary" data-modal-close>Retomar</button>
      <button class="btn" id="pGoals">${G.mode === 'campaign' ? 'Missões' : 'Objetivo'}</button>
      <button class="btn" id="pHelp">Como jogar</button>
      <button class="btn" id="pOpt">Opções</button>
      ${G.mode === 'expedition' ? '<button class="btn" id="pGiveUp">Terminar expedição</button>' : ''}
      <button class="btn" id="pMenu">Menu principal</button>
    </div>`);
  card.querySelector('#pGoals').onclick = () => openModal(goalsHTML(G));
  card.querySelector('#pHelp').onclick = () => openModal(helpHTML());
  card.querySelector('#pOpt').onclick = optionsDialog;
  card.querySelector('#pGiveUp')?.addEventListener('click', () => { closeModal(); finishExpedition('quit'); });
  card.querySelector('#pMenu').onclick = () => { persist(); closeModal(); showMenu(); };
}

function optionsDialog() {
  const card = openModal(`<h2>Opções</h2>
    <label class="range"><span>Música</span><input type="range" id="oMusic" min="0" max="1" step="0.05" value="${settings.music}"></label>
    <label class="range"><span>Efeitos sonoros</span><input type="range" id="oSfx" min="0" max="1" step="0.05" value="${settings.sfx}"></label>
    <label class="toggle"><span>Vibração ao confirmar (telemóvel)</span><input type="checkbox" id="oVib" ${settings.vibrate ? 'checked' : ''}></label>
    <label class="toggle"><span>Animações e movimento</span><input type="checkbox" id="oMotion" ${settings.motion ? 'checked' : ''}></label>
    <label class="toggle"><span>Mostrar coordenadas dos hexágonos</span><input type="checkbox" id="oCoords" ${settings.coords ? 'checked' : ''}></label>
    <label class="toggle"><span>Dicas no ecrã</span><input type="checkbox" id="oHints" ${G?.hints?.off ? '' : 'checked'} ${G ? '' : 'disabled'}></label>
    <p class="pn-hint">As campanhas (exportar, importar, versões anteriores) gerem-se em <b>Campanhas</b>, no menu principal.</p>
    <div class="modal-actions"><button class="btn primary" data-modal-close>Fechar</button></div>`);
  card.querySelector('#oMusic').oninput = e => { settings.music = +e.target.value; sound.setVolume('music', settings.music); SS.saveSettings(settings); };
  card.querySelector('#oSfx').oninput = e => { settings.sfx = +e.target.value; sound.setVolume('sfx', settings.sfx); SS.saveSettings(settings); };
  card.querySelector('#oSfx').onchange = () => sound.play('find');
  card.querySelector('#oVib').onchange = e => { settings.vibrate = e.target.checked; SS.saveSettings(settings); buzz(20); };
  card.querySelector('#oMotion').onchange = e => { settings.motion = e.target.checked; view.motion = settings.motion; SS.saveSettings(settings); };
  card.querySelector('#oCoords').onchange = e => { settings.coords = e.target.checked; view.showCoords = settings.coords; view.dirty = true; SS.saveSettings(settings); };
  card.querySelector('#oHints').onchange = e => { if (G) { G.hints.off = !e.target.checked; showHint(); } };
}

function recordsDialog() {
  const recs = readRecords();
  openModal(`<h2>Recordes</h2>
    ${recs.length ? `<table class="eco score"><thead><tr><th>#</th><th>Pontos</th><th>Objetivo</th><th>Seed</th></tr></thead><tbody>${recs.slice(0, 10).map((r, i) => `<tr><td>${i + 1}</td><td><b>${r.score}</b></td><td>${OBJECTIVES[r.obj]?.name || '?'}${r.done ? ' ✓' : ''}${r.len === 'long' ? ' · longa' : ''}</td><td>${r.seed}</td></tr>`).join('')}</tbody></table>`
      : '<p class="lead">Ainda sem recordes. Termina uma expedição para registar o primeiro.</p>'}
    <div class="modal-actions"><button class="btn primary" data-modal-close>Fechar</button></div>`);
}

// ---------- ligações ----------
function bindUI() {
  $('#mContinue').onclick = continueLast;
  $('#mNewCampaign').onclick = slotsDialog;
  $('#mExpedition').onclick = () => newGameDialog('expedition');
  $('#mRecords').onclick = recordsDialog;
  $('#mOptions').onclick = optionsDialog;
  $('#mHelp').onclick = () => openModal(helpHTML());
  $('#mCredits').onclick = () => openModal(creditsHTML());
  $('#btnMenu').onclick = pauseMenu;
  $('#mSound').onclick = toggleSound;

  $('#dock').addEventListener('click', e => {
    const chip = e.target.closest('[data-ex]'); if (chip) { selectExplorer(chip.dataset.ex); return; }
    const drop = e.target.closest('[data-drop]');
    if (drop) {
      const ex = G.explorers.find(x => x.id === S.sel);
      if (drop.dataset.sure) { GM.dropCargo(G, ex, +drop.dataset.drop); sound.play('page'); render(); persist(); }
      else { drop.dataset.sure = 1; drop.classList.add('sure'); toast('Toca outra vez para largar este recurso.', { ms: 1600 }); }
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    doAction(b.dataset.act, b.dataset.why);
  });
  $('#panel').addEventListener('click', e => {
    if (e.target.closest('[data-pn="close"]')) { closePanel(); return; }
    const f = e.target.closest('[data-focus]');
    if (f) { GM.setFocus(G, f.dataset.focus); sound.play('click'); render(); persist(); return; }
    const o = e.target.closest('[data-order]');
    if (o) {
      if (o.dataset.why) { toast(o.dataset.why); sound.play('deny'); return; }
      const k = o.dataset.order;
      const r = k === 'recruit' ? GM.recruit(G) : GM.buyUpgrade(G, k);
      if (r.error) { toast(r.error); sound.play('deny'); return; }
      sound.play('find');
      toast(k === 'recruit' ? `<b>${esc(r.ex.name)}</b> junta-se aos exploradores.` : `<b>${UPGRADES[k].name}</b> prontas.`, { kind: 'find' });
      afterAction();
    }
  });
  $('#hint').addEventListener('click', e => { if (e.target.closest('[data-hint-close]')) { G.hints.off = true; hint(null); toast('Dicas desligadas (podes voltar a ligá-las nas Opções).', { ms: 2000 }); } });
  $('#mapctl').addEventListener('click', e => {
    const b = e.target.closest('[data-ctl]'); if (!b || !G) return;
    const c = b.dataset.ctl;
    if (c === 'in') view.zoomAt(1.35);
    if (c === 'out') view.zoomAt(1 / 1.35);
    if (c === 'home') view.centerOnHex(G.map.start, Math.max(view.cam.z, 0.42));
    if (c === 'fit') view.fitAll(G.fogOn ? G.fog : null);
    if (c === 'fog') toggleFog();
    if (c === 'sound') toggleSound();
  });
  document.addEventListener('click', e => { if (e.target.closest('.btn:not(:disabled), .icon-btn:not(.sound-btn), .act, .xchip, .order')) sound.play('click'); });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'Escape') { if (closeModal()) return; if (S.preview) { S.preview = null; render(); return; } if (S.panel) { closePanel(); return; } if (S.sel) { deselect(); return; } if (G) pauseMenu(); return; }
    if (!G || modalOpen()) return;
    const k = e.key.toLowerCase(), step = 160;
    if (k === 'arrowleft' || k === 'a') view.pan(-step, 0);
    else if (k === 'arrowright' || k === 'd') view.pan(step, 0);
    else if (k === 'arrowup' || k === 'w') view.pan(0, -step);
    else if (k === 'arrowdown' || k === 's') view.pan(0, step);
    else if (k === '+' || k === '=') view.zoomAt(1.25);
    else if (k === '-' || k === '_') view.zoomAt(1 / 1.25);
    else if (k === 'tab') nextExplorer();
    else if (k === 'enter') { if (S.preview) confirmMove(); else tryEndTurn(); }
    else if (k === 'f') toggleFog();
    else if (k === 'h') view.centerOnHex(G.map.start);
    else if (k === 'm') toggleSound();
    else return;
    e.preventDefault();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('pagehide', persist);
  window.addEventListener('resize', () => { if (G) render(); });
}

function toggleSound() {
  sound.unlock();
  settings.muted = !settings.muted; sound.setMuted(settings.muted); SS.saveSettings(settings);
  syncSoundButtons();
  toast(settings.muted ? 'Som desligado.' : 'Som ligado.', { ms: 1400 });
}
function syncSoundButtons() {
  document.querySelectorAll('.sound-btn').forEach(b => { b.setAttribute('aria-pressed', String(!settings.muted)); b.querySelector('use').setAttribute('href', settings.muted ? '#i-mute' : '#i-sound'); });
}
function toggleFog() {
  G.fogOn = !G.fogOn; view.fogOn = G.fogOn; view.dirty = true;
  $('[data-ctl="fog"]').setAttribute('aria-pressed', String(G.fogOn));
  toast(G.fogOn ? 'Névoa de guerra ligada.' : 'Névoa desligada — pré-visualização do continente (não muda o jogo).', { ms: 2200 });
  render();
}

window.FRONTIER = { get view() { return view; }, get game() { return G; }, get ui() { return S; }, sound, GM, select: id => selectExplorer(id), tap: id => onMapTap(id), endTurn: () => endTurn() };
boot();
