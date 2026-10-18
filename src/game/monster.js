import * as THREE from 'three';
import { groundHeight, ZONE, FIELD } from '../world/layout.js';
import { mulberry32 } from '../world/noise.js';

export const TYPES = {
  twig: { hip: 0.8, thigh: 0.43, shin: 0.43, spine: 0.5, neck: 0.13, head: 0.12, shoulder: 0.15, hipW: 0.085, uarm: 0.36, farm: 0.36, rLimb: 0.019, rTorso: 0.03, speed: 2.35, stride: 0.72, bundle: 0, ribs: 2, spikes: 2, candy: 4, reach: 1.05, sticks: 'thin' },
  walker: { hip: 0.98, thigh: 0.52, shin: 0.52, spine: 0.62, neck: 0.16, head: 0.16, shoulder: 0.22, hipW: 0.12, uarm: 0.44, farm: 0.42, rLimb: 0.03, rTorso: 0.05, speed: 1.6, stride: 0.86, bundle: 1, ribs: 3, spikes: 4, candy: 7, reach: 1.25 },
  brute: { hip: 1.12, thigh: 0.62, shin: 0.6, spine: 0.88, neck: 0.18, head: 0.25, shoulder: 0.4, hipW: 0.2, uarm: 0.62, farm: 0.6, rLimb: 0.068, rTorso: 0.115, speed: 1.05, stride: 1.0, bundle: 2, ribs: 4, spikes: 7, candy: 15, reach: 1.6 },
  stilt: { hip: 1.72, thigh: 0.92, shin: 0.92, spine: 0.6, neck: 0.24, head: 0.15, shoulder: 0.2, hipW: 0.11, uarm: 0.64, farm: 0.62, rLimb: 0.028, rTorso: 0.042, speed: 2.0, stride: 1.4, bundle: 0, ribs: 2, spikes: 3, candy: 11, reach: 1.5, reverseKnee: true },
};

const UP = new THREE.Vector3(0, 1, 0);
const T1 = new THREE.Vector3();
const T2 = new THREE.Vector3();
const T3 = new THREE.Vector3();
const T4 = new THREE.Vector3();

const K1 = new THREE.Vector3();
const K2 = new THREE.Vector3();

function ik2(root, target, l1, l2, hint, outMid, outEnd) {
  K1.subVectors(target, root);
  let d = K1.length();
  const maxR = (l1 + l2) * 0.995;
  const minR = Math.abs(l1 - l2) + 0.01;
  if (d < 1e-5) { K1.set(0, -1, 0); d = 1e-5; } else K1.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, minR), maxR);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  K2.copy(hint).addScaledVector(K1, -hint.dot(K1));
  if (K2.lengthSq() < 1e-8) K2.set(0, 0, 1).addScaledVector(K1, -K1.z);
  K2.normalize();
  outEnd.copy(root).addScaledVector(K1, d);
  outMid.copy(root).addScaledVector(K1, a).addScaledVector(K2, h);
}

function rayCapsule(o, d, a, b, r) {
  T1.subVectors(b, a);
  T2.subVectors(o, a);
  const L2 = T1.lengthSq();
  const dd = d.dot(T1);
  const den = L2 - dd * dd;
  let s = 0;
  let t = 0;
  if (den > 1e-8) {
    s = (T1.dot(T2) * 1 - dd * d.dot(T2)) / den;
    s = Math.min(1, Math.max(0, s));
  }
  T3.copy(a).addScaledVector(T1, s);
  t = T4.subVectors(T3, o).dot(d);
  if (t < 0) return null;
  T4.copy(o).addScaledVector(d, t);
  const dist2 = T4.distanceToSquared(T3);
  if (dist2 > r * r) return null;
  return { s, t: t - Math.sqrt(Math.max(0, r * r - dist2)) };
}

let NEXT_ID = 1;

