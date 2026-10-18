import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BARRIER_Z, BARRIER_STOP_Z, BARRIER_HALF_W, groundHeight } from '../world/layout.js';

const H = 3.4;
const HIDE = -3.7;

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
    const rep = (tex, x, y) => { const c = tex.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
    const W = BARRIER_HALF_W * 2;
    this.plateMat = new THREE.MeshStandardMaterial({
      map: rep(t.diff, W / 3.2, H / 3.2), normalMap: rep(t.nor, W / 3.2, H / 3.2), roughnessMap: rep(t.arm, W / 3.2, H / 3.2), metalnessMap: rep(t.arm, W / 3.2, H / 3.2),
      color: new THREE.Color(0.62, 0.58, 0.55), metalness: 1, roughness: 1, envMapIntensity: 1.2,
    });
    this.frameMat = new THREE.MeshStandardMaterial({
      map: rep(t.diff, 2, 2), normalMap: rep(t.nor, 2, 2), roughnessMap: rep(t.arm, 2, 2),
      color: new THREE.Color(0.32, 0.3, 0.29), metalness: 0.85, roughness: 1,
    });
    this.group = new THREE.Group();
    const plate = new THREE.Mesh(box(W, H, 0.14, 0, H / 2, 0), this.plateMat);
    plate.castShadow = plate.receiveShadow = true;
    this.group.add(plate);
    const parts = [];
    for (let x = -BARRIER_HALF_W + 1; x <= BARRIER_HALF_W - 0.9; x += 2.75) {
      parts.push(box(0.22, H - 0.05, 0.08, x, H / 2, 0.11));
      parts.push(box(0.07, H - 0.05, 0.16, x, H / 2, 0.19));
      parts.push(box(0.22, H - 0.05, 0.06, x, H / 2, 0.28));
      parts.push(box(0.2, H * 0.9, 0.2, x, H * 0.45, -0.17));
    }
    for (const y of [0.42, H - 0.42]) parts.push(box(W, 0.22, 0.14, 0, y, 0.12));
    parts.push(box(W + 0.2, 0.18, 0.5, 0, H + 0.04, 0));
    parts.push(box(W, 0.06, 0.62, 0, 0.18, 0.36, -0.55));
    parts.push(box(W, 0.32, 0.08, 0, 0.12, 0.62));
    const frame = new THREE.Mesh(mergeGeometries(parts), this.frameMat);
    frame.castShadow = frame.receiveShadow = true;
    this.group.add(frame);
    const boltGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6).rotateX(Math.PI / 2);
    const bolts = [];
    for (let x = -BARRIER_HALF_W + 0.3; x < BARRIER_HALF_W; x += 0.45) for (const y of [0.36, 0.48, H - 0.48, H - 0.36]) bolts.push([x, y]);
    const bim = new THREE.InstancedMesh(boltGeo, this.frameMat, bolts.length);
    const m = new THREE.Matrix4();
    bolts.forEach(([x, y], i) => bim.setMatrixAt(i, m.makeTranslation(x, y, 0.2)));
    this.group.add(bim);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.4, 0.05) });
    this.beacons = [];
    for (const x of [-14, 0, 14]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), this.beaconMat);
      b.position.set(x, H + 0.24, 0);
      this.group.add(b);
      this.beacons.push(b);
    }
    this.group.traverse((o) => o.layers.enable(1));
    scene.add(this.group);
    this.slots = [BARRIER_Z, BARRIER_STOP_Z].map((z) => this.makeSlot(scene, z, W));
    this.state = 'hidden';
    this.z = BARRIER_Z;
    this.y = HIDE;
    this.t = 0;
    this.speed = 6.2;
    this.events = { riseStart() {}, riseEnd() {}, arrive() {}, sunk() {} };
    this.apply();
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

  apply() {
    const gy = groundHeight(0, this.z) - 0.04;
    this.group.position.set(0, gy + this.y, this.z);
    this.group.visible = this.y > HIDE + 0.05;
    this.ph.setBarrier(gy + this.y, this.z);
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

  get up() { return this.state === 'up' || this.state === 'moving'; }
  get active() { return this.state !== 'hidden'; }

  update(dt, now) {
    this.t += dt;
    if (this.state === 'rising') {
      const k = Math.min(1, this.t / 2.4);
      const e = 1 - Math.pow(1 - k, 3);
      this.y = HIDE + (0 - HIDE) * e + Math.sin(this.t * 40) * 0.01 * (1 - k);
      if (k >= 1) { this.y = 0; this.state = 'up'; this.events.riseEnd(this); }
    } else if (this.state === 'moving') {
      const sp = this.speed * Math.min(1, this.t / 1.2);
      this.z = Math.min(BARRIER_STOP_Z, this.z + sp * dt);
      this.y = Math.sin(this.t * 13) * 0.012;
      if (this.z >= BARRIER_STOP_Z) { this.state = 'sinking'; this.t = 0; this.events.arrive(this); }
    } else if (this.state === 'sinking') {
      const k = Math.min(1, this.t / 0.55);
      this.y = HIDE * k * k;
      if (k >= 1) { this.state = 'hidden'; this.y = HIDE; this.z = BARRIER_Z; this.events.sunk(this); }
    }
    const on = this.state === 'moving' || this.state === 'rising';
    const pulse = on ? Math.max(0, Math.sin(now * 9)) : 0.15;
    this.beaconMat.color.setRGB(1 + pulse * 7, 0.35 + pulse * 2.2, 0.05 + pulse * 0.2);
    this.apply();
  }
}
