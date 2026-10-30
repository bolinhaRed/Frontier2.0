// Coordenadas axiais (q, r) para hexágonos de topo plano (flat-top),
// a orientação dos tiles "foundation" de C. Martins (238 × 207 px).

export const SQRT3 = Math.sqrt(3);
export const TILE_W = 238, TILE_H = 207;
export const HEX_SIZE = TILE_W / 2; // raio (centro → canto) = 119

// Índices de direção (ecrã com y para baixo): 0 SE, 1 NE, 2 N, 3 NW, 4 SW, 5 S
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const key = (q, r) => q + ',' + r;
export const neighbor = (q, r, d) => [q + DIRS[d][0], r + DIRS[d][1]];
export const neighbors = (q, r) => DIRS.map(([dq, dr]) => [q + dq, r + dr]);

export function distance(aq, ar, bq, br) {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexToPixel(q, r, size = HEX_SIZE) {
  return { x: size * 1.5 * q, y: size * SQRT3 * (r + q / 2) };
}

export function pixelToHex(x, y, size = HEX_SIZE) {
  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + SQRT3 / 3 * y) / size;
  return hexRound(q, r);
}

export function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

// Layout retangular "odd-q" ↔ axial
export const offsetToAxial = (col, row) => ({ q: col, r: row - (col - (col & 1)) / 2 });
export const axialToOffset = (q, r) => ({ col: q, row: r + (q - (q & 1)) / 2 });

export function ring(q, r, radius) {
  if (radius === 0) return [[q, r]];
  const out = [];
  let cq = q + DIRS[4][0] * radius, cr = r + DIRS[4][1] * radius;
  for (let d = 0; d < 6; d++) for (let i = 0; i < radius; i++) { out.push([cq, cr]); cq += DIRS[d][0]; cr += DIRS[d][1]; }
  return out;
}

export function corners(cx, cy, size = HEX_SIZE) {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]); }
  return pts;
}
