import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function lathe(profile, segs = 22, sx = 1, sz = 1, opts = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), segs, opts.start ?? 0, opts.len ?? Math.PI * 2);
  const p = g.attributes.position;
  const y0 = profile[0][1];
  const y1 = profile[profile.length - 1][1];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let z = p.getZ(i);
    const y = p.getY(i);
    if (opts.folds) {
      const a = Math.atan2(z, x);
      const t = (y - y0) / (y1 - y0 || 1);
      const k = 1 + opts.folds * Math.pow(Math.abs(t), opts.foldPow ?? 1.4) * (Math.sin(a * (opts.foldN ?? 9) + y * 3) * 0.7 + Math.sin(a * 4 + 1.3) * 0.3);
      x *= k;
      z *= k;
    }
    p.setXYZ(i, x * sx, y, z * sz);
  }
  g.computeVertexNormals();
  return g;
}

function tcap(r0, r1, len, seg = 16) {
  const prof = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 0.5;
    prof.push([Math.sin(a) * r0, Math.cos(a) * r0]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * 0.5 + (i / n) * Math.PI * 0.5;
    prof.push([Math.sin(a) * r1, -len + Math.cos(a) * r1]);
  }
  prof.reverse();
  return lathe(prof, seg);
}

function fabricNormal(seed = 1, freq = 0.9) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const h = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const weave = Math.sin(i * freq) * Math.sin(j * freq * 0.5) * 0.4;
      h[j * S + i] = weave + rnd() * 0.18 + Math.sin(i * 0.05 + j * 0.03) * 0.5 + Math.sin(j * 0.11) * 0.2;
    }
  }
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const dx = h[j * S + ((i + 1) % S)] - h[j * S + ((i + S - 1) % S)];
      const dy = h[((j + 1) % S) * S + i] - h[((j + S - 1) % S) * S + i];
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const o = (j * S + i) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export const SKINS = {
  default: { coat: 0x2c2620, coatDark: 0x1f1b17, cloth: 0x1b1b1c, leather: 0x2b1e15, mask: 0x272725, beam: new THREE.Color(0.55, 1.0, 0.3) },
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
const GRIP_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));

