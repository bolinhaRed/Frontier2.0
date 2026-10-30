// Motor do mapa: desenho em Canvas 2D, câmara (zoom/deslocação), toque, rato e teclado.
import { hexToPixel, pixelToHex, key, HEX_SIZE, TILE_W, TILE_H, corners } from './hex-coordinates.js';
import { tileSource } from './assets.js';
import { UNKNOWN, DISCOVERED, EXPLORED } from './exploration.js';

const ease = t => 1 - Math.pow(1 - t, 3);
const easeBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const now = () => performance.now();
const RIVER_NATIVE = [3, 5];
const RES_SHORT = { food: 'comida', wood: 'madeira', stone: 'pedra', ore: 'minério', gold: 'ouro', water: 'água' };
const RES_COLOR = { food: '#9a6b12', wood: '#6b4423', stone: '#5e5e5e', ore: '#3d4f63', gold: '#a37c00', water: '#2c6a97' }; // o tile de rio entra pelo lado NW e sai pelo lado S

function riverRotation(from, to) {
  const ends = [from, to].filter(d => d >= 0);
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 6; k++) {
    const a = (RIVER_NATIVE[0] - k + 6) % 6, b = (RIVER_NATIVE[1] - k + 6) % 6;
    const cd = (x, y) => { const d = Math.abs(x - y) % 6; return Math.min(d, 6 - d); };
    let s;
    if (ends.length === 2) s = Math.min(cd(a, ends[0]) + cd(b, ends[1]), cd(a, ends[1]) + cd(b, ends[0]));
    else if (ends.length === 1) s = Math.min(cd(a, ends[0]), cd(b, ends[0]));
    else s = 0;
    if (s < bestScore) { bestScore = s; best = k; }
  }
  return best * Math.PI / 3;
}

export class MapView {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.onSelect = opts.onSelect || (() => {});
    this.onCamera = opts.onCamera || (() => {});
    this.cam = { x: 0, y: 0, z: 0.5 };
    this.fogOn = true; this.showCoords = false; this.motion = true;
    this.selected = -1; this.hover = -1; this.selT0 = 0;
    this.reveals = new Map(); this.tween = null; this.vel = null;
    this.overlay = {}; this.tokens = []; this.tokenAnim = new Map();
    this.pointers = new Map(); this.gesture = null;
    this.dirty = true;
    this._bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { this._frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setMap(map, fog) {
    this.map = map; this.fog = fog;
    this.pos = map.hexes.map(h => hexToPixel(h.q, h.r));
    this.order = map.hexes.map(h => h.id).sort((a, b) => this.pos[a].y - this.pos[b].y || this.pos[a].x - this.pos[b].x);
    this.rot = map.hexes.map(h => h.feature === 'river' && h.river ? riverRotation(h.river.from, h.river.to) : 0);
    const xs = this.pos.map(p => p.x), ys = this.pos.map(p => p.y);
    this.bounds = { x0: Math.min(...xs) - TILE_W / 2, x1: Math.max(...xs) + TILE_W / 2, y0: Math.min(...ys) - TILE_H / 2, y1: Math.max(...ys) + TILE_H / 2 };
    this.regionCenters = map.regions.map(rg => {
      let x = 0, y = 0; rg.hexes.forEach(id => { x += this.pos[id].x; y += this.pos[id].y; });
      const n = Math.max(1, rg.hexes.length); return { x: x / n, y: y / n };
    });
    this.selected = -1; this.hover = -1; this.reveals.clear();
    this.refreshFog();
  }

  refreshFog() {
    // hexágonos desconhecidos na orla do conhecido recebem nuvens; os restantes ficam em pergaminho
    this.edge = new Uint8Array(this.map.hexes.length);
    for (const h of this.map.hexes) {
      if (this.fog[h.id] !== UNKNOWN) continue;
      if (this.map.nbrs(h).some(n => this.fog[n.id] !== UNKNOWN)) this.edge[h.id] = 1;
    }
    this.dirty = true;
  }

  get minZoom() { const b = this.bounds; return Math.max(0.06, Math.min(this.W / (b.x1 - b.x0), this.H / (b.y1 - b.y0)) * 0.92); }
  get maxZoom() { return 1.3; }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
    if (this.map) this._clamp();
    this.dirty = true;
  }