export class Monster {
  constructor(mgr, typeName, x, z, seed) {
    this.mgr = mgr;
    this.id = NEXT_ID++;
    this.type = typeName;
    this.T = TYPES[typeName];
    this.rand = mulberry32(seed);
    this.seed = seed;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = 0;
    this.speedNow = 0;
    this.alive = true;
    this.state = 'walk';
    this.attackT = 0;
    this.cooldown = 0;
    this.target = null;
    this.age = 0;
    this.wob = this.rand() * 100;
    this.twitch = { t: 0, dir: new THREE.Vector3(), next: 1 + this.rand() * 3 };
    this.lean = 0.12;
    this.j = {};
    for (const k of ['P', 'C', 'N', 'H', 'hip0', 'hip1', 'sh0', 'sh1', 'knee0', 'knee1', 'foot0', 'foot1', 'elb0', 'elb1', 'hand0', 'hand1']) this.j[k] = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.lat = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.headDir = new THREE.Vector3(0, 0, 1);
    this.legs = [0, 1].map((i) => ({ i, side: i ? 1 : -1, state: 'full', foot: new THREE.Vector3(), swing: null, phase: 0 }));
    this.arms = [0, 1].map((i) => ({ i, side: i ? 1 : -1, state: 'full', plant: new THREE.Vector3(), swing: null }));
    this.segs = [];
    this.build();
    this.initFeet();
    this.pose(0);
  }

  seg(def) {
    const s = {
      key: def.key, group: def.group, kind: def.kind || 'struct', a: def.a, b: def.b,
      frame: def.frame, la: def.la, lb: def.lb, r: def.r, taper: def.taper ?? 0.75,
      endA: def.endA ?? 0, endB: def.endB ?? 0, keep: 1, cutB: -1,
      A: new THREE.Vector3(), B: new THREE.Vector3(), idx: -1, attached: true,
      seed: this.rand(), heat: 0, hotT: 0.5, down: def.down || [], twist: this.rand() * 6.28,
    };
    s.idx = this.mgr.sticks.alloc();
    this.segs.push(s);
    return s;
  }

