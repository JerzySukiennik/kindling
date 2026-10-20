import { makeSimplex, fbm, smoothstep, mulberry32, clamp } from './noise.js';

export const ZONE = { x0: -13, x1: 13, z0: -0.5, z1: 11.2, h: 0.32 };
export const FIELD = { x0: -21.4, x1: 21.4, z0: -60, z1: 0 };
export const FENCE_X = 22.2;
export const YARD = { x0: 23.6, x1: 41, z0: -58, z1: -3 };
export const BARRIER_Z = -61.2;
export const BARRIER_STOP_Z = -1.7;
export const BARRIER_HALF_W = 22.0;
export const SPAWN_Z = -67;
export const CORN = { x0: -70, x1: 70, z0: -112, z1: -64.5 };
export const PIT = { x0: -18, x1: 18, z0: 13.2, z1: 20.5, depth: 1.6 };
export const TERRAIN = { x0: -110, x1: 110, z0: -170, z1: 70 };
export const SLOT_H = [0.02, 0.27];
export const LOBBY = { x0: -26.3, x1: 26.3, z0: 29.4, z1: 62.6, y: 2.6, spawn: { x: 0, z: 33.5 } };

export const CRYPT = { x: -33.5, z: -31, rot: Math.PI / 2 };
export const STATUE = { x: 26.5, z: -6.5, rot: -0.9 };
export const GATE = { x: FENCE_X, z: -34, rot: Math.PI / 2 };

const n1 = makeSimplex(11);
const n2 = makeSimplex(23);
const n3 = makeSimplex(37);

function makeGraves() {
  const rand = mulberry32(1337);
  const graves = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 13; row++) {
      const z = YARD.z1 - 1.2 - row * 4.15;
      for (let col = 0; col < 7; col++) {
        const x = side * (YARD.x0 + 1.0 + col * 2.45);
        if (rand() < 0.14) continue;
        if (side < 0 && Math.abs(z - CRYPT.z) < 6.5 && Math.abs(x - CRYPT.x) < 6) continue;
        if (side > 0 && Math.abs(z - GATE.z) < 3.4 && col < 2) continue;
        if (side > 0 && Math.abs(z - STATUE.z) < 3.2 && Math.abs(x - STATUE.x) < 3.2) continue;
        const r = rand();
        const type = r < 0.3 ? 'round' : r < 0.48 ? 'gothic' : r < 0.64 ? 'cross' : r < 0.74 ? 'obelisk' : r < 0.88 ? 'slab' : 'broken';
        const fallen = rand() < 0.08;
        graves.push({
          x: x + (rand() - 0.5) * 0.5, z: z + (rand() - 0.5) * 0.7, type,
          rot: (rand() - 0.5) * 0.2,
          tilt: fallen ? 0.35 + rand() * 0.3 : (rand() - 0.5) * 0.16,
          roll: (rand() - 0.5) * 0.12,
          scale: 0.85 + rand() * 0.35,
          seed: Math.floor(rand() * 1e6),
          mound: rand() < 0.8,
        });
      }
    }
  }
  return graves;
}

export const GRAVES = makeGraves();

const CELL = 4;
const moundGrid = new Map();
for (const g of GRAVES) {
  if (!g.mound) continue;
  const cx = g.x + Math.sin(g.rot) * 1.15;
  const cz = g.z + Math.cos(g.rot) * 1.15;
  const m = { cx, cz, rot: g.rot, s: g.scale };
  for (let gx = Math.floor((cx - 2) / CELL); gx <= Math.floor((cx + 2) / CELL); gx++) {
    for (let gz = Math.floor((cz - 2) / CELL); gz <= Math.floor((cz + 2) / CELL); gz++) {
      const k = gx + ',' + gz;
      if (!moundGrid.has(k)) moundGrid.set(k, []);
      moundGrid.get(k).push(m);
    }
  }
}

function moundHeight(x, z) {
  const list = moundGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!list) return 0;
  let h = 0;
  for (const m of list) {
    const dx = x - m.cx;
    const dz = z - m.cz;
    const c = Math.cos(m.rot), s = Math.sin(m.rot);
    const lx = (dx * c - dz * s) / (0.62 * m.s);
    const lz = (dx * s + dz * c) / (1.05 * m.s);
    const r2 = lx * lx + lz * lz;
    if (r2 < 1) {
      const f = 1 - r2;
      h = Math.max(h, 0.17 * m.s * f * f * (1 + 0.15 * n3(x * 3, z * 3)));
    }
  }
  return h;
}

function rectMask(x, z, r, edge) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, edge, d);
}

export function pitMask(x, z) {
  const cx = (PIT.x0 + PIT.x1) / 2;
  const cz = (PIT.z0 + PIT.z1) / 2;
  const hx = (PIT.x1 - PIT.x0) / 2;
  const hz = (PIT.z1 - PIT.z0) / 2;
  const qx = Math.max(Math.abs(x - cx) - (hx - hz), 0);
  const qz = Math.abs(z - cz);
  const d = Math.hypot(qx, qz) / hz;
  return 1 - smoothstep(0.55, 1.0, d);
}

export function fieldMask(x, z) {
  return rectMask(x, z, { x0: FIELD.x0 + 0.6, x1: FIELD.x1 - 0.6, z0: FIELD.z0 - 3, z1: FIELD.z1 }, 1.5);
}

