import * as THREE from 'three';
import { groundHeight, groundNormal, GRAVES, ZONE, PIT, ZONE_ROCKS, BARRIER_Z, pitMask, splatAt, fieldMask, FENCE_X } from './layout.js';
import { mulberry32, smoothstep } from './noise.js';
import { U } from './globals.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();


function nearGrave(x, z, r) {
  for (const g of GRAVES) {
    const dx = x - g.x;
    const dz = z - g.z;
    if (dx * dx + dz * dz < (r + 0.9) * (r + 0.9)) return true;
  }
  return false;
}

function inZone(x, z, pad = 0) {
  return x > ZONE.x0 - pad && x < ZONE.x1 + pad && z > ZONE.z0 - pad && z < ZONE.z1 + pad;
}

function groundMatrix(x, z, scale, yaw, alignAmt, sink, out, extraTilt = 0, seed = 0) {
  const y = groundHeight(x, z);
  groundNormal(x, z, _n);
  _q2.setFromUnitVectors(_up, _n);
  _q.identity().slerp(_q2, alignAmt);
  _e.set(extraTilt * Math.sin(seed), yaw, extraTilt * Math.cos(seed * 1.7));
  _q2.setFromEuler(_e);
  _q.multiply(_q2);
  _p.set(x, y - sink, z);
  _s.setScalar(scale);
  return out.compose(_p, _q, _s);
}

class Merger {
  constructor(parts, material, cell, name, cast) {
    this.parts = parts;
    this.material = material;
    this.cell = cell;
    this.name = name;
    this.cast = cast;
    this.cells = new Map();
    this.sizes = parts.map((p) => p.geometry.boundingBox.getSize(new THREE.Vector3()));
    const keep = new Set(['position', 'normal', 'uv']);
    this.geos = parts.map((p) => {
      const g = p.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
      return g.index ? g : g;
    });
  }

  add(gi, matrix) {
    const e = matrix.elements;
    const key = Math.floor(e[12] / this.cell) + ',' + Math.floor(e[14] / this.cell);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(this.geos[gi].clone().applyMatrix4(matrix));
  }

  build(scene) {
    const meshes = [];
    for (const list of this.cells.values()) {
      const g = mergeGeometries(list);
      for (const l of list) l.dispose();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.material);
      m.name = this.name;
      m.castShadow = this.cast;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      scene.add(m);
      meshes.push(m);
    }
    return meshes;
  }
}

