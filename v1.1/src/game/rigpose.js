// Procedural posing for the Jurek.Rig skeleton: world-space IK for legs and arms, spine/neck distribution, finger curl, eye gaze.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const _m = new THREE.Matrix4(), _a = V(), _b = V(), _c = V(), _q = Q(), _q2 = Q(), _q3 = Q();
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export class Pose {
  constructor(charRoot, bones) {
    this.root = charRoot; this.bones = bones;
    this.rest = new Map(); this.restW = new Map();
    this.eyes = [];
  }

  captureRest() {
    this.root.updateMatrixWorld(true);
    for (const [n, b] of this.bones) {
      this.rest.set(n, {p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone()});
    }
    this.root.updateMatrixWorld(true);
    for (const [n, b] of this.bones) this.restW.set(n, {p: b.getWorldPosition(V()), q: b.getWorldQuaternion(Q())});
    for (const n of ['LeftEye', 'RightEye']) {
      const b = this.bones.get(n); if (!b) continue;
      const wq = this.restW.get(n).q;
      this.eyes.push({b, name: n, rest: b.quaternion.clone(), axis: Z.clone().applyQuaternion(wq.clone().invert())});
    }
    const d = (a, b) => this.restW.get(a).p.distanceTo(this.restW.get(b).p);
    this.len = {};
    for (const s of ['Left', 'Right']) {
      this.len[s] = {leg1: d(s + 'UpLeg', s + 'Leg'), leg2: d(s + 'Leg', s + 'Foot'), arm1: d(s + 'Arm', s + 'ForeArm'), arm2: d(s + 'ForeArm', s + 'Hand')};
    }
  }

  reset() {
    for (const [n, r] of this.rest) { const b = this.bones.get(n); b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
    this.root.updateMatrixWorld(true);
  }

  upd(b) { b.updateWorldMatrix(true, true); }
  wq(b, out = Q()) { return b.getWorldQuaternion(out); }
  wp(b, out = V()) { return b.getWorldPosition(out); }

  setWorldQuat(b, qw) {
    const pq = b.parent.getWorldQuaternion(_q3).invert();
    b.quaternion.copy(pq.multiply(qw));
    this.upd(b);
  }

  rotateWorld(b, axis, ang) {
    const cur = this.wq(b); _q2.setFromAxisAngle(axis, ang);
    this.setWorldQuat(b, _q2.multiply(cur));
  }

  aim(b, child, want) {
    const bp = this.wp(b, _a), cp = this.wp(child, _b);
    const cur = _c.subVectors(cp, bp).normalize();
    const w = want.clone().normalize();
    const sw = Q().setFromUnitVectors(cur, w);
    this.setWorldQuat(b, sw.multiply(this.wq(b)));
  }

  setHips(pos, pitch = 0, yaw = 0, roll = 0) {
    const b = this.bones.get('Hips'), r = this.restW.get('Hips');
    const rot = Q().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    this.setWorldQuat(b, rot.multiply(r.q.clone()));
    b.position.copy(b.parent.worldToLocal(pos.clone()));
    this.upd(b);
  }

  spine(pitch, yaw = 0, roll = 0, w = [0.28, 0.34, 0.38]) {
    const names = ['Spine', 'Spine1', 'Spine2'];
    names.forEach((n, i) => {
      const b = this.bones.get(n);
      this.rotateWorld(b, X, pitch * w[i]);
      if (yaw) this.rotateWorld(b, Y, yaw * w[i]);
      if (roll) this.rotateWorld(b, Z, roll * w[i]);
    });
  }

  neckHead(pitch, yaw = 0, roll = 0, neckShare = 0.35) {
    const nb = this.bones.get('Neck'), hb = this.bones.get('Head');
    this.rotateWorld(nb, X, pitch * neckShare); this.rotateWorld(hb, X, pitch * (1 - neckShare));
    if (yaw) { this.rotateWorld(nb, Y, yaw * 0.4); this.rotateWorld(hb, Y, yaw * 0.6); }
    if (roll) { this.rotateWorld(nb, Z, roll * 0.4); this.rotateWorld(hb, Z, roll * 0.6); }
  }

  twoBone(b1, b2, b3, target, pole, L1, L2, stretch = 0.999) {
    const P = this.wp(b1, V());
    const dv = target.clone().sub(P); let d = dv.length();
    const lo = Math.abs(L1 - L2) + 1e-3, hi = (L1 + L2) * stretch;
    const dc = Math.min(hi, Math.max(lo, d));
    const dir = dv.normalize();
    const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pc = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pc.lengthSq() < 1e-8) pc.set(0, 0, 1);
    pc.normalize();
    const K = P.clone().addScaledVector(dir, a).addScaledVector(pc, h);
    const endT = P.clone().addScaledVector(dir, dc);
    this.aim(b1, b2, K.clone().sub(P));
    this.aim(b2, b3, endT.clone().sub(this.wp(b2, V())));
    return {knee: K, reached: d <= hi + 1e-3};
  }

  leg(side, ankle, pole, footPitch = 0, footYaw = 0, toePitch = 0) {
    const L = this.len[side];
    const r = this.twoBone(this.bones.get(side + 'UpLeg'), this.bones.get(side + 'Leg'), this.bones.get(side + 'Foot'), ankle, pole, L.leg1, L.leg2);
    const fb = this.bones.get(side + 'Foot');
    const rot = Q().setFromEuler(new THREE.Euler(footPitch, footYaw, 0, 'YXZ'));
    this.setWorldQuat(fb, rot.multiply(this.restW.get(side + 'Foot').q.clone()));
    if (toePitch) { const tb = this.bones.get(side + 'ToeBase'); if (tb) this.rotateWorld(tb, X, toePitch); }
    return r;
  }

  frameQuat(fingers, normal) {
    const f = fingers.clone().normalize();
    const n = normal.clone().sub(f.clone().multiplyScalar(normal.dot(f))).normalize();
    const x = f.clone().cross(n).normalize();
    _m.makeBasis(x, f, n);
    return Q().setFromRotationMatrix(_m);
  }

  arm(side, wrist, pole, fingers, normal) {
    const L = this.len[side];
    const r = this.twoBone(this.bones.get(side + 'Arm'), this.bones.get(side + 'ForeArm'), this.bones.get(side + 'Hand'), wrist, pole, L.arm1, L.arm2, 0.995);
    if (fingers) this.setWorldQuat(this.bones.get(side + 'Hand'), this.frameQuat(fingers, normal));
    return r;
  }

  curl(side, amounts) {
    const names = {Thumb: 'Thumb', Index: 'Index', Middle: 'Middle', Ring: 'Ring', Little: 'Little'};
    for (const f in names) {
      const k = amounts[f] ?? amounts.all ?? 0;
      for (let i = 1; i <= 3; i++) {
        const b = this.bones.get(`${side}Hand${f}${i}`); if (!b) continue;
        const r = this.rest.get(`${side}Hand${f}${i}`);
        const base = f === 'Thumb' ? 0.55 : 1.0;
        b.quaternion.copy(r.q).multiply(_q.setFromAxisAngle(X, k * base * (i === 1 && f !== 'Thumb' ? 0.9 : 1.05)));
      }
    }
  }

  gaze(dirWorld, maxDeg = 26) {
    this.root.updateMatrixWorld(true);
    for (const e of this.eyes) {
      const b = e.b;
      const pq = b.parent.getWorldQuaternion(_q2);
      const wrest = pq.clone().multiply(e.rest);
      const g0 = e.axis.clone().applyQuaternion(wrest).normalize();
      const want = dirWorld.clone().normalize();
      const full = g0.angleTo(want) || 1e-6, ang = Math.min(full, THREE.MathUtils.degToRad(maxDeg));
      const dq = Q().setFromUnitVectors(g0, want), sl = Q().slerp(dq, ang / full);
      b.quaternion.copy(pq.clone().invert().multiply(sl).multiply(wrest));
    }
  }
}