export function groundHeight(x, z) {
  let h = 0.35 * fbm(n1, x * 0.035, z * 0.035, 4) + 0.08 * n2(x * 0.4, z * 0.4);
  const ax = Math.abs(x);
  h += smoothstep(43, 85, ax) * (8 + 4 * fbm(n2, x * 0.02, z * 0.02, 3));
  h += smoothstep(27, 62, z) * (6 + 2.5 * fbm(n1, x * 0.03 + 9, z * 0.03, 3));
  h += smoothstep(-118, -165, z) * (14 + 6 * fbm(n2, x * 0.015, z * 0.015 + 4, 3));
  const field = fieldMask(x, z);
  h = h * (1 - field * 0.55);
  const zone = rectMask(x, z, ZONE, 3.5);
  h = h * (1 - zone) + (ZONE.h + 0.04 * n2(x * 0.6, z * 0.6)) * zone;
  const path = (1 - smoothstep(0.9, 1.7, ax)) * smoothstep(-62, -58, z) * (1 - smoothstep(-2, 1, z));
  h -= 0.06 * path;
  const slot = 1 - smoothstep(0.9, 3.2, Math.abs(z - BARRIER_Z));
  h = h * (1 - slot) + SLOT_H[0] * slot;
  const slot2 = (1 - smoothstep(0.7, 2.2, Math.abs(z - BARRIER_STOP_Z))) * (1 - smoothstep(22, 25, ax));
  h = h * (1 - slot2) + SLOT_H[1] * slot2;
  const lob = rectMask(x, z, { x0: LOBBY.x0 - 1.5, x1: LOBBY.x1 + 1.5, z0: LOBBY.z0 - 1.2, z1: LOBBY.z1 + 1.2 }, 5.5);
  if (lob > 0) h = h * (1 - lob) + (LOBBY.y + 0.05 * n2(x * 0.5, z * 0.5) + moundHeight(x, z) * 0) * lob;
  if (z > 4 && z < 30) {
    const p = pitMask(x, z);
    h -= PIT.depth * p * (0.92 + 0.08 * n1(x * 0.5, z * 0.5));
  }
  h += moundHeight(x, z);
  return h;
}

export function groundNormal(x, z, out) {
  const e = 0.15;
  const hx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const hz = groundHeight(x, z + e) - groundHeight(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  out.set(-hx / l, (2 * e) / l, -hz / l);
  return out;
}

export function splatAt(x, z) {
  const ax = Math.abs(x);
  const path = (1 - smoothstep(0.7, 1.9, ax + 0.4 * n2(x * 0.7, z * 0.7))) * smoothstep(-62, -58, z) * (1 - smoothstep(-1, 2, z));
  const zone = rectMask(x, z, ZONE, 2.5 + 1.5 * n1(x * 0.3, z * 0.3));
  const field = fieldMask(x, z);
  const scraped = field * smoothstep(0.1, 0.6, 0.5 + 0.6 * n2(x * 0.08, z * 0.03)) * 0.55;
  const trampled = clamp(Math.max(path, zone * 0.75, scraped, (1 - smoothstep(0.6, 1.3, Math.abs(z - BARRIER_Z))) * 0.9), 0, 1);
  let mud = clamp(0.5 + 0.9 * fbm(n3, x * 0.06, z * 0.06, 3), 0, 1);
  mud = smoothstep(0.55, 0.85, mud);
  const p = pitMask(x, z);
  const burnt = clamp(smoothstep(0.05, 0.6, p) + (1 - smoothstep(0, 3, Math.hypot(Math.max(Math.abs(x) - 17, 0), z - 17))) * 0.4, 0, 1);
  const corn = smoothstep(-63, -66, z) * (1 - smoothstep(66, 72, ax));
  return { trampled, mud, burnt, corn };
}

export const LAMPS = [
  { x: -14.4, z: -0.9, rot: Math.PI / 2 },
  { x: 14.4, z: -0.9, rot: -Math.PI / 2 },
  { x: -14.6, z: 10.9, rot: Math.PI / 2 },
  { x: 14.6, z: 10.9, rot: -Math.PI / 2 },
];

export const FRONT_CANDLES = (() => {
  const out = [];
  const rand = mulberry32(5);
  for (let x = -12; x <= 12.01; x += 3) out.push({ x: x + (rand() - 0.5) * 0.5, z: 0.15 + (rand() - 0.5) * 0.25, seed: rand() });
  return out;
})();

export const TREES = (() => {
  const rand = mulberry32(902);
  const out = [];
  const add = (x, z, s) => out.push({ x, z, s, seed: Math.floor(rand() * 1e6) });
  for (let i = 0; i < 8; i++) add(-44 - rand() * 16, 2 - i * 8.5 - rand() * 3, 1.0 + rand() * 0.6);
  for (let i = 0; i < 8; i++) add(44 + rand() * 16, 0 - i * 8.2 - rand() * 3, 1.0 + rand() * 0.6);
  for (let i = 0; i < 8; i++) add(-70 + i * 20 + rand() * 8, -116 - rand() * 14, 1.4 + rand() * 0.7);
  add(-31.2, -15.4, 1.15);
  add(37.6, -40.5, 1.25);
  add(32.4, -22.8, 0.95);
  add(-38.4, -49.5, 1.2);
  add(-23.5, 14, 1.25);
  add(24.5, 16.5, 1.35);
  add(-34, 26, 1.1);
  add(36, 29, 1.25);
  return out;
})();

export const ZONE_ROCKS = [
  { x: -15.2, z: 3.2, s: 1.1, r: 0.2, k: 0 },
  { x: 15.6, z: 5.2, s: 1.0, r: 1.4, k: 3 },
  { x: -15.8, z: 8.0, s: 0.9, r: 2.5, k: 5 },
  { x: 15.4, z: 1.6, s: 0.8, r: 0.9, k: 7 },
];