  build() {
    const T = this.T;
    const R = this.rand;
    const rl = T.rLimb;
    const rt = T.rTorso;
    this.seg({ key: 'torso', group: 'torso', a: 'P', b: 'C', r: rt, taper: 0.8 });
    for (let k = 0; k < T.bundle; k++) {
      const ang = (k / Math.max(1, T.bundle)) * Math.PI * 2 + R();
      const off = new THREE.Vector3(Math.cos(ang) * rt * 1.6, 0, Math.sin(ang) * rt * 1.6);
      this.seg({ key: 'bundle' + k, group: 'torso', kind: 'decor', frame: 'body', la: off.clone().setY(-0.05), lb: off.clone().multiplyScalar(0.6).setY(T.spine * (0.85 + R() * 0.25)), r: rt * 0.55, taper: 0.6, endA: 1, endB: 1 });
    }
    this.seg({ key: 'hipbar', group: 'torso', a: 'hip0', b: 'hip1', r: rt * 0.7, taper: 0.9 });
    this.seg({ key: 'shbar', group: 'torso', a: 'sh0', b: 'sh1', r: rt * 0.65, taper: 0.9 });
    for (let k = 0; k < T.ribs; k++) {
      const y = T.spine * (0.35 + (k / Math.max(1, T.ribs)) * 0.5);
      const w = T.shoulder * (0.8 + R() * 0.5);
      this.seg({ key: 'rib' + k, group: 'torso', kind: 'decor', frame: 'body', la: new THREE.Vector3(-w, y + (R() - 0.5) * 0.06, rt * 1.2), lb: new THREE.Vector3(w, y + (R() - 0.5) * 0.06, rt * 1.2), r: rl * 0.55, taper: 0.7, endA: 1, endB: 1 });
    }
    for (let k = 0; k < T.spikes; k++) {
      const y = T.spine * (0.5 + R() * 0.5);
      const sx = (R() - 0.5) * T.shoulder * 1.6;
      const len = 0.18 + R() * 0.35 * (T.head * 5);
      const dir = new THREE.Vector3((R() - 0.5) * 0.8, 0.5 + R() * 0.7, -0.6 - R() * 0.5).normalize();
      const a = new THREE.Vector3(sx, y, -rt);
      this.seg({ key: 'spike' + k, group: 'torso', kind: 'decor', frame: 'body', la: a, lb: a.clone().addScaledVector(dir, len), r: rl * (0.45 + R() * 0.3), taper: 0.3, endA: 0, endB: 1 });
    }
    this.seg({ key: 'neck', group: 'head', a: 'C', b: 'N', r: rt * 0.6, taper: 0.85 });
    const hr = T.head;
    const nest = 6 + Math.floor(R() * 3);
    for (let k = 0; k < nest; k++) {
      const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      const c = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(hr * 0.5);
      const half = hr * (0.9 + R() * 0.5);
      this.seg({ key: 'head' + k, group: 'head', kind: 'head', frame: 'head', la: c.clone().addScaledVector(d, -half), lb: c.clone().addScaledVector(d, half), r: Math.max(0.01, rl * (0.55 + R() * 0.35)), taper: 0.5, endA: 1, endB: 1 });
    }
    if (this.type === 'brute' || this.type === 'stilt') {
      for (const sd of [-1, 1]) {
        const a = new THREE.Vector3(sd * hr * 0.4, hr * 0.4, 0);
        const b = a.clone().add(new THREE.Vector3(sd * hr * 1.4, hr * 2.0, -hr * 0.6));
        this.seg({ key: 'antler' + sd, group: 'head', kind: 'head', frame: 'head', la: a, lb: b, r: rl * 0.6, taper: 0.3, endA: 0, endB: 1 });
      }
    }
    for (const L of this.legs) {
      const s = L.i;
      const toes = [];
      for (let k = 0; k < 2; k++) {
        const ang = (k - 0.5) * 0.7;
        toes.push(this.seg({ key: 'toe' + s + k, group: 'leg' + s, kind: 'decor', frame: 'foot' + s, la: new THREE.Vector3(0, 0.02, -0.03), lb: new THREE.Vector3(Math.sin(ang) * 0.17, 0.0, Math.cos(ang) * 0.17).multiplyScalar(1 + T.rLimb * 6), r: rl * 0.55, taper: 0.35, endA: 0, endB: 1 }));
      }
      const shin = this.seg({ key: 'shin' + s, group: 'leg' + s, a: 'knee' + s, b: 'foot' + s, r: rl * 0.9, taper: 0.7, endB: 0, down: toes });
      this.seg({ key: 'thigh' + s, group: 'leg' + s, a: 'hip' + s, b: 'knee' + s, r: rl * 1.1, taper: 0.85, down: [shin, ...toes] });
    }
    for (const A of this.arms) {
      const s = A.i;
      const fingers = [];
      for (let k = 0; k < 3; k++) {
        const ang = (k - 1) * 0.35;
        fingers.push(this.seg({ key: 'finger' + s + k, group: 'arm' + s, kind: 'decor', frame: 'hand' + s, la: new THREE.Vector3(0, -0.01, 0), lb: new THREE.Vector3(Math.sin(ang) * 0.06, 0.13 + R() * 0.06, Math.cos(ang) * 0.04).multiplyScalar(1 + T.rLimb * 8), r: rl * 0.45, taper: 0.3, endA: 0, endB: 1 }));
      }
      const farm = this.seg({ key: 'farm' + s, group: 'arm' + s, a: 'elb' + s, b: 'hand' + s, r: rl * 0.8, taper: 0.7, down: fingers });
      this.seg({ key: 'uarm' + s, group: 'arm' + s, a: 'sh' + s, b: 'elb' + s, r: rl * 0.95, taper: 0.85, down: [farm, ...fingers] });
    }
    const sk = this.mgr.sticks;
    for (const s of this.segs) {
      const len = s.frame ? s.la.distanceTo(s.lb) : this.restLen(s);
      sk.setShape(s.idx, s.r, len, s.taper, s.seed);
      sk.setEnds(s.idx, s.endA, s.endB);
      sk.setBurn(s.idx, 0.5, 0);
      sk.setFire(s.idx, 0);
    }
    this.eyeIdx = this.mgr.allocEyes();
  }

  restLen(s) {
    const T = this.T;
    switch (s.key.replace(/\d+$/, '')) {
      case 'torso': return T.spine;
      case 'hipbar': return T.hipW * 2;
      case 'shbar': return T.shoulder * 2;
      case 'neck': return T.neck;
      case 'thigh': return T.thigh;
      case 'shin': return T.shin;
      case 'uarm': return T.uarm;
      case 'farm': return T.farm;
      default: return 0.3;
    }
  }

  initFeet() {
    this.computeFrame();
    for (const L of this.legs) {
      L.foot.copy(this.pos).addScaledVector(this.lat, L.side * this.T.hipW * 1.3).addScaledVector(this.fwd, (L.i ? 0.2 : -0.2) * this.T.stride);
      L.foot.y = groundHeight(L.foot.x, L.foot.z);
    }
  }

