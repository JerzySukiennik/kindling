import * as THREE from 'three';
import { CORN, groundHeight } from './layout.js';
import { mulberry32 } from './noise.js';
import { windMaterialPatch } from './scatter.js';

class GeoBuilder {
  constructor() { this.pos = []; this.col = []; this.h = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  v(p, c, h) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); this.h.push(h); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(this.h, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function stalkGeometry(seed, detail) {
  const rand = mulberry32(seed);
  const b = new GeoBuilder();
  const H = 2.2 + rand() * 0.6;
  const radial = detail ? 4 : 3;
  const segs = detail ? 3 : 1;
  const lean = new THREE.Vector2((rand() - 0.5) * 0.25, (rand() - 0.5) * 0.25);
  const stalkC0 = new THREE.Color().setRGB(0.2, 0.17, 0.11);
  const stalkC1 = new THREE.Color().setRGB(0.58, 0.5, 0.33);
  const center = (t) => new THREE.Vector3(lean.x * t * t * H, t * H, lean.y * t * t * H);
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = center(t);
    const r = 0.022 * (1 - t * 0.7);
    const col = stalkC0.clone().lerp(stalkC1, Math.min(1, t * 2));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      b.v(new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), col, t);
    }
  }
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < radial; k++) {
      const a = s * radial + k;
      const bb = s * radial + ((k + 1) % radial);
      b.tri(a, a + radial, bb);
      b.tri(bb, a + radial, bb + radial);
    }
  }
  const leaves = detail ? 5 : 3;
  for (let l = 0; l < leaves; l++) {
    const t0 = 0.18 + (l / leaves) * 0.68 + rand() * 0.04;
    const root = center(t0);
    const ang = (l % 2 ? 0 : Math.PI) + (rand() - 0.5) * 1.1 + seed;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const len = 0.55 + rand() * 0.4;
    const dead = rand() < 0.35;
    const droop = dead ? 1.6 + rand() * 0.8 : 0.6 + rand() * 0.7;
    const rise = dead ? 0.1 : 0.5 + rand() * 0.4;
    const w = 0.045 + rand() * 0.02;
    const twist = (rand() - 0.5) * 1.4;
    const lc = dead
      ? new THREE.Color().setRGB(0.32 + rand() * 0.06, 0.25, 0.15)
      : new THREE.Color().setRGB(0.55 + rand() * 0.1, 0.47 + rand() * 0.06, 0.3);
    const ls = detail ? 3 : 1;
    const base = b.n;
    for (let s = 0; s <= ls; s++) {
      const u = s / ls;
      const out = len * u;
      const y = rise * len * u - droop * len * u * u * 0.6;
      const p = root.clone().addScaledVector(dir, out).add(new THREE.Vector3(0, y, 0));
      const ww = w * Math.sin(Math.min(1, u * 1.15 + 0.08) * Math.PI) * (u < 0.1 ? 0.6 : 1);
      const tw = side.clone().applyAxisAngle(dir, twist * u);
      const c = lc.clone().multiplyScalar(0.75 + 0.35 * u);
      b.v(p.clone().addScaledVector(tw, -ww), c, Math.min(1, t0 + u * 0.4));
      b.v(p.clone().addScaledVector(tw, ww), c, Math.min(1, t0 + u * 0.4));
    }
    for (let s = 0; s < ls; s++) {
      const a = base + s * 2;
      b.tri(a, a + 1, a + 2);
      b.tri(a + 1, a + 3, a + 2);
    }
  }
  if (detail) {
    const top = center(1);
    const tc = new THREE.Color().setRGB(0.62, 0.52, 0.32);
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2;
      const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 0.22 + rand() * 0.12, Math.sin(a) * 0.12));
      const base = b.n;
      b.v(top.clone().add(new THREE.Vector3(0.008, -0.02, 0)), tc, 1);
      b.v(top.clone().add(new THREE.Vector3(-0.008, -0.02, 0)), tc, 1);
      b.v(tip, tc, 1);
      b.tri(base, base + 1, base + 2);
    }
    const ears = rand() < 0.75 ? 1 : 2;
    for (let e = 0; e < ears; e++) {
      const t0 = 0.42 + e * 0.12 + rand() * 0.05;
      const root = center(t0);
      const a = rand() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a) * 0.45, 0.88, Math.sin(a) * 0.45).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const up = new THREE.Vector3().crossVectors(dir, side).normalize();
      const ec = new THREE.Color().setRGB(0.6, 0.52, 0.36);
      const L = 0.22 + rand() * 0.06;
      const rings = 3;
      const rad = 4;
      const base = b.n;
      for (let s = 0; s <= rings; s++) {
        const u = s / rings;
        const r = 0.032 * Math.sin(Math.min(1, u * 1.1 + 0.15) * Math.PI) + 0.004;
        const c = root.clone().addScaledVector(dir, L * u + 0.02);
        for (let k = 0; k < rad; k++) {
          const aa = (k / rad) * Math.PI * 2;
          b.v(c.clone().addScaledVector(side, Math.cos(aa) * r).addScaledVector(up, Math.sin(aa) * r), ec.clone().multiplyScalar(0.8 + 0.3 * u), t0);
        }
      }
      for (let s = 0; s < rings; s++) {
        for (let k = 0; k < rad; k++) {
          const a0 = base + s * rad + k;
          const a1 = base + s * rad + ((k + 1) % rad);
          b.tri(a0, a0 + rad, a1);
          b.tri(a1, a0 + rad, a1 + rad);
        }
      }
    }
  }
  return b.build();
}

export function createCornfield(scene) {
  const rand = mulberry32(2025);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  windMaterialPatch(mat, 'corn', { amp: '0.18', speed: '1.1', flutter: '0.025', pushAmt: '1.1', height: '1.0' });
  const nearGeos = [stalkGeometry(11, true), stalkGeometry(29, true), stalkGeometry(47, true)];
  const farGeos = [stalkGeometry(5, false), stalkGeometry(17, false)];
  const meshes = [];
  const nearZ = -86;
  const CH = 44;
  const rowGap = 0.86;
  const plantGap = 0.58;
  const chunks = new Map();
  for (let z = CORN.z1 - 0.4; z > CORN.z0; z -= rowGap) {
    const near = z > nearZ;
    const xHalf = near ? 56 : 66;
    for (let x = -xHalf; x < xHalf; x += plantGap * (near ? 1 : 1.25)) {
      if (rand() < 0.08) continue;
      const px = x + (rand() - 0.5) * 0.28;
      const pz = z + (rand() - 0.5) * 0.22;
      const gi = Math.floor(rand() * (near ? nearGeos.length : farGeos.length));
      const key = (near ? 'n' : 'f') + gi + ':' + Math.floor(px / CH) + ':' + Math.floor(pz / CH);
      if (!chunks.has(key)) chunks.set(key, { geo: near ? nearGeos[gi] : farGeos[gi], list: [] });
      chunks.get(key).list.push([px, pz]);
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const { geo, list } of chunks.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const [x, z] = list[i];
      const sc = 0.85 + rand() * 0.3;
      p.set(x, groundHeight(x, z) - 0.05, z);
      q.setFromEuler(e.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12));
      s.set(sc, sc * (0.9 + rand() * 0.2), sc);
      im.setMatrixAt(i, m.compose(p, q, s));
    }
    im.userData.total = list.length;
    im.name = 'corn';
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.castShadow = false;
    scene.add(im);
    meshes.push(im);
  }
  return {
    meshes,
    setDensity(d) {
      for (const im of meshes) im.count = Math.floor(im.userData.total * Math.max(0.55, d));
    },
  };
}