export function createScatter(scene, assets) {
  const rand = mulberry32(4242);
  const obstacles = [];
  const colliders = [];
  const out = { obstacles, colliders, grass: [], density: 1 };

  for (const set of [assets.models.rocks_grey, assets.models.rocks_tan]) {
    set[0].material.color.setRGB(0.78, 0.8, 0.86);
    set[0].material.envMapIntensity = 0.6;
  }
  const grey = new Merger(assets.models.rocks_grey, assets.models.rocks_grey[0].material, 48, 'rocks', true);
  const tan = new Merger(assets.models.rocks_tan, assets.models.rocks_tan[0].material, 48, 'rocks', true);
  const placeRock = (set, x, z, size, opts = {}) => {
    const gi = opts.k !== undefined ? opts.k % set.parts.length : Math.floor(rand() * set.parts.length);
    const sz = set.sizes[gi];
    const base = Math.max(sz.x, sz.z);
    const sc = size / base;
    const yaw = opts.yaw ?? rand() * Math.PI * 2;
    groundMatrix(x, z, sc, yaw, 0.6, sz.y * sc * (opts.sink ?? 0.22), _m, 0.15, rand() * 10);
    set.add(gi, _m);
    const r = size * 0.42;
    if (opts.obstacle) obstacles.push({ x, z, r });
    colliders.push({ x, y: groundHeight(x, z), z, hx: sz.x * sc * 0.42, hy: sz.y * sc * 0.6, hz: sz.z * sc * 0.42, yaw, kind: 'rock' });
  };

  for (const zr of ZONE_ROCKS) placeRock(grey, zr.x, zr.z, zr.s * 1.6, { k: zr.k, yaw: zr.r, obstacle: true, sink: 0.18 });

  for (let x = PIT.x0 - 1.5; x <= PIT.x1 + 1.5; x += 1.15 + rand() * 0.5) {
    const front = rand() < 0.75;
    if (front) placeRock(grey, x + (rand() - 0.5) * 0.4, PIT.z0 - 0.35 + (rand() - 0.5) * 0.5, 0.45 + rand() * 0.35, { sink: 0.35 });
    placeRock(rand() < 0.5 ? grey : tan, x + (rand() - 0.5) * 0.6, PIT.z1 + 0.3 + rand() * 0.8, 0.7 + rand() * 0.9, { sink: 0.3 });
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      placeRock(tan, side * (PIT.x1 + 1.2 + rand() * 1.5), PIT.z0 + 1 + k * 1.9, 0.9 + rand() * 0.8, { sink: 0.3 });
    }
  }

  let tries = 0;
  let placed = 0;
  while (placed < 120 && tries < 4000) {
    tries++;
    const x = (rand() - 0.5) * 120;
    const z = -95 + rand() * 120;
    if (fieldMask(x, z) > 0.01 || Math.abs(Math.abs(x) - FENCE_X) < 0.8) continue;
    if (nearGrave(x, z, 0.6)) continue;
    if (inZone(x, z, 2.5) || pitMask(x, z) > 0.05) continue;
    if (Math.abs(z - BARRIER_Z) < 3 && Math.abs(x) < 28) continue;
    if (z < -64 && Math.abs(x) < 66 && rand() < 0.85) continue;
    const big = Math.abs(x) > 42 || z < -64 || z > 22;
    const size = big ? 0.9 + rand() * 2.2 : 0.35 + rand() * 0.6;
    placeRock(rand() < 0.62 ? grey : tan, x, z, size, { sink: 0.25 });
    placed++;
  }
  out.rocks = [...grey.build(scene), ...tan.build(scene)];

  const pebMat = assets.models.pebbles[0].material;
  pebMat.color.setRGB(0.7, 0.68, 0.66);
  const peb = new Merger(assets.models.pebbles, pebMat, 32, 'pebbles', false);
  const pebX = new Merger(assets.models.pebbles, pebMat, 32, 'pebbles', false);
  let pc = 0;
  tries = 0;
  while (pc < 2800 && tries < 30000) {
    tries++;
    const x = (rand() - 0.5) * 60;
    const z = -66 + rand() * 90;
    const s = splatAt(x, z);
    const pm = pitMask(x, z);
    const dens = 0.16 + s.trampled * 0.7 + s.mud * 0.2 + pm * 0.5 - (z > 22 ? 0.5 : 0);
    if (rand() > dens) continue;
    const gi = Math.floor(rand() * peb.parts.length);
    const sz = peb.sizes[gi];
    const sc = (rand() < 0.1 ? 2.6 + rand() * 2.0 : 1.0 + rand() * 1.4);
    groundMatrix(x, z, sc, rand() * Math.PI * 2, 0.9, sz.y * sc * 0.3, _m, 0.4, rand() * 10);
    (pc % 5 < 2 ? pebX : peb).add(gi, _m);
    pc++;
  }
  const pebCore = peb.build(scene);
  const pebExtra = pebX.build(scene);
  out.pebbles = pebCore;

  const brMat = assets.models.branches[0].material;
  brMat.color.setRGB(0.62, 0.6, 0.58);
  const br = new Merger(assets.models.branches, brMat, 48, 'branches', false);
  let bc = 0;
  tries = 0;
  while (bc < 260 && tries < 8000) {
    tries++;
    const x = (rand() - 0.5) * 80;
    const z = -70 + rand() * 96;
    if (pitMask(x, z) > 0.3) continue;
    if (z > 22 && rand() < 0.7) continue;
    if (fieldMask(x, z) > 0.01) continue;
    if (nearGrave(x, z, 0.2)) continue;
    const gi = Math.floor(rand() * br.parts.length);
    const sz = br.sizes[gi];
    const sc = 0.8 + rand() * 1.1;
    groundMatrix(x, z, sc, rand() * Math.PI * 2, 0.95, sz.y * sc * 0.25, _m, 0.12, rand() * 10);
    br.add(gi, _m);
    bc++;
  }
  br.build(scene);

  const logs = [
    { m: 'log_big', x: -25.5, z: -14, yaw: 0.4, s: 1.0 },
    { m: 'log_big', x: 27, z: -47, yaw: -1.1, s: 1.15 },
    { m: 'log_thin', x: 23.6, z: -21, yaw: 1.4, s: 1.0 },
    { m: 'log_thin', x: -23.5, z: -40, yaw: -0.3, s: 1.1 },
    { m: 'log_big', x: -16.8, z: 22.6, yaw: 0.05, s: 1.1 },
    { m: 'log_thin', x: 13, z: 22.8, yaw: -0.1, s: 1.2 },
    { m: 'stump', x: -28.5, z: -7, yaw: 0.2, s: 0.9 },
    { m: 'stump', x: 30, z: -30, yaw: 1.2, s: 1.1 },
    { m: 'stump', x: 24.5, z: 7.5, yaw: 2.2, s: 0.75 },
    { m: 'stump', x: -21.5, z: 12.5, yaw: 0.8, s: 0.8 },
  ];
  for (const l of logs) {
    const part = assets.models[l.m][0];
    const mesh = new THREE.Mesh(part.geometry, part.material);
    part.material.color.setRGB(0.7, 0.68, 0.66);
    groundMatrix(l.x, l.z, l.s, l.yaw, 0.7, 0.12, mesh.matrix, 0, 0);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  out.grass = createGrass(scene, rand);
  out.setDensity = (d) => {
    out.density = d;
    for (const g of out.grass) g.count = Math.floor(g.userData.total * d);
    for (const m of pebExtra) m.visible = d > 0.6;
  };
  return out;
}