  computeFrame() {
    this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.lat.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  get legsFull() { return this.legs.filter((l) => l.state === 'full').length; }
  get armsUsable() { return this.arms.filter((a) => a.state === 'full').length; }
  get crawling() { return this.legsFull === 0; }

  speedFactor() {
    const lf = this.legsFull;
    if (lf === 2) return 1;
    if (lf === 1) return 0.55;
    return this.armsUsable > 0 ? 0.36 : 0.08;
  }

  update(dt, now, players) {
    this.age += dt;
    if (!this.alive) return;
    const T = this.T;
    let target = null;
    let best = 1e9;
    for (const p of players) {
      if (!p.alive) continue;
      const d = p.pos.distanceToSquared(this.pos);
      if (d < best) { best = d; target = p; }
    }
    this.target = target;
    const dist = target ? Math.sqrt(best) : 1e9;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const goal = T3;
    if (target) {
      goal.copy(target.pos);
      if (this.pos.z < -6) {
        goal.x = THREE.MathUtils.lerp(this.pos.x, target.pos.x, 0.35) + Math.sin(this.age * 0.5 + this.wob) * 3;
        goal.z = Math.min(goal.z, this.pos.z + 10);
      }
    } else {
      goal.set(this.pos.x, 0, this.pos.z + 5);
    }
    const reach = T.reach * (this.crawling ? 0.75 : 1);
    if (this.state === 'walk') {
      if (target && dist < reach && this.armsUsable > 0 && this.cooldown <= 0) {
        this.state = 'attack';
        this.attackT = 0;
        this.mgr.onAttackStart(this, target);
      }
    }
    let desired = T.speed * this.speedFactor();
    if (this.state === 'attack') {
      desired = 0.2;
      this.attackT += dt;
      if (this.attackT > 0.62 && !this.attackDone) {
        this.attackDone = true;
        if (target && target.alive && target.pos.distanceTo(this.pos) < reach + 0.45 && this.armsUsable > 0) this.mgr.onGrab(this, target);
      }
      if (this.attackT > 1.1) { this.state = 'walk'; this.attackDone = false; this.cooldown = 0.6; }
    }
    if (target && dist < 0.75) desired = 0;
    const dx = goal.x - this.pos.x;
    const dz = goal.z - this.pos.z;
    const wantH = Math.atan2(dx, dz);
    let dh = wantH - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const turn = (this.crawling ? 1.2 : 2.6) * dt;
    this.heading += Math.max(-turn, Math.min(turn, dh));
    this.speedNow += (desired * (Math.abs(dh) > 1.2 ? 0.4 : 1) - this.speedNow) * Math.min(1, dt * 3);
    this.computeFrame();
    this.pos.addScaledVector(this.fwd, this.speedNow * dt);
    for (const o of this.mgr.monsters) {
      if (o === this || !o.alive) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const rr = 0.55 + (this.T.hipW + o.T.hipW) * 2;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5 * Math.min(1, dt * 8);
        this.pos.x += (ox / d) * push;
        this.pos.z += (oz / d) * push;
      }
    }
    for (const p of players) {
      if (!p.alive) continue;
      const ox = this.pos.x - p.pos.x;
      const oz = this.pos.z - p.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 0.5 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x += (ox / d) * (0.71 - d) * 0.5;
        this.pos.z += (oz / d) * (0.71 - d) * 0.5;
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, FIELD.x0 + 0.6, FIELD.x1 - 0.6);
    this.pos.z = Math.min(this.pos.z, ZONE.z1 - 0.4);
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.twitch.next -= dt;
    if (this.twitch.next <= 0) {
      this.twitch.next = 0.8 + this.rand() * 3.5;
      this.twitch.t = 0.25;
      this.twitch.dir.set(this.rand() - 0.5, (this.rand() - 0.5) * 0.6, this.rand() - 0.5).normalize();
    }
    this.twitch.t = Math.max(0, this.twitch.t - dt);
    this.pose(dt, now);
  }

  stepLimbs(dt, limbs, anchor, spread, stride, lift, isArm) {
    const sp = Math.max(this.speedNow, 0.25);
    for (const L of limbs) {
      const desired = T4.copy(anchor).addScaledVector(this.lat, L.side * spread).addScaledVector(this.fwd, this.speedNow * 0.22);
      desired.y = groundHeight(desired.x, desired.z);
      const plant = isArm ? L.plant : L.foot;
      if (!L.swing) {
        const other = limbs.find((o) => o !== L);
        const otherBusy = other && other.swing;
        const far = plant.distanceTo(desired) > stride * 0.55;
        if (far && !otherBusy) {
          const to = desired.clone().addScaledVector(this.fwd, stride * 0.42 * Math.min(1, this.speedNow / 0.8 + 0.2));
          to.y = groundHeight(to.x, to.z);
          L.swing = { from: plant.clone(), to, t: 0, dur: THREE.MathUtils.clamp((stride / sp) * 0.42, 0.16, 0.55) };
        }
      }
      if (L.swing) {
        const s = L.swing;
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = s.t * s.t * (3 - 2 * s.t);
        plant.lerpVectors(s.from, s.to, e);
        plant.y += Math.sin(Math.PI * s.t) * lift;
        if (s.t >= 1) {
          L.swing = null;
          plant.copy(s.to);
          if (!isArm) this.mgr.onStep(this, plant);
        }
      }
    }
  }

