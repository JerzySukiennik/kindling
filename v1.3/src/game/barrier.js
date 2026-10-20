import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BARRIER_Z, BARRIER_STOP_Z, BARRIER_HALF_W, PIT, groundHeight } from '../world/layout.js';

const H = 3.4;
export const HIDE = -3.7;
export const PLOW_TOP = 0.45;
export const CENTER_HALF = 13.2;
export const BARRIER_BACK = 0.3;
export const BARRIER_FRONT = 0.65;
const PLOW_Y = PLOW_TOP - H;
const END_Z = PIT.z0 - 0.6;

function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

export class Barrier {
  constructor(scene, assets, physics) {
    this.ph = physics;
    const t = assets.tex.rusty_metal_04;
    this.tex = t;
    this.frameMat = new THREE.MeshStandardMaterial({
      map: this.rep(t.diff, 2, 2), normalMap: this.rep(t.nor, 2, 2), roughnessMap: this.rep(t.arm, 2, 2),
      color: new THREE.Color(0.32, 0.3, 0.29), metalness: 0.85, roughness: 1,
    });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.4, 0.05) });
    this.center = this.section(-CENTER_HALF, CENTER_HALF, [-8, 0, 8]);
    this.wings = [this.section(-BARRIER_HALF_W, -CENTER_HALF, []), this.section(CENTER_HALF, BARRIER_HALF_W, [])];
    for (const g of [this.center, ...this.wings]) {
      g.traverse((o) => o.layers.enable(1));
      scene.add(g);
    }
    const W = BARRIER_HALF_W * 2;
    this.slots = [BARRIER_Z, BARRIER_STOP_Z].map((z) => this.makeSlot(scene, z, W));
    this.state = 'hidden';
    this.z = BARRIER_Z;
    this.yC = HIDE;
    this.yW = HIDE;
    this.t = 0;
    this.speed = 6.2;
    this.plowSpeed = 7.5;
    this.events = { riseStart() {}, riseEnd() {}, arrive() {}, plow() {}, dump() {}, sunk() {} };
    this.apply();
  }

  rep(tex, x, y) {
    const c = tex.clone();
    c.repeat.set(x, y);
    c.needsUpdate = true;
    return c;
  }

  section(x0, x1, beacons) {
    const t = this.tex;
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const g = new THREE.Group();
    const plateMat = new THREE.MeshStandardMaterial({
      map: this.rep(t.diff, w / 3.2, H / 3.2), normalMap: this.rep(t.nor, w / 3.2, H / 3.2), roughnessMap: this.rep(t.arm, w / 3.2, H / 3.2), metalnessMap: this.rep(t.arm, w / 3.2, H / 3.2),
      color: new THREE.Color(0.62, 0.58, 0.55), metalness: 1, roughness: 1, envMapIntensity: 1.2,
    });
    const plate = new THREE.Mesh(box(w, H, 0.14, cx, H / 2, 0), plateMat);
    plate.castShadow = plate.receiveShadow = true;
    g.add(plate);
    const parts = [];
    for (let x = x0 + 1; x <= x1 - 0.9; x += 2.75) {
      parts.push(box(0.22, H - 0.05, 0.08, x, H / 2, 0.11));
      parts.push(box(0.07, H - 0.05, 0.16, x, H / 2, 0.19));
      parts.push(box(0.22, H - 0.05, 0.06, x, H / 2, 0.28));
      parts.push(box(0.2, H * 0.9, 0.2, x, H * 0.45, -0.17));
    }
    for (const y of [0.42, H - 0.42]) parts.push(box(w, 0.22, 0.14, cx, y, 0.12));
    parts.push(box(w + 0.05, 0.18, 0.5, cx, H + 0.04, 0));
    parts.push(box(w, 0.06, 0.62, cx, 0.18, 0.36, -0.55));
    parts.push(box(w, 0.32, 0.08, cx, 0.12, 0.62));
    parts.push(box(0.12, H + 0.1, 0.5, x0 + 0.06, H / 2, 0.0), box(0.12, H + 0.1, 0.5, x1 - 0.06, H / 2, 0.0));
    const frame = new THREE.Mesh(mergeGeometries(parts), this.frameMat);
    frame.castShadow = frame.receiveShadow = true;
    g.add(frame);
    const boltGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6).rotateX(Math.PI / 2);
    const bolts = [];
    for (let x = x0 + 0.3; x < x1; x += 0.45) for (const y of [0.36, 0.48, H - 0.48, H - 0.36]) bolts.push([x, y]);
    const bim = new THREE.InstancedMesh(boltGeo, this.frameMat, bolts.length);
    const m = new THREE.Matrix4();
    bolts.forEach(([x, y], i) => bim.setMatrixAt(i, m.makeTranslation(x, y, 0.2)));
    bim.computeBoundingSphere();
    g.add(bim);
    for (const x of beacons) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), this.beaconMat);
      b.position.set(x, H + 0.24, 0);
      g.add(b);
    }
    return g;
  }

  makeSlot(scene, z, W) {
    const g = new THREE.Group();
    const gy = groundHeight(0, z);
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.2, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x020202, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    gap.position.set(0, gy + 0.006, z);
    g.add(gap);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.07, 0.12), this.frameMat);
      rail.position.set(0, gy + 0.02, z + s * 0.31);
      rail.castShadow = rail.receiveShadow = true;
      g.add(rail);
    }
    for (const s of [-1, 1]) {
      const hx = s * (W / 2 + 1.1);
      const house = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.4), this.frameMat);
      house.position.set(hx, groundHeight(hx, z) + 0.3, z);
      house.castShadow = house.receiveShadow = true;
      g.add(house);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8).rotateZ(Math.PI / 2), this.frameMat);
      pipe.position.set(s * (W / 2 + 0.35), gy + 0.1, z + 0.55);
      g.add(pipe);
    }
    scene.add(g);
    return g;
  }

  get groundY() { return groundHeight(0, this.z) - 0.04; }

  apply() {
    const gy = this.groundY;
    this.center.position.set(0, gy + this.yC, this.z);
    this.center.visible = this.yC > HIDE + 0.05;
    for (const w of this.wings) {
      w.position.set(0, gy + this.yW, this.z);
      w.visible = this.yW > HIDE + 0.05;
    }
    const solid = this.state === 'rising' || this.state === 'up' || this.state === 'moving';
    this.ph.setBarrier(solid ? gy + this.yC : -8, this.z);
  }

  rise() {
    if (this.state !== 'hidden') return;
    this.state = 'rising';
    this.z = BARRIER_Z;
    this.t = 0;
    this.events.riseStart(this);
  }

  go() {
    if (this.state === 'up') { this.state = 'moving'; this.t = 0; }
  }

  reset() {
    this.state = 'hidden';
    this.z = BARRIER_Z;
    this.yC = this.yW = HIDE;
    this.apply();
  }

  get up() { return this.state === 'up' || this.state === 'moving'; }
  get active() { return this.state !== 'hidden'; }
  get plowing() { return this.state === 'lowering' || this.state === 'plowing'; }
  get topY() { return this.groundY + this.yC + H; }

  update(dt, now) {
    this.t += dt;
    if (this.state === 'rising') {
      const k = Math.min(1, this.t / 2.4);
      const e = 1 - Math.pow(1 - k, 3);
      this.yC = this.yW = HIDE + (0 - HIDE) * e + Math.sin(this.t * 40) * 0.01 * (1 - k);
      if (k >= 1) { this.yC = this.yW = 0; this.state = 'up'; this.events.riseEnd(this); }
    } else if (this.state === 'moving') {
      const sp = this.speed * Math.min(1, this.t / 1.2);
      this.z = Math.min(BARRIER_STOP_Z, this.z + sp * dt);
      this.yC = this.yW = Math.sin(this.t * 13) * 0.012;
      if (this.z >= BARRIER_STOP_Z) { this.state = 'lowering'; this.t = 0; this.events.arrive(this); }
    } else if (this.state === 'lowering') {
      const k = Math.min(1, this.t / 0.6);
      const e = k * k * (3 - 2 * k);
      this.yW = HIDE * e;
      this.yC = PLOW_Y * e;
      this.z += 2.4 * dt;
      if (k >= 1) { this.state = 'plowing'; this.t = 0; this.events.plow(this); }
    } else if (this.state === 'plowing') {
      const sp = this.plowSpeed * Math.min(1, 0.35 + this.t / 0.5);
      this.z = Math.min(END_Z, this.z + sp * dt);
      this.yC = PLOW_Y + Math.sin(this.t * 31) * 0.01;
      if (this.z >= END_Z) { this.state = 'dumping'; this.t = 0; this.events.dump(this); }
    } else if (this.state === 'dumping') {
      const k = Math.min(1, this.t / 0.6);
      this.yC = PLOW_Y + (HIDE - PLOW_Y) * k * k;
      if (k >= 1) { this.reset(); this.events.sunk(this); }
    }
    const on = this.state !== 'hidden' && this.state !== 'up';
    const pulse = on ? Math.max(0, Math.sin(now * 9)) : 0.15;
    this.beaconMat.color.setRGB(1 + pulse * 7, 0.35 + pulse * 2.2, 0.05 + pulse * 0.2);
    this.apply();
  }
}