  // ---------- câmara ----------
  screenToWorld(sx, sy) { return { x: this.cam.x + (sx - this.W / 2) / this.cam.z, y: this.cam.y + (sy - this.H / 2) / this.cam.z }; }
  worldToScreen(x, y) { return { x: (x - this.cam.x) * this.cam.z + this.W / 2, y: (y - this.cam.y) * this.cam.z + this.H / 2 }; }
  hexAt(sx, sy) {
    const w = this.screenToWorld(sx, sy); const { q, r } = pixelToHex(w.x, w.y);
    const h = this.map?.byKey.get(key(q, r)); return h ? h.id : -1;
  }
  _clamp() {
    const b = this.bounds, c = this.cam;
    c.z = Math.min(this.maxZoom, Math.max(this.minZoom, c.z));
    const mx = this.W / 2 / c.z * 0.6, my = this.H / 2 / c.z * 0.6;
    c.x = Math.min(b.x1 - mx + 60, Math.max(b.x0 + mx - 60, c.x));
    if (b.x1 - b.x0 < (this.W / c.z) * 0.8) c.x = (b.x0 + b.x1) / 2;
    c.y = Math.min(b.y1 - my + 60, Math.max(b.y0 + my - 60, c.y));
    if (b.y1 - b.y0 < (this.H / c.z) * 0.8) c.y = (b.y0 + b.y1) / 2;
  }
  zoomAt(factor, sx = this.W / 2, sy = this.H / 2) {
    const before = this.screenToWorld(sx, sy);
    this.cam.z = Math.min(this.maxZoom, Math.max(this.minZoom, this.cam.z * factor));
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    this._clamp(); this.dirty = true; this.onCamera();
  }
  flyTo(x, y, z = this.cam.z, dur = 450, offsetY = 0) {
    const to = { x, y: y + offsetY / z, z: Math.min(this.maxZoom, Math.max(this.minZoom, z)) };
    if (!this.motion) { Object.assign(this.cam, to); this._clamp(); this.dirty = true; return; }
    this.tween = { from: { ...this.cam }, to, t0: now(), dur };
  }
  centerOnHex(id, z, offsetY = 0) { const p = this.pos[id]; this.flyTo(p.x, p.y, z ?? this.cam.z, 450, offsetY); }
  fitAll(fog = null) {
    let b = this.bounds;
    if (fog) {
      const ids = this.map.hexes.filter(h => fog[h.id] !== UNKNOWN).map(h => h.id);
      const xs = ids.map(i => this.pos[i].x), ys = ids.map(i => this.pos[i].y);
      b = { x0: Math.min(...xs) - TILE_W, x1: Math.max(...xs) + TILE_W, y0: Math.min(...ys) - TILE_H, y1: Math.max(...ys) + TILE_H };
    }
    const z = Math.min(this.W / (b.x1 - b.x0), (this.H - 200) / (b.y1 - b.y0));
    this.flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z);
  }

  select(id) { this.selected = id; this.selT0 = now(); this.dirty = true; }
  reveal(ids) { const t = now(); ids.forEach((id, i) => this.reveals.set(id, t + i * 45)); this.refreshFog(); }

  // ---------- entrada ----------
  _bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.tween = null; this.vel = null;
      if (this.pointers.size === 1) this.gesture = { sx: e.offsetX, sy: e.offsetY, t: now(), moved: false, hist: [] };
      else if (this.pointers.size === 2) { this.gesture.moved = true; this.pinch = this._pinchState(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') { const id = this.hexAt(e.offsetX, e.offsetY); if (id !== this.hover) { this.hover = id; this.dirty = true; } }
        return;
      }
      const p = this.pointers.get(e.pointerId); const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      p.x = e.offsetX; p.y = e.offsetY;
      if (this.pointers.size === 1) {
        const g = this.gesture;
        if (Math.hypot(e.offsetX - g.sx, e.offsetY - g.sy) > 7) g.moved = true;
        if (g.moved) {
          this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this._clamp(); this.dirty = true;
          g.hist.push({ dx, dy, t: now() }); if (g.hist.length > 5) g.hist.shift();
        }
      } else if (this.pointers.size === 2 && this.pinch) {
        const cur = this._pinchState();
        const f = cur.d / this.pinch.d;
        const before = this.screenToWorld(this.pinch.mx, this.pinch.my);
        this.cam.z = Math.min(this.maxZoom, Math.max(this.minZoom, this.cam.z * f));
        const after = this.screenToWorld(cur.mx, cur.my);
        this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
        this._clamp(); this.pinch = cur; this.dirty = true;
      }
    });
    const end = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (this.pointers.size === 0 && g) {
        if (!g.moved && now() - g.t < 600) {
          const id = this.hexAt(e.offsetX, e.offsetY);
          this.onSelect(id >= 0 ? id : -1);
        } else if (g.hist.length > 1 && this.motion) {
          const h = g.hist, dt = Math.max(16, h[h.length - 1].t - h[0].t);
          const vx = h.reduce((s, a) => s + a.dx, 0) / dt, vy = h.reduce((s, a) => s + a.dy, 0) / dt;
          if (now() - h[h.length - 1].t < 80 && Math.hypot(vx, vy) > 0.25) this.vel = { vx, vy, t: now() };
        }
        this.gesture = null; this.onCamera();
      }
      if (this.pointers.size === 1) { const [p] = this.pointers.values(); this.gesture = { sx: p.x, sy: p.y, t: 0, moved: true, hist: [] }; this.pinch = null; }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.hover !== -1) { this.hover = -1; this.dirty = true; } });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.tween = null; this.zoomAt(Math.exp(-d * 0.0016), e.offsetX, e.offsetY);
    }, { passive: false });
  }
  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  pan(dx, dy) { this.flyTo(this.cam.x + dx / this.cam.z, this.cam.y + dy / this.cam.z, this.cam.z, 200); }

  // ---------- desenho ----------
  _frame() {
    const t = now();
    if (this.tween) {
      const tw = this.tween, k = Math.min(1, (t - tw.t0) / tw.dur), e = ease(k);
      this.cam.x = tw.from.x + (tw.to.x - tw.from.x) * e; this.cam.y = tw.from.y + (tw.to.y - tw.from.y) * e;
      this.cam.z = tw.from.z + (tw.to.z - tw.from.z) * e; this._clamp();
      if (k >= 1) { this.tween = null; this.onCamera(); }
      this.dirty = true;
    }
    if (this.vel) {
      const dt = 16, f = Math.exp(-(t - this.vel.t) / 260);
      this.cam.x -= this.vel.vx * dt * f / this.cam.z; this.cam.y -= this.vel.vy * dt * f / this.cam.z; this._clamp();
      if (f < 0.05) this.vel = null;
      this.dirty = true;
    }
    const animating = this.reveals.size > 0 || (t - this.selT0 < 500) || this.tokenAnim.size > 0 || (this.overlay.path && this.motion);
    if (!this.dirty && !animating) return;
    this.dirty = false;
    this.draw(t);
  }

  draw(t = now()) {
    const { ctx, cam, dpr, map } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!map) return;
    const s = cam.z * dpr;
    ctx.setTransform(s, 0, 0, s, dpr * this.W / 2 - cam.x * s, dpr * this.H / 2 - cam.y * s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const vx0 = cam.x - this.W / 2 / cam.z - TILE_W, vx1 = cam.x + this.W / 2 / cam.z + TILE_W;
    const vy0 = cam.y - this.H / 2 / cam.z - TILE_H, vy1 = cam.y + this.H / 2 / cam.z + TILE_H;
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const grid = new Path2D(), dashed = new Path2D();
    const fogOn = this.fogOn;

    for (const id of this.order) {
      const p = this.pos[id];
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      const h = map.hexes[id];
      const st = fogOn ? this.fog[id] : EXPLORED;
      let alpha = 1, scale = 1;
      const r0 = this.reveals.get(id);
      if (r0 !== undefined) {
        const k = (t - r0) / 520;
        if (k >= 1) this.reveals.delete(id);
        else if (k < 0) { alpha = 0; } else { alpha = ease(Math.min(1, k * 1.6)); scale = 0.8 + 0.2 * easeBack(k); }
      }
      if (st === UNKNOWN) {
        if (this.edge[id]) this._tile('sketch', 'fog', p, 0, 0.9);
        else this._hexPath(grid, p.x, p.y);
        continue;
      }
      let atlas, feat;
      if (st === DISCOVERED) { atlas = 'sketch'; feat = h.feature; }
      else { atlas = h.feature === 'water' ? 'greenlands' : h.biome; feat = h.structure || h.poi || h.feature; }
      if (alpha < 1 && st === EXPLORED && r0 !== undefined) this._tile('sketch', h.feature, p, this.rot[id], 1); // o esboço "ganha cor"
      ctx.save();
      ctx.globalAlpha = alpha;
      if (scale !== 1) { ctx.translate(p.x, p.y); ctx.scale(scale, scale); ctx.translate(-p.x, -p.y); }
      this._tile(atlas, feat, p, feat === 'river' ? this.rot[id] : 0, 1);
      if (h.feature === 'water' && st === EXPLORED && h.depth > 1) { ctx.globalAlpha = alpha * Math.min(0.32, (h.depth - 1) * 0.11); ctx.fillStyle = '#1d3a4a'; ctx.fill(this._hexPath(new Path2D(), p.x, p.y, hw - 3)); }
      ctx.restore();

    }
    // grelha ténue sobre o pergaminho desconhecido
    ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(92,70,40,.16)'; ctx.stroke(grid);
    // contorno das fronteiras exploráveis
    if (fogOn) {
      ctx.save(); ctx.setLineDash([16, 12]); ctx.lineWidth = Math.max(3, 1.6 / cam.z); ctx.strokeStyle = 'rgba(156,106,32,.55)'; ctx.stroke(dashed); ctx.restore();
    }
    this._drawOverlays(t, vx0, vx1, vy0, vy1);
    // hover
    if (this.hover >= 0 && this.hover !== this.selected) {
      const p = this.pos[this.hover]; ctx.lineWidth = Math.max(4, 2 / cam.z); ctx.strokeStyle = 'rgba(255,244,214,.75)';
      ctx.stroke(this._hexPath(new Path2D(), p.x, p.y, hw - 5));
    }
    // seleção
    if (this.selected >= 0) {
      const p = this.pos[this.selected]; const k = Math.min(1, (t - this.selT0) / 450);
      const grow = this.motion ? (1 - ease(k)) * 22 : 0;
      const path = this._hexPath(new Path2D(), p.x, p.y, hw - 6 + grow);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(10, 5 / cam.z); ctx.strokeStyle = 'rgba(43,30,16,.85)'; ctx.stroke(path);
      ctx.lineWidth = Math.max(5, 2.6 / cam.z); ctx.strokeStyle = '#f2c14e'; ctx.stroke(path);
    }
    this._drawTokens(t);
    // coordenadas (opção de depuração)
    if (this.showCoords && cam.z > 0.35) {
      ctx.font = '600 22px Alegreya, serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(30,20,10,.75)';
      for (const id of this.order) { const p = this.pos[id]; if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue; const h = map.hexes[id]; ctx.fillText(h.q + ',' + h.r, p.x, p.y + hh - 22); }
    }
    // nomes das regiões, em afastamento
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cam.z < 0.3) {
      const fs = Math.round(13 + (0.3 - cam.z) * 24);
      ctx.font = `${fs}px "IM Fell English SC", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      map.regions.forEach((rg, i) => {
        if (fogOn && !rg.hexes.some(id => this.fog[id] !== UNKNOWN)) return;
        const c = this.regionCenters[i]; const sp = this.worldToScreen(c.x, c.y);
        const label = rg.name.toUpperCase().split('').join(' ');
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(240,229,203,.85)'; ctx.strokeText(label, sp.x, sp.y);
        ctx.fillStyle = '#4a3420'; ctx.fillText(label, sp.x, sp.y);
      });
    }
  }

  // ---------- camadas da Fase 2 ----------
  _drawOverlays(t, vx0, vx1, vy0, vy1) {
    const { ctx, map, cam } = this, o = this.overlay, hw = TILE_W / 2;
    const vis = id => { const p = this.pos[id]; return p.x >= vx0 && p.x <= vx1 && p.y >= vy0 && p.y <= vy1; };
    const known = id => !this.fogOn || this.fog[id] !== UNKNOWN;
    // fronteiras de regiões (traço de cartógrafo)
    const border = new Path2D();
    for (const id of this.order) {
      if (!vis(id) || !known(id)) continue;
      const h = map.hexes[id]; if (h.region < 0) continue;
      const p = this.pos[id], c = corners(p.x, p.y, HEX_SIZE - 1);
      map.nbrs(h).forEach(n => {
        if (n.region < 0 || n.region === h.region || n.id < id) return;
        // aresta partilhada: os dois cantos mais próximos do vizinho
        const pn = this.pos[n.id];
        const pts = c.map((q, i) => [Math.hypot(q[0] - pn.x, q[1] - pn.y), i]).sort((a, b) => a[0] - b[0]).slice(0, 2).map(x => c[x[1]]);
        border.moveTo(pts[0][0], pts[0][1]); border.lineTo(pts[1][0], pts[1][1]);
      });
    }
    ctx.save(); ctx.setLineDash([14, 10]); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(5, 2.4 / cam.z); ctx.strokeStyle = 'rgba(122,40,28,.55)'; ctx.stroke(border); ctx.restore();
    // território
    if (o.territory) {
      const tp = new Path2D();
      o.territory.forEach(id => { if (vis(id)) { const p = this.pos[id]; this._hexPath(tp, p.x, p.y, hw - 10); } });
      ctx.save(); ctx.lineWidth = Math.max(3, 1.4 / cam.z); ctx.strokeStyle = 'rgba(142,51,36,.35)'; ctx.setLineDash([4, 10]); ctx.stroke(tp); ctx.restore();
    }
    // estandartes nas estruturas do jogador
    for (const id of this.order) {
      const h = map.hexes[id]; if (!h.flag || !vis(id) || !known(id)) continue;
      const p = this.pos[id]; this._pennant(p.x + 52, p.y - 70, '#8e3324');
    }
    // alcance do explorador selecionado
    if (o.reach) {
      const rp = new Path2D();
      o.reach.forEach((c, id) => { if (vis(id)) { const p = this.pos[id]; this._hexPath(rp, p.x, p.y, hw - 6); } });
      ctx.save(); ctx.fillStyle = 'rgba(242,193,78,.20)'; ctx.fill(rp); ctx.lineWidth = Math.max(3, 1.3 / cam.z); ctx.strokeStyle = 'rgba(156,106,32,.7)'; ctx.stroke(rp); ctx.restore();
      if (cam.z > 0.22) o.reach.forEach((c, id) => { if (!vis(id)) return; const p = this.pos[id]; this._badge(p.x, p.y + 62, String(c), this.fog[id] === DISCOVERED ? '#9c6a20' : '#2f2216'); });
    }
    // caminho
    if (o.path && o.path.length) {
      const pts = [o.from, ...o.path].map(id => this.pos[id]);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.lineWidth = Math.max(14, 6 / cam.z); ctx.strokeStyle = 'rgba(246,237,216,.85)'; ctx.stroke();
      ctx.setLineDash([22, 16]); ctx.lineDashOffset = this.motion ? -(t / 30) % 38 : 0;
      ctx.lineWidth = Math.max(7, 3 / cam.z); ctx.strokeStyle = o.risky ? '#a8321f' : '#2f2216'; ctx.stroke();
      ctx.restore();
      const end = pts.at(-1);
      ctx.save(); ctx.lineWidth = Math.max(8, 3.5 / cam.z); ctx.strokeStyle = o.risky ? '#a8321f' : '#2f2216'; ctx.stroke(this._hexPath(new Path2D(), end.x, end.y, hw - 14)); ctx.restore();
    }
    // hexágonos trabalhados pela aldeia
    if (o.worked) o.worked.forEach(w => { if (!vis(w.id)) return; const p = this.pos[w.id]; this._badge(p.x, p.y - 58, '+' + w.amt + ' ' + RES_SHORT[w.res], RES_COLOR[w.res] || '#2f2216', true); });
  }

  _badge(x, y, text, color, wide = false) {
    const ctx = this.ctx, fs = 30; ctx.save();
    ctx.font = `700 ${fs}px Alegreya, Georgia, serif`; const w = Math.max(44, ctx.measureText(text).width + 22);
    ctx.fillStyle = 'rgba(246,237,216,.95)'; ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 22, w, 44, 22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 2); ctx.restore();
  }
  _pennant(x, y, color) {
    const ctx = this.ctx; ctx.save();
    ctx.strokeStyle = '#2f2216'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + 46); ctx.lineTo(x, y - 6); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 34, y + 6); ctx.lineTo(x, y + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // peões dos exploradores (desenhados em código, ao estilo de peças de madeira)
  animateToken(id, path) {
    return new Promise(res => {
      if (!this.motion || !path.length) { res(); return; }
      this.tokenAnim.set(id, { path, t0: performance.now(), step: 170, done: res });
    });
  }
  tokenPos(tk, t) {
    const a = this.tokenAnim.get(tk.id);
    if (!a) return this.pos[tk.hex];
    const k = (t - a.t0) / a.step, i = Math.floor(k);
    const pts = [a.path[0] === tk.hex ? null : null, ...a.path];
    if (k >= a.path.length - 1) { this.tokenAnim.delete(tk.id); a.done(); return this.pos[tk.hex]; }
    const p0 = this.pos[a.path[Math.max(0, i)]], p1 = this.pos[a.path[Math.min(a.path.length - 1, i + 1)]], f = ease(k - i);
    return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f - Math.sin(f * Math.PI) * 26 };
  }
  _drawTokens(t) {
    const ctx = this.ctx, count = {};
    const list = this.tokens.filter(tk => !tk.away).sort((a, b) => (a.selected ? 1 : 0) - (b.selected ? 1 : 0));
    for (const tk of list) {
      const n = count[tk.hex] = (count[tk.hex] || 0) + 1;
      const base = this.tokenPos(tk, t), off = (n - 1) * 46 - (this.tokens.filter(o => o.hex === tk.hex && !o.away).length - 1) * 23;
      const x = base.x + off, y = base.y + 6, s = 1.15;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      if (tk.selected) { ctx.beginPath(); ctx.ellipse(0, 34, 46, 18, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(242,193,78,.55)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#f2c14e'; ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(0, 34, 30, 11, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(47,34,22,.35)'; ctx.fill();
      // corpo
      ctx.beginPath(); ctx.moveTo(-24, 30); ctx.quadraticCurveTo(-22, -6, -9, -12); ctx.lineTo(9, -12); ctx.quadraticCurveTo(22, -6, 24, 30); ctx.closePath();
      ctx.fillStyle = tk.color; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#2f2216'; ctx.stroke();
      // cabeça
      ctx.beginPath(); ctx.arc(0, -26, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // brilho de madeira
      ctx.beginPath(); ctx.moveTo(-14, 22); ctx.quadraticCurveTo(-13, 0, -6, -4); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      if (tk.done) { ctx.beginPath(); ctx.arc(20, -36, 11, 0, Math.PI * 2); ctx.fillStyle = '#ecdfc0'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2f2216'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(15, -36); ctx.lineTo(19, -31); ctx.lineTo(26, -41); ctx.stroke(); }
      if (tk.warn) { ctx.beginPath(); ctx.arc(-20, -38, 12, 0, Math.PI * 2); ctx.fillStyle = tk.warn === 'bad' ? '#a8321f' : '#d99a1e'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2f2216'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 18px Alegreya, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', -20, -37); }
      ctx.restore();
    }
  }
  tokenAt(sx, sy) { // devolve o id do explorador tocado (perto do centro do hexágono)
    const id = this.hexAt(sx, sy); if (id < 0) return null;
    const here = this.tokens.filter(tk => tk.hex === id && !tk.away);
    return here.length ? here : null;
  }

  _tile(atlas, feat, p, rot, alpha) {
    const [img, sx, sy, sw, sh] = tileSource(atlas, feat, this.cam.z * this.dpr);
    const ctx = this.ctx;
    if (alpha !== 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    if (rot) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot); ctx.drawImage(img, sx, sy, sw, sh, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H); ctx.restore(); }
    else ctx.drawImage(img, sx, sy, sw, sh, p.x - TILE_W / 2, p.y - TILE_H / 2, TILE_W, TILE_H);
    if (alpha !== 1) ctx.restore();
  }

  _hexPath(path, cx, cy, size = HEX_SIZE - 2) {
    const c = corners(cx, cy, size);
    path.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 6; i++) path.lineTo(c[i][0], c[i][1]); path.closePath();
    return path;
  }
}