  pose(dt, now = 0) {
    const T = this.T;
    const j = this.j;
    const t = this.age;
    const legsFull = this.legs.filter((l) => l.state === 'full');
    const armsFull = this.arms.filter((a) => a.state === 'full');
    const crawl = legsFull.length === 0;
    if (crawl && !this.wasCrawl) {
      for (const A of this.arms) A.plant.copy(A.i ? j.hand1 : j.hand0).setY(groundHeight(A.plant.x, A.plant.z));
      for (const A of this.arms) A.plant.y = groundHeight(A.plant.x, A.plant.z);
    }
    this.wasCrawl = crawl;
    if (dt > 0) {
      if (!crawl) this.stepLimbs(dt, legsFull, this.pos, T.hipW * 1.25, T.stride * (legsFull.length === 1 ? 0.7 : 1), 0.08 + T.stride * 0.06, false);
      else if (armsFull.length) this.stepLimbs(dt, armsFull, T1.copy(this.pos).addScaledVector(this.fwd, T.spine * 0.9 + T.uarm * 0.6), T.shoulder * 1.1, T.uarm * 0.9, 0.12, true);
    }
    const targetLean = crawl ? 1.35 : this.state === 'attack' ? 0.45 + Math.sin(Math.min(1, this.attackT / 0.62) * Math.PI) * 0.25 : 0.12 + this.speedNow * 0.06;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 4);
    let pelvisH;
    let bob = 0;
    if (crawl) pelvisH = T.hipW * 0.6 + T.rTorso * 2 + 0.05;
    else {
      const sw = legsFull.some((l) => l.swing);
      bob = sw ? Math.sin(t * 9) * 0.02 : 0;
      let footAvg = 0;
      for (const l of legsFull) footAvg += l.foot.y;
      footAvg /= legsFull.length;
      const legH = (T.thigh + T.shin) * (legsFull.length === 1 ? 0.88 : 0.93);
      pelvisH = Math.max(0.2, footAvg - this.pos.y + legH * 0.97) - Math.abs(bob);
      if (legsFull.length === 1) pelvisH -= 0.05 + Math.abs(Math.sin(t * 7)) * 0.06;
    }
    j.P.copy(this.pos).addScaledVector(UP, pelvisH);
    const tilt = legsFull.length === 1 ? (this.legs[0].state === 'full' ? 0.18 : -0.18) : Math.sin(t * 2 + this.wob) * 0.04;
    this.up.copy(UP).applyAxisAngle(this.lat, this.lean).applyAxisAngle(this.fwd, tilt).normalize();
    if (this.twitch.t > 0) this.up.addScaledVector(this.twitch.dir, this.twitch.t * 0.5).normalize();
    j.C.copy(j.P).addScaledVector(this.up, T.spine);
    j.hip0.copy(j.P).addScaledVector(this.lat, -T.hipW);
    j.hip1.copy(j.P).addScaledVector(this.lat, T.hipW);
    j.sh0.copy(j.C).addScaledVector(this.lat, -T.shoulder).addScaledVector(this.up, -T.spine * 0.06);
    j.sh1.copy(j.C).addScaledVector(this.lat, T.shoulder).addScaledVector(this.up, -T.spine * 0.06);
    j.N.copy(j.C).addScaledVector(this.up, T.neck * 0.8).addScaledVector(this.fwd, T.neck * 0.5);
    const look = this.headDir;
    if (this.target) look.subVectors(this.target.head || this.target.pos, j.N).normalize();
    else look.copy(this.fwd);
    look.lerp(this.fwd, 0.4).normalize();
    if (this.twitch.t > 0) look.addScaledVector(this.twitch.dir, this.twitch.t * 2.2).normalize();
    j.H.copy(j.N).addScaledVector(look, T.head * 0.7).addScaledVector(this.up, T.head * 0.75);
    for (const L of this.legs) {
      const hip = L.i ? j.hip1 : j.hip0;
      const knee = L.i ? j.knee1 : j.knee0;
      const foot = L.i ? j.foot1 : j.foot0;
      if (L.state === 'full') {
        const hint = T1.copy(this.fwd).multiplyScalar(T.reverseKnee ? -1 : 1).addScaledVector(this.lat, L.side * 0.15);
        ik2(hip, L.foot, T.thigh, T.shin, hint, knee, foot);
      } else {
        const sw = Math.sin(t * 5 + L.i * 2) * 0.35;
        T2.copy(UP).multiplyScalar(-1).addScaledVector(this.fwd, 0.35 + sw).addScaledVector(this.lat, L.side * 0.2).normalize();
        knee.copy(hip).addScaledVector(T2, T.thigh);
        foot.copy(knee).addScaledVector(T2, T.shin);
        if (crawl) { knee.y = Math.max(knee.y, this.pos.y + 0.05); foot.y = Math.max(foot.y, this.pos.y + 0.03); }
      }
    }
    for (const A of this.arms) {
      const sh = A.i ? j.sh1 : j.sh0;
      const elb = A.i ? j.elb1 : j.elb0;
      const hand = A.i ? j.hand1 : j.hand0;
      if (A.state !== 'full') {
        const sw = Math.sin(t * 4 + A.i * 3) * 0.3;
        T2.copy(UP).multiplyScalar(-1).addScaledVector(this.fwd, 0.15 + sw).addScaledVector(this.lat, A.side * 0.25).normalize();
        elb.copy(sh).addScaledVector(T2, T.uarm);
        hand.copy(elb).addScaledVector(T2, T.farm);
        continue;
      }
      let tgt;
      if (crawl) tgt = A.plant;
      else if (this.state === 'attack' && this.target) {
        const k = Math.min(1, this.attackT / 0.62);
        tgt = T4.copy(this.target.head || this.target.pos);
        tgt.addScaledVector(this.lat, A.side * 0.18).addScaledVector(UP, (1 - k) * 0.9 - 0.25);
        T2.copy(sh).addScaledVector(this.fwd, 0.2).addScaledVector(UP, 0.6);
        tgt.lerpVectors(T2, tgt, k * k);
      } else {
        const swing = Math.sin(t * (2.2 + this.speedNow * 2) + A.i * Math.PI + this.wob) * 0.25;
        tgt = T4.copy(sh).addScaledVector(this.fwd, (T.uarm + T.farm) * (0.62 + swing * 0.5))
          .addScaledVector(UP, -T.uarm * 0.55 + Math.sin(t * 3.1 + A.i) * 0.08)
          .addScaledVector(this.lat, A.side * 0.12);
      }
      const hint = T1.copy(this.lat).multiplyScalar(A.side * 0.6).addScaledVector(UP, -0.6).addScaledVector(this.fwd, -0.4);
      ik2(sh, tgt, T.uarm, T.farm, hint, elb, hand);
    }
    this.updateSticks();
    this.updateEyes();
  }

  frameOf(name, origin, x, y, z) {
    const j = this.j;
    if (name === 'body') { origin.copy(j.P); x.copy(this.lat); y.copy(this.up); z.crossVectors(x, y); return; }
    if (name === 'head') { origin.copy(j.H); z.copy(this.headDir); x.crossVectors(UP, z).normalize(); y.crossVectors(z, x); return; }
    const side = name.endsWith('1') ? 1 : 0;
    if (name.startsWith('hand')) {
      origin.copy(side ? j.hand1 : j.hand0);
      y.subVectors(origin, side ? j.elb1 : j.elb0).normalize();
      x.copy(this.lat).addScaledVector(y, -this.lat.dot(y)).normalize();
      z.crossVectors(x, y);
      return;
    }
    origin.copy(side ? j.foot1 : j.foot0);
    z.copy(this.fwd);
    y.copy(UP);
    x.copy(this.lat);
  }

  updateSticks() {
    const sk = this.mgr.sticks;
    const o = this._o || (this._o = new THREE.Vector3());
    const fx = this._fx || (this._fx = new THREE.Vector3());
    const fy = this._fy || (this._fy = new THREE.Vector3());
    const fz = this._fz || (this._fz = new THREE.Vector3());
    let lastFrame = null;
    for (const s of this.segs) {
      if (!s.attached) continue;
      if (s.frame) {
        if (s.frame !== lastFrame) { this.frameOf(s.frame, o, fx, fy, fz); lastFrame = s.frame; }
        s.A.copy(o).addScaledVector(fx, s.la.x).addScaledVector(fy, s.la.y).addScaledVector(fz, s.la.z);
        s.B.copy(o).addScaledVector(fx, s.lb.x).addScaledVector(fy, s.lb.y).addScaledVector(fz, s.lb.z);
      } else {
        s.A.copy(this.j[s.a]);
        s.B.copy(this.j[s.b]);
      }
      if (s.keep < 1) s.B.lerpVectors(s.A, s.B, s.keep);
      const len = sk.placeAB(s.idx, s.A, s.B, s.twist);
      if (!s.frame) sk.setLength(s.idx, len);
    }
  }

  updateEyes() {
    const m = this.mgr;
    const headAttached = this.segs.find((s) => s.kind === 'head' && s.attached);
    if (!this.alive || !headAttached) { m.setEye(this.eyeIdx, null); m.setEye(this.eyeIdx + 1, null); return; }
    const j = this.j;
    const z = this.headDir;
    const x = T1.crossVectors(UP, z).normalize();
    const hr = this.T.head;
    const blink = (Math.sin(this.age * 0.7 + this.wob) > 0.985) ? 0.15 : 1;
    for (let k = 0; k < 2; k++) {
      T2.copy(j.H).addScaledVector(x, (k ? 1 : -1) * hr * 0.32).addScaledVector(z, hr * 0.62).addScaledVector(UP, hr * 0.08);
      m.setEye(this.eyeIdx + k, T2, Math.max(0.012, hr * 0.13) * blink);
    }
  }

  raycast(o, d, maxT) {
    let best = null;
    for (const s of this.segs) {
      if (!s.attached) continue;
      const r = Math.max(s.r * 1.15, 0.03);
      const h = rayCapsule(o, d, s.A, s.B, r);
      if (h && h.t < maxT && (!best || h.t < best.t)) best = { seg: s, s: h.s, t: h.t, monster: this };
    }
    return best;
  }

  bounds(out) {
    out.center.copy(this.j.P).lerp(this.j.C, 0.3);
    out.radius = this.T.hip + this.T.spine + 0.8;
    return out;
  }

  cut(seg, at, now) {
    if (!seg.attached || !this.alive) return null;
    const sk = this.mgr.sticks;
    const lenNow = seg.A.distanceTo(seg.B);
    const fullLen = lenNow / Math.max(seg.keep, 1e-3);
    at = THREE.MathUtils.clamp(at, 0.08, 0.92);
    const P = new THREE.Vector3().lerpVectors(seg.A, seg.B, at);
    const r0 = seg.r;
    const rCut = r0 * THREE.MathUtils.lerp(1, seg.taper, at * seg.keep);
    const newIdx = sk.alloc();
    const parts = [];
    if (newIdx >= 0) {
      sk.setShape(newIdx, rCut, lenNow * (1 - at), seg.taper / Math.max(0.2, THREE.MathUtils.lerp(1, seg.taper, at)), this.rand());
      sk.setEnds(newIdx, 2, seg.keep < 1 ? 2 : seg.endB, now, seg.keep < 1 ? seg.cutB : -1);
      sk.setBurn(newIdx, 0.5, 0);
      sk.setFire(newIdx, 0);
      parts.push({ idx: newIdx, a: P.clone(), b: seg.B.clone(), radius: rCut, twist: seg.twist });
    }
    seg.keep *= at;
    seg.cutB = now;
    sk.setShape(seg.idx, r0, fullLen * seg.keep, THREE.MathUtils.lerp(1, seg.taper, seg.keep), seg.seed);
    sk.setEnds(seg.idx, seg.endA, 2, -1, now);
    sk.setBurn(seg.idx, 0.5, 0);
    const result = { point: P, kill: false, parts: [] };
    const k = seg.key.replace(/\d+$/, '');
    if (seg.kind === 'decor') {
      result.decor = true;
      this.mgr.spawnDebris(parts, this, 0.6);
      return result;
    }
    const detach = (list) => {
      for (const d of list) {
        if (!d.attached) continue;
        d.attached = false;
        parts.push({ idx: d.idx, a: d.A.clone(), b: d.B.clone(), radius: d.r, twist: d.twist });
      }
    };
    if (k === 'thigh' || k === 'shin') {
      const L = this.legs[seg.key.endsWith('1') ? 1 : 0];
      L.state = k === 'thigh' ? 'none' : (L.state === 'none' ? 'none' : 'short');
      L.swing = null;
      detach(seg.down);
      this.mgr.spawnDebris(parts, this, 1.0);
      result.limb = 'leg';
    } else if (k === 'uarm' || k === 'farm') {
      const A = this.arms[seg.key.endsWith('1') ? 1 : 0];
      A.state = k === 'uarm' ? 'none' : (A.state === 'none' ? 'none' : 'short');
      A.swing = null;
      detach(seg.down);
      this.mgr.spawnDebris(parts, this, 1.0);
      result.limb = 'arm';
      if (this.state === 'attack' && this.armsUsable === 0) this.state = 'walk';
    } else {
      this.mgr.spawnDebris(parts, this, 1.4);
      result.kill = true;
      this.die(now, k === 'torso' ? 'torso' : 'head');
    }
    return result;
  }

  die(now, how) {
    if (!this.alive) return;
    this.alive = false;
    const groups = new Map();
    for (const s of this.segs) {
      if (!s.attached) continue;
      s.attached = false;
      const g = s.group;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ idx: s.idx, a: s.A.clone(), b: s.B.clone(), radius: s.r, twist: s.twist });
    }
    for (const [g, parts] of groups) this.mgr.spawnDebris(parts, this, g === 'head' && how === 'head' ? 2.2 : 0.9);
    this.mgr.setEye(this.eyeIdx, null);
    this.mgr.setEye(this.eyeIdx + 1, null);
    this.mgr.onDeath(this, how);
  }
}

