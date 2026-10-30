// Gerador aleatório determinístico por seed (reaproveitado do Outbreak: Patient Zero v2).

export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (...parts) => mulberry32(hashStr(parts.join('|')));

export function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
export const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

export function weightedPick(entries, r) { // entries: [[item, weight], ...]
  const total = entries.reduce((s, e) => s + e[1], 0);
  let x = r() * total;
  for (const [item, w] of entries) { if ((x -= w) < 0) return item; }
  return entries[entries.length - 1]?.[0];
}

export function randomSeed() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
export const cleanSeed = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// Ruído de valor 2D suave, com seed — base da geração de terreno.
export function makeNoise(r) {
  const P = new Uint8Array(512), V = new Float32Array(256);
  const perm = shuffle([...Array(256).keys()], r);
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) V[i] = r();
  const fade = t => t * t * (3 - 2 * t);
  const at = (x, y) => V[P[(P[x & 255] + y) & 255]];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  noise.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 1, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += noise(x * f + o * 17.3, y * f - o * 9.1) * amp; n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };
  return noise;
}