function tuftGeometry() {
  const rand = mulberry32(99);
  const pos = [];
  const col = [];
  const hgt = [];
  const idx = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const ang = rand() * Math.PI * 2;
    const r0 = rand() * 0.09;
    const bx = Math.cos(ang) * r0;
    const bz = Math.sin(ang) * r0;
    const lean = 0.15 + rand() * 0.55;
    const la = ang + (rand() - 0.5) * 1.2;
    const h = 0.28 + rand() * 0.42;
    const w = 0.011 + rand() * 0.012;
    const face = rand() * Math.PI;
    const fx = Math.cos(face) * w;
    const fz = Math.sin(face) * w;
    const tone = rand();
    const c0 = new THREE.Color().setRGB(0.12 + tone * 0.04, 0.1 + tone * 0.03, 0.06);
    const c1 = new THREE.Color().setRGB(0.34 + tone * 0.12, 0.29 + tone * 0.08, 0.18 + tone * 0.04);
    if (rand() < 0.25) c1.setRGB(0.25, 0.24, 0.19);
    const base = pos.length / 3;
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const bend = lean * t * t * h;
      const cx = bx + Math.cos(la) * bend;
      const cz = bz + Math.sin(la) * bend;
      const y = h * t * (1 - lean * 0.25 * t);
      const ww = 1 - t * 0.92;
      pos.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww);
      const c = c0.clone().lerp(c1, Math.min(1, t * 1.3));
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      hgt.push(t, t);
      if (s < segs) {
        const a = base + s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) { nrm[i + 1] = 1; }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function windMaterialPatch(mat, key, opts = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWind = U.wind;
    sh.uniforms.uPushers = U.pushers;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aH;
        uniform float uTime;
        uniform vec2 uWind;
        uniform vec4 uPushers[16];
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float hh = aH * aH;
        float ph = dot(ip.xz, vec2(0.37, 0.23));
        float gust = 0.6 + 0.4 * sin(uTime * 0.7 + ip.x * 0.05 + ip.z * 0.03);
        vec2 sway = uWind * (sin(uTime * ${opts.speed || '1.9'} + ph) * 0.6 + 0.5) * gust * ${opts.amp || '0.12'};
        sway += vec2(sin(uTime * 3.7 + ph * 3.0), cos(uTime * 3.1 + ph * 2.0)) * ${opts.flutter || '0.015'};
        vec2 push = vec2(0.0);
        for (int i = 0; i < 16; i++) {
          vec4 pp = uPushers[i];
          vec2 d = ip.xz - pp.xz;
          float dist = length(d);
          float r = pp.w;
          if (r > 0.0 && dist < r) push += normalize(d + 1e-4) * (1.0 - dist / r) * ${opts.pushAmt || '0.5'};
        }
        transformed.xz += (sway + push) * hh * ${opts.height || '1.0'};
        transformed.y -= length(push) * hh * 0.3 * ${opts.height || '1.0'};
      `);
  };
  mat.customProgramCacheKey = () => key;
}

function createGrass(scene, rand) {
  const geo = tuftGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  windMaterialPatch(mat, 'grass', { amp: '0.09', speed: '1.7', pushAmt: '0.9' });
  const chunks = [];
  const C = 24;
  for (let cx = -48; cx < 48; cx += C) {
    for (let cz = -64; cz < 32; cz += C) {
      const list = [];
      for (let i = 0; i < 3600; i++) {
        const x = cx + rand() * C;
        const z = cz + rand() * C;
        if (z < -63.5) continue;
        if (pitMask(x, z) > 0.2) continue;
        const s = splatAt(x, z);
        let dens = 0.75 - s.trampled * 0.8 - s.burnt * 0.9;
        if (Math.abs(x) > 23) dens += 0.2;
        if (inZone(x, z, -1.0)) dens -= 0.45;
        if (Math.abs(z - BARRIER_Z) < 2.2) dens = -1;
        if (z < -30) dens *= 0.55;
        if (Math.abs(x) > 30) dens *= 0.6;
        if (rand() > dens) continue;
        list.push([x, z]);
      }
      if (!list.length) continue;
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const [x, z] = list[i];
        const sc = 0.65 + rand() * 0.8;
        _p.set(x, groundHeight(x, z) - 0.02, z);
        _q.setFromEuler(_e.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2));
        _s.set(sc, sc * (0.8 + rand() * 0.5), sc);
        im.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      im.userData.total = list.length;
      im.name = 'grass';
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = false;
      scene.add(im);
      chunks.push(im);
    }
  }
  return chunks;
}

export { smoothstep };