export class MonsterManager {
  constructor(scene, sticks, debris) {
    this.sticks = sticks;
    this.debris = debris;
    this.monsters = [];
    this.eyeCap = 160;
    this.eyeFree = [];
    for (let i = this.eyeCap - 2; i >= 0; i -= 2) this.eyeFree.push(i);
    const eg = new THREE.SphereGeometry(1, 10, 8);
    const em = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.4, 0.5) });
    this.eyes = new THREE.InstancedMesh(eg, em, this.eyeCap);
    this.eyes.frustumCulled = false;
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.eyeCap; i++) this.eyes.setMatrixAt(i, zero);
    scene.add(this.eyes);
    this._em = new THREE.Matrix4();
    this._zero = zero;
    this.handlers = { attackStart() {}, grab() {}, death() {}, step() {} };
    this._b = { center: new THREE.Vector3(), radius: 0 };
    this._v = new THREE.Vector3();
  }

  allocEyes() { return this.eyeFree.length ? this.eyeFree.pop() : 0; }

  setEye(i, pos, r = 0) {
    if (!pos) this.eyes.setMatrixAt(i, this._zero);
    else this.eyes.setMatrixAt(i, this._em.makeScale(r, r, r).setPosition(pos));
  }

  spawn(type, x, z, seed) {
    const m = new Monster(this, type, x, z, seed);
    m.heading = 0;
    this.monsters.push(m);
    return m;
  }

  spawnDebris(parts, m, energy) {
    if (!parts.length) return;
    const v = this._v.copy(m.fwd).multiplyScalar(m.speedNow * 0.8);
    v.x += (Math.random() - 0.5) * energy * 1.6;
    v.y += 0.6 + Math.random() * energy * 1.4;
    v.z += (Math.random() - 0.5) * energy * 1.6;
    const spin = new THREE.Vector3((Math.random() - 0.5) * 6 * energy, (Math.random() - 0.5) * 6 * energy, (Math.random() - 0.5) * 6 * energy);
    this.debris.spawn(parts, v, spin);
  }

  onAttackStart(m, p) { this.handlers.attackStart(m, p); }
  onGrab(m, p) { this.handlers.grab(m, p); }
  onDeath(m, how) { this.handlers.death(m, how); }
  onStep(m, at) { this.handlers.step(m, at); }

  get aliveCount() { return this.monsters.filter((m) => m.alive).length; }

  update(dt, now, players) {
    for (const m of this.monsters) m.update(dt, now, players);
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (!m.alive && m.age > 0) {
        this.eyeFree.push(m.eyeIdx);
        this.monsters.splice(i, 1);
      }
    }
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  raycast(o, d, maxT) {
    let best = null;
    const b = this._b;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.bounds(b);
      T1.subVectors(b.center, o);
      const tc = T1.dot(d);
      const d2 = T1.lengthSq() - tc * tc;
      if (d2 > b.radius * b.radius || tc < -b.radius) continue;
      const h = m.raycast(o, d, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  clear() {
    for (const m of this.monsters) {
      for (const s of m.segs) if (s.attached) this.sticks.release(s.idx);
      this.setEye(m.eyeIdx, null);
      this.setEye(m.eyeIdx + 1, null);
      this.eyeFree.push(m.eyeIdx);
    }
    this.monsters.length = 0;
  }
}
