// Carregamento dos atlas de tiles e níveis de detalhe (mipmaps) para zoom afastado nítido e rápido.
import { BIOMES, VIGNETTES } from './data.js';

const BASE = './assets/atlas/';
export const ATLAS_NAMES = ['sketch', ...Object.keys(BIOMES)];
let meta = null;
const atlases = {};   // nome → [nível0 (img), nível1 (canvas ½), nível2 (¼), nível3 (⅛)]
const index = {};     // feature → posição no atlas

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('Falhou: ' + src)); i.src = src; });
}

export async function loadAssets(onProgress = () => {}) {
  meta = await (await fetch(BASE + 'atlas.json')).json();
  meta.order.forEach((n, i) => { index[n] = i; });
  let done = 0;
  await Promise.all(ATLAS_NAMES.map(async n => {
    const img = await loadImage(BASE + n + '.webp');
    atlases[n] = [img];
    onProgress(++done / ATLAS_NAMES.length);
  }));
  // pré-carrega as ilustrações em segundo plano (para o painel)
  Object.keys(meta.vignettes).forEach(pk => { const i = new Image(); i.src = vignetteUrl(pk); });
  return meta;
}

function mip(name, level) {
  const levels = atlases[name];
  if (levels[level]) return levels[level];
  const prev = mip(name, level - 1);
  const c = document.createElement('canvas');
  c.width = Math.ceil(prev.width / 2); c.height = Math.ceil(prev.height / 2);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(prev, 0, 0, c.width, c.height);
  levels[level] = c;
  return c;
}

// Devolve [imagem, sx, sy, sw, sh] do tile no nível adequado à escala de desenho.
export function tileSource(atlasName, feature, scale) {
  const level = scale > 0.55 ? 0 : scale > 0.28 ? 1 : scale > 0.14 ? 2 : 3;
  const img = mip(atlasName, level);
  const f = 1 / (1 << level);
  const t = meta.tile, i = index[feature] ?? index.plain;
  const col = i % t.cols, row = Math.floor(i / t.cols);
  return [img, (col * t.cw + t.pad) * f, (row * t.ch + t.pad) * f, t.w * f, t.h * f];
}

export const vignetteUrl = pk => BASE + 'vignette-' + pk + '.webp';

// Ilustração grande para o painel: { url, x, y, w, h, sheetW, sheetH } ou null.
export function vignetteFor(biome, key) {
  let pk = BIOMES[biome]?.pack;
  if ((key === 'mountains' || key === 'vulcano' || key === 'crystals') && biome !== 'icelands') pk = 'mountain';
  if (biome === 'sandlands' && key === 'mountains') pk = 'desert';
  if (!pk) return null;
  const name = VIGNETTES[pk]?.[key];
  if (!name) return null;
  const v = meta.vignettes[pk], vv = meta.vignette;
  const i = v.names.indexOf(name);
  if (i < 0) return null;
  const cw = vv.w + vv.pad * 2, ch = vv.h + vv.pad * 2;
  return { url: vignetteUrl(pk), x: (i % v.cols) * cw + vv.pad, y: Math.floor(i / v.cols) * ch + vv.pad, w: vv.w, h: vv.h, sheetW: v.w, sheetH: v.h };
}

export function tileCSS(atlasName, feature, displayW) {
  const t = meta.tile, i = index[feature] ?? index.plain;
  const col = i % t.cols, row = Math.floor(i / t.cols);
  const s = displayW / t.w;
  const sheetW = t.cols * t.cw, sheetH = Math.ceil(meta.order.length / t.cols) * t.ch;
  return `background:url(${BASE + atlasName}.webp) ${-(col * t.cw + t.pad) * s}px ${-(row * t.ch + t.pad) * s}px / ${sheetW * s}px ${sheetH * s}px no-repeat;width:${displayW}px;height:${t.h * s}px`;
}