export class Character {
  constructor(scene, skin = SKINS.default) {
    this.root = new THREE.Group();
    scene.add(this.root);
    const fab = fabricNormal(7);
    const fab2 = fabricNormal(19, 1.6);
    const M = {
      coat: new THREE.MeshStandardMaterial({ color: skin.coat, roughness: 0.74, normalMap: fab, normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide }),
      coatDark: new THREE.MeshStandardMaterial({ color: skin.coatDark, roughness: 0.8, normalMap: fab, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide }),
      cloth: new THREE.MeshStandardMaterial({ color: skin.cloth, roughness: 0.92, normalMap: fab2, normalScale: new THREE.Vector2(0.5, 0.5) }),
      leather: new THREE.MeshStandardMaterial({ color: skin.leather, roughness: 0.5, metalness: 0.04 }),
      rubber: new THREE.MeshStandardMaterial({ color: skin.mask, roughness: 0.72 }),
      sole: new THREE.MeshStandardMaterial({ color: 0x121110, roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.42, metalness: 0.88 }),
      brass: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.38, metalness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.5, metalness: 0.6 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x0a0c0b, roughness: 0.3, metalness: 0.85, emissive: new THREE.Color(0.18, 0.4, 0.1), emissiveIntensity: 0.7 }),
      glow: new THREE.MeshBasicMaterial({ color: skin.beam.clone().multiplyScalar(2.6) }),
    };
    this.mats = M;
    this.ghostMat = new THREE.MeshStandardMaterial({ color: 0x9fc4ff, emissive: 0x3f6fbf, emissiveIntensity: 0.9, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.3 });
    const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.baseMat = mat;
      parent.add(m);
      return m;
    };
    const B = (name, parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const b = {};
    b.hips = B('hips', this.root, 0, 0.96, 0);
    b.spine = B('spine', b.hips, 0, 0.1, 0);
    b.chest = B('chest', b.spine, 0, 0.25, 0);
    b.neck = B('neck', b.chest, 0, 0.25, 0.0);
    b.head = B('head', b.neck, 0, 0.09, 0.015);
    for (const s of [-1, 1]) {
      const k = s < 0 ? 'L' : 'R';
      b['sh' + k] = B('sh' + k, b.chest, s * 0.185, 0.19, -0.01);
      b['ua' + k] = B('ua' + k, b['sh' + k]);
      b['fa' + k] = B('fa' + k, b['ua' + k], 0, -0.285, 0);
      b['hand' + k] = B('hand' + k, b['fa' + k], 0, -0.25, 0);
      b['th' + k] = B('th' + k, b.hips, s * 0.095, -0.05, 0);
      b['sn' + k] = B('sn' + k, b['th' + k], 0, -0.445, 0);
      b['ft' + k] = B('ft' + k, b['sn' + k], 0, -0.435, 0);
    }
    this.b = b;

    add(b.hips, lathe([[0.0, -0.1], [0.13, -0.095], [0.165, -0.04], [0.17, 0.04], [0.16, 0.12], [0.0, 0.13]], 22, 1, 0.72), M.cloth);
    add(b.spine, lathe([[0.0, -0.03], [0.162, -0.02], [0.158, 0.06], [0.168, 0.16], [0.18, 0.25], [0.0, 0.26]], 24, 1, 0.7, { folds: 0.025, foldN: 7 }), M.coat);
    add(b.chest, lathe([[0.0, -0.02], [0.182, -0.01], [0.198, 0.08], [0.2, 0.16], [0.18, 0.22], [0.13, 0.26], [0.07, 0.285], [0.0, 0.29]], 24, 1.02, 0.68, { folds: 0.02, foldN: 6 }), M.coat);
    add(b.chest, lathe([[0.075, 0.22], [0.088, 0.27], [0.1, 0.33], [0.112, 0.37]], 20, 1.05, 1, { start: Math.PI * 0.62, len: Math.PI * 1.76 }), M.coatDark);
    add(b.chest, lathe([[0.09, 0.3], [0.15, 0.285], [0.215, 0.22], [0.25, 0.13], [0.262, 0.06]], 26, 1.05, 0.78, { start: Math.PI * 0.6, len: Math.PI * 1.8, folds: 0.05, foldN: 8, foldPow: 1.6 }), M.coat);
    add(b.spine, new THREE.TorusGeometry(0.168, 0.022, 8, 28).rotateX(Math.PI / 2).scale(1, 1, 0.72), M.leather);
    add(b.spine, new RoundedBoxGeometry(0.06, 0.05, 0.02, 2, 0.006), M.brass, 0, 0.0, 0.122);
    for (const s of [-1, 1]) {
      const strap = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.1, -0.02, 0.135), new THREE.Vector3(s * 0.12, 0.2, 0.14), new THREE.Vector3(s * 0.13, 0.285, 0.02), new THREE.Vector3(s * 0.12, 0.23, -0.13), new THREE.Vector3(s * 0.1, 0.0, -0.15),
      ]), 20, 0.014, 5);
      add(b.chest, strap, M.leather);
    }
    const pack = B('pack', b.chest, 0, 0.08, -0.205);
    add(pack, new RoundedBoxGeometry(0.3, 0.42, 0.07, 3, 0.02), M.dark, 0, 0, 0.03);
    add(pack, new THREE.CylinderGeometry(0.088, 0.088, 0.36, 20), M.metal, 0, 0.0, -0.06);
    add(pack, new THREE.SphereGeometry(0.088, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, 0, 0.18, -0.06);
    add(pack, new THREE.SphereGeometry(0.088, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.metal, 0, -0.18, -0.06);
    for (const y of [-0.12, 0.12]) add(pack, new THREE.TorusGeometry(0.09, 0.008, 6, 24).rotateX(Math.PI / 2), M.dark, 0, y, -0.06);
    this.cell = add(pack, new THREE.CylinderGeometry(0.0905, 0.0905, 0.012, 24, 1, true), M.glow, 0, 0.03, -0.06);
    add(pack, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), M.brass, 0.0, 0.29, -0.06);
    add(pack, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), M.dark, 0.06, 0.2, 0.0, 0, 0, Math.PI / 2);
    const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 0.32, -0.27), new THREE.Vector3(0.12, 0.34, -0.16), new THREE.Vector3(0.24, 0.18, -0.02), new THREE.Vector3(0.26, 0.0, 0.12), new THREE.Vector3(0.16, -0.02, 0.24),
    ]), 24, 0.013, 6);
    add(b.chest, hose, M.rubber);

    add(b.head, lathe([[0.0, -0.12], [0.11, -0.12], [0.135, -0.04], [0.14, 0.04], [0.128, 0.12], [0.09, 0.18], [0.0, 0.2]], 24, 1.06, 1.14, { start: Math.PI * 0.72, len: Math.PI * 1.56, folds: 0.03, foldN: 5 }), M.coat, 0, 0.02, -0.025);
    const face = add(b.head, new THREE.SphereGeometry(0.1, 24, 18, -Math.PI * 0.5, Math.PI, 0, Math.PI), M.rubber);
    face.scale.set(0.95, 1.05, 1.05);
    for (const s of [-1, 1]) {
      add(b.head, new THREE.CylinderGeometry(0.033, 0.036, 0.035, 20).rotateX(Math.PI / 2), M.dark, s * 0.042, 0.035, 0.093, 0, s * 0.18, 0);
      add(b.head, new THREE.CircleGeometry(0.028, 20), M.lens, s * 0.045, 0.035, 0.111, 0, s * 0.18, 0);
      add(b.head, new THREE.TorusGeometry(0.031, 0.005, 6, 20), M.brass, s * 0.045, 0.035, 0.112, 0, s * 0.18, 0);
    }
    add(b.head, new THREE.CylinderGeometry(0.028, 0.038, 0.05, 16).rotateX(Math.PI / 2 - 0.5), M.dark, 0, -0.04, 0.1);
    add(b.head, new THREE.CylinderGeometry(0.046, 0.046, 0.05, 20).rotateX(Math.PI / 2 - 0.5), M.metal, 0, -0.065, 0.135);
    add(b.head, new THREE.CylinderGeometry(0.047, 0.047, 0.012, 20).rotateX(Math.PI / 2 - 0.5), M.dark, 0, -0.075, 0.155);
    for (const s of [-1, 1]) add(b.head, new THREE.CylinderGeometry(0.03, 0.03, 0.035, 14).rotateZ(Math.PI / 2), M.metal, s * 0.105, -0.035, 0.03, 0, s * 0.4, 0);

    for (const s of [-1, 1]) {
      const k = s < 0 ? 'L' : 'R';
      add(b['ua' + k], tcap(0.062, 0.053, 0.27), M.coat);
      add(b['ua' + k], lathe([[0.068, 0.02], [0.074, -0.03], [0.066, -0.09]], 18), M.coat);
      add(b['fa' + k], tcap(0.053, 0.044, 0.215), M.coat);
      add(b['fa' + k], new THREE.CylinderGeometry(0.052, 0.048, 0.06, 16), M.leather, 0, -0.205, 0);
      const hand = b['hand' + k];
      add(hand, new RoundedBoxGeometry(0.08, 0.085, 0.034, 2, 0.014), M.leather, 0, -0.04, 0);
      add(hand, new RoundedBoxGeometry(0.078, 0.06, 0.036, 2, 0.015), M.leather, 0, -0.1, 0.022, 0.9, 0, 0);
      add(hand, new THREE.CapsuleGeometry(0.014, 0.045, 4, 8), M.leather, s * -0.045, -0.06, 0.02, 0.5, 0, s * -0.5);
      add(b['th' + k], tcap(0.086, 0.068, 0.42), M.cloth);
      add(b['th' + k], new RoundedBoxGeometry(0.1, 0.1, 0.045, 2, 0.018), M.leather, 0, -0.43, 0.06);
      add(b['sn' + k], tcap(0.064, 0.05, 0.4), M.cloth);
      add(b['sn' + k], lathe([[0.058, -0.2], [0.068, -0.25], [0.066, -0.36], [0.062, -0.43], [0.0, -0.44]], 18), M.leather);
      const foot = b['ft' + k];
      const boot = new THREE.CapsuleGeometry(0.052, 0.15, 6, 14).rotateX(Math.PI / 2);
      boot.scale(1.0, 0.72, 1.0);
      add(foot, boot, M.leather, 0, -0.03, 0.06);
      add(foot, new RoundedBoxGeometry(0.1, 0.03, 0.27, 2, 0.012), M.sole, 0, -0.065, 0.06);
    }
    this.skirt = [];
    for (const s of [-1, 1]) {
      const start = s < 0 ? Math.PI * 0.62 : Math.PI * 1.53;
      const g = lathe([[0.168, 0.06], [0.172, 0.0], [0.19, -0.15], [0.22, -0.35], [0.255, -0.55], [0.28, -0.7]], 16, 1, 0.78, { start, len: Math.PI * 0.85, folds: 0.07, foldN: 10, foldPow: 1.2 });
      this.skirt.push(add(b.hips, g, M.coat, 0, 0.02, -0.005));
    }
    const back = lathe([[0.17, 0.06], [0.175, 0.0], [0.2, -0.15], [0.235, -0.35], [0.265, -0.55], [0.285, -0.68]], 10, 1, 0.78, { start: Math.PI * 1.42, len: Math.PI * 0.16, folds: 0.05, foldN: 10 });
    this.backFlap = add(b.hips, back, M.coat, 0, 0.02, -0.005);

    const gun = B('gun', b.chest, 0.11, 0.05, 0.3);
    this.gun = gun;
    add(gun, new RoundedBoxGeometry(0.075, 0.115, 0.32, 3, 0.018), M.dark);
    add(gun, new RoundedBoxGeometry(0.05, 0.085, 0.2, 2, 0.02), M.dark, 0, -0.02, -0.24);
    add(gun, new RoundedBoxGeometry(0.06, 0.025, 0.24, 2, 0.008), M.metal, 0, 0.07, 0.02);
    add(gun, new THREE.CylinderGeometry(0.036, 0.04, 0.3, 20).rotateX(Math.PI / 2), M.metal, 0, 0.01, 0.3);
    for (let i = 0; i < 5; i++) add(gun, new THREE.TorusGeometry(0.041, 0.006, 6, 18), M.dark, 0, 0.01, 0.19 + i * 0.05);
    add(gun, new THREE.CylinderGeometry(0.03, 0.044, 0.05, 20).rotateX(Math.PI / 2), M.brass, 0, 0.01, 0.47);
    this.emitter = add(gun, new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16).rotateX(Math.PI / 2), M.glow, 0, 0.01, 0.497);
    add(gun, new RoundedBoxGeometry(0.04, 0.12, 0.06, 2, 0.012), M.leather, 0, -0.1, -0.06, -0.3, 0, 0);
    add(gun, new RoundedBoxGeometry(0.036, 0.09, 0.045, 2, 0.012), M.leather, 0, -0.08, 0.17);
    add(gun, new THREE.CapsuleGeometry(0.014, 0.12, 4, 8).rotateX(Math.PI / 2), M.glow, 0.042, 0.0, -0.02);
    add(gun, new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6).rotateX(Math.PI / 2), M.brass, -0.04, 0.03, 0.08);
    this.muzzleLocal = new THREE.Vector3(0, 0.01, 0.505);
    this.gripR = new THREE.Vector3(0, -0.11, -0.05);
    this.gripL = new THREE.Vector3(0, -0.08, 0.17);

    this.phase = 0;
    this.land = 0;
    this.ghost = false;
    this.fireKick = 0;
    this._axis = new THREE.Vector3();
    this._sh = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._e = new THREE.Vector3();
    this._h = new THREE.Vector3();
    this._hint = new THREE.Vector3();
    this._out = new THREE.Vector3();
    const keepSeparate = new Set([this.cell, this.emitter, ...this.skirt, this.backFlap]);
    const groups = [];
    this.root.traverse((o) => { if (o.isGroup || o === this.root) groups.push(o); });
    for (const g of groups) {
      const byMat = new Map();
      for (const c of [...g.children]) {
        if (!c.isMesh || keepSeparate.has(c) || c.children.length) continue;
        if (!byMat.has(c.material)) byMat.set(c.material, []);
        byMat.get(c.material).push(c);
      }
      for (const [mat, list] of byMat) {
        if (list.length < 2) continue;
        const geos = list.map((c) => {
          c.updateMatrix();
          let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
          if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
          return geo.applyMatrix4(c.matrix);
        });
        const merged = mergeGeometries(geos);
        for (const c of list) g.remove(c);
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.baseMat = mat;
        g.add(m);
      }
    }
    this.meshes = [];
    this.root.traverse((o) => { if (o.isMesh) { this.meshes.push(o); o.layers.enable(1); } });
  }

  setGhost(on) {
    if (on === this.ghost) return;
    this.ghost = on;
    for (const m of this.meshes) {
      m.material = on ? this.ghostMat : m.userData.baseMat;
      m.castShadow = !on;
    }
  }

  muzzleWorld(out) {
    this.gun.updateWorldMatrix(true, false);
    return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
  }

  update(dt, s) {
    const b = this.b;
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.yaw + Math.PI;
    const speed = s.speed;
    const run = THREE.MathUtils.clamp((speed - 4) / 2.5, 0, 1);
    this.phase += dt * (speed > 0.2 ? 2.4 + speed * 1.1 : 0);
    const ph = this.phase;
    const amp = THREE.MathUtils.clamp(speed / 4.2, 0, 1);
    const axis = this._axis.set(s.localMove.y, 0, -s.localMove.x);
    if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
    axis.normalize();
    const air = !s.onGround;
    this.land = Math.max(0, this.land - dt * 4);
    if (s.justLanded) this.land = 1;
    const tnow = performance.now() * 0.001;
    const breathe = Math.sin(tnow * 1.8) * 0.012;
    for (const side of [0, 1]) {
      const k = side ? 'R' : 'L';
      const sp = side ? ph + Math.PI : ph;
      let swing = Math.sin(sp) * (0.5 + run * 0.3) * amp;
      let knee = (Math.max(0, Math.sin(sp + 1.3)) * (0.85 + run * 0.6) + 0.08) * amp + 0.05;
      if (air) { swing = side ? -0.3 : 0.6; knee = side ? 0.55 : 1.15; }
      knee += this.land * 0.55;
      _q.setFromAxisAngle(axis, -swing);
      b['th' + k].quaternion.copy(_q);
      b['th' + k].rotateX(-this.land * 0.35);
      b['sn' + k].rotation.set(knee, 0, 0);
      b['ft' + k].rotation.set(-knee * 0.45 + swing * 0.2 + (air ? 0.3 : 0), 0, 0);
    }
    for (const side of [0, 1]) {
      const th = b[side ? 'thR' : 'thL'];
      this.skirt[side].quaternion.copy(th.quaternion).slerp(_q2.identity(), 0.62);
    }
    this.backFlap.rotation.x = -0.1 * amp - (air ? 0.25 : 0) - Math.abs(Math.sin(ph)) * 0.08 * amp;
    const bob = Math.abs(Math.sin(ph)) * 0.04 * amp;
    b.hips.position.y = 0.96 - bob - this.land * 0.12 + (air ? 0.03 : 0);
    b.hips.rotation.set(0, Math.sin(ph) * 0.1 * amp, Math.sin(ph) * 0.025 * amp);
    const aimPitch = s.pitch;
    this.fireKick = Math.max(0, this.fireKick - dt * 6);
    b.spine.rotation.set(-aimPitch * 0.35 + 0.1 * run + this.land * 0.15, -b.hips.rotation.y * 0.8 - 0.12, 0);
    b.chest.rotation.set(-aimPitch * 0.4 + breathe, -0.08, 0);
    b.neck.rotation.set(-aimPitch * 0.25, 0.2, 0);
    b.chest.scale.setScalar(1 + breathe * 0.3);
    const shake = Math.sin(tnow * 50) * 0.004 * this.fireKick;
    this.gun.rotation.set(-aimPitch * 0.25 + this.fireKick * 0.05 + shake, 0.2, 0);
    this.gun.position.set(0.11, 0.05, 0.3 - this.fireKick * 0.02);
    this.root.updateMatrixWorld(true);
    this.armIK('R', this.gripR);
    this.armIK('L', this.gripL);
  }

  armIK(k, gripLocal) {
    const b = this.b;
    const sh = b['sh' + k];
    const ua = b['ua' + k];
    const fa = b['fa' + k];
    const hand = b['hand' + k];
    const target = _v.copy(gripLocal).applyMatrix4(this.gun.matrixWorld);
    const shW = this._sh.setFromMatrixPosition(sh.matrixWorld);
    const l1 = 0.285;
    const l2 = 0.31;
    const d = this._d.subVectors(target, shW);
    let dist = d.length();
    dist = Math.min(Math.max(dist, 0.08), (l1 + l2) * 0.999);
    d.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const out = this._out.set(k === 'R' ? -1 : 1, 0, 0).transformDirection(b.chest.matrixWorld);
    const hint = this._hint.copy(DOWN).addScaledVector(out, 0.75).normalize();
    hint.addScaledVector(d, -hint.dot(d)).normalize();
    const elbow = this._e.copy(shW).addScaledVector(d, a).addScaledVector(hint, h);
    const handW = this._h.copy(shW).addScaledVector(d, dist);
    elbow.applyMatrix4(_m.copy(sh.matrixWorld).invert());
    ua.quaternion.setFromUnitVectors(DOWN, elbow.normalize());
    ua.updateMatrixWorld(true);
    handW.applyMatrix4(_m.copy(ua.matrixWorld).invert()).sub(fa.position);
    fa.quaternion.setFromUnitVectors(DOWN, handW.normalize());
    fa.updateMatrixWorld(true);
    this.gun.getWorldQuaternion(_q);
    if (k === 'R') _q.multiply(GRIP_TILT);
    fa.getWorldQuaternion(_q2);
    hand.quaternion.copy(_q2.invert().multiply(_q));
    hand.updateMatrixWorld(true);
  }
}
