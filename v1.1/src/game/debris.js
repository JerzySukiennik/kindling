import * as THREE from 'three';
import { groundHeight, PIT, FIELD } from '../world/layout.js';

const _m = new THREE.Matrix4();
const _bm = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class Debris {
  constructor(physics, sticks) {
    this.ph = physics;
    this.R = physics.R;
    this.sticks = sticks;
    this.chunks = [];
    this.wave = null;
    this.onBurned = () => {};
    this.onLand = () => {};
  }

  spawn(parts, vel, spin, opts = {}) {
    if (!parts.length) return null;
    const center = new THREE.Vector3();
    let wsum = 0;
    for (const p of parts) {
      const w = p.radius * p.radius * p.a.distanceTo(p.b) + 1e-6;
      center.addScaledVector(_p.addVectors(p.a, p.b).multiplyScalar(0.5), w);
      wsum += w;
    }
    center.multiplyScalar(1 / wsum);
    const R = this.R;
    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
      .setLinearDamping(0.15)
      .setAngularDamping(0.35)
      .setCcdEnabled(true);
    const body = this.ph.world.createRigidBody(bd);
    const chunk = { body, parts: [], sticks: 0, state: 'phys', age: 0, burn: 0, mass: 0, autoFade: !!opts.autoFade };
    for (const p of parts) {
      _dir.subVectors(p.b, p.a);
      const len = _dir.length();
      _dir.multiplyScalar(1 / Math.max(len, 1e-6));
      _q.setFromUnitVectors(_up, _dir);
      if (p.twist) _q.multiply(_q2.setFromAxisAngle(_up, p.twist));
      const local = new THREE.Matrix4().compose(_p.subVectors(p.a, center), _q, _s);
      chunk.parts.push({ idx: p.idx, local, len, radius: p.radius });
      const r = Math.max(p.radius, 0.03);
      const half = Math.max(0.005, len / 2 - r * 0.5);
      const mid = _p2.copy(p.a).addScaledVector(_dir, len / 2).sub(center);
      const cd = R.ColliderDesc.capsule(half, r)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setDensity(650)
        .setFriction(0.85)
        .setRestitution(0.12);
      this.ph.world.createCollider(cd, body);
      chunk.sticks++;
    }
    chunk.mass = body.mass();
    this.chunks.push(chunk);
    this.applyChunk(chunk, true);
    return chunk;
  }

  bodyMatrix(chunk, out) {
    const t = chunk.body.translation();
    const r = chunk.body.rotation();
    return out.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s);
  }

  applyChunk(chunk, force = false) {
    if (chunk.state === 'phys') {
      if (!force && chunk.body.isSleeping()) return;
      this.bodyMatrix(chunk, _bm);
    } else {
      _bm.copy(chunk.matrix);
    }
    for (const part of chunk.parts) {
      _m.multiplyMatrices(_bm, part.local);
      this.sticks.setMatrix(part.idx, _m);
    }
  }

  chunkPos(chunk, out) {
    if (chunk.state === 'phys') {
      const t = chunk.body.translation();
      return out.set(t.x, t.y, t.z);
    }
    return out.setFromMatrixPosition(chunk.matrix);
  }

  get stickCount() {
    let n = 0;
    for (const c of this.chunks) if (c.state !== 'burnt') n += c.sticks;
    return n;
  }

  fieldCount() {
    let n = 0;
    for (const c of this.chunks) if (c.state === 'phys' && !c.autoFade) n += c.sticks;
    return n;
  }

  startWave(follow, speed, height, length, halfX) {
    this.wave = { z: follow(), follow, speed, height, length, halfX, t: 0 };
    for (const c of this.chunks) {
      if (c.state !== 'phys' || c.autoFade || c.dropped) continue;
      c.state = 'pending';
      c.matrix = this.bodyMatrix(c, new THREE.Matrix4());
      this.ph.world.removeRigidBody(c.body);
      c.body = null;
    }
  }

  waveProfile(dz) {
    const w = this.wave;
    if (!w || dz < 0 || dz > w.length) return 0;
    const u = dz / w.length;
    const s = u < 0.35 ? Math.sin((u / 0.35) * Math.PI * 0.5) : Math.cos(((u - 0.35) / 0.65) * Math.PI * 0.5);
    return w.height * Math.pow(Math.max(s, 0), 0.7);
  }

  update(dt, now) {
    const w = this.wave;
    if (w) {
      w.t += dt;
      w.z = w.follow ? w.follow() : w.z + w.speed * dt;
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.age += dt;
      if (c.state === 'phys' && c.autoFade && c.age > 4.5) {
        const k = Math.max(0, 1 - (c.age - 4.5) / 1.2);
        this.bodyMatrix(c, _bm);
        for (const part of c.parts) {
          _m.multiplyMatrices(_bm, part.local);
          _m.scale(_p.set(k, k, k));
          this.sticks.setMatrix(part.idx, _m);
        }
        if (k <= 0) this.removeChunk(i, false);
        continue;
      }
      if (c.state === 'phys') {
        this.applyChunk(c);
        if (c.inPit) {
          c.burn = Math.min(1, c.burn + dt * 0.18);
          for (const part of c.parts) this.sticks.setFire(part.idx, c.burn);
          if (c.burn >= 1) {
            c.fade = (c.fade || 0) + dt;
            const k = Math.max(0, 1 - c.fade / 2.5);
            this.bodyMatrix(c, _bm);
            for (const part of c.parts) {
              _m.multiplyMatrices(_bm, part.local);
              _m.scale(_p.set(k, 1, k));
              this.sticks.setMatrix(part.idx, _m);
            }
            if (c.fade > 2.5) this.removeChunk(i, true);
          }
        }
      } else if (c.state === 'pending' && w) {
        _p.setFromMatrixPosition(c.matrix);
        if (_p.z <= w.z + 0.4) {
          c.state = 'ride';
          c.ride = {
            x: THREE.MathUtils.clamp(_p.x * (w.halfX / Math.max(w.halfX, Math.abs(_p.x) + 0.01)), -w.halfX, w.halfX),
            dz: 0.15 + Math.random() * (w.length * 0.9),
            yk: Math.pow(Math.random(), 0.6),
            from: c.matrix.clone(),
            blend: 0,
            q0: new THREE.Quaternion().setFromRotationMatrix(c.matrix),
            axis: new THREE.Vector3(1, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6).normalize(),
            spin: 6 + Math.random() * 8,
            ang: 0,
          };
        }
      } else if (c.state === 'ride' && w) {
        const r = c.ride;
        r.blend = Math.min(1, r.blend + dt * 4.5);
        r.ang += r.spin * dt;
        const z = w.z - r.dz;
        const y = groundHeight(r.x, z) + 0.1 + this.waveProfile(r.dz) * r.yk + 0.05;
        _q.copy(r.q0).premultiply(_q2.setFromAxisAngle(r.axis, r.ang));
        _m.compose(_p.set(r.x, y, z), _q, _s);
        if (r.blend < 1) {
          const k = r.blend * r.blend * (3 - 2 * r.blend);
          _p2.setFromMatrixPosition(r.from).lerp(_p, k);
          _m.setPosition(_p2);
        }
        c.matrix.copy(_m);
        this.applyChunk(c);
        if (z > PIT.z0 + 0.6) this.dropInPit(c, w.speed);
      }
    }
    for (const c of this.chunks) {
      if (c.state === 'phys' && !c.inPit && c.dropped) {
        const t = c.body.translation();
        if (t.z > PIT.z0 && t.y < 0.2) { c.inPit = true; this.onLand(c); }
      }
    }
  }

  dropInPit(c, speed) {
    _p.setFromMatrixPosition(c.matrix);
    _q.setFromRotationMatrix(c.matrix);
    const R = this.R;
    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(_p.x, Math.max(_p.y, 0.4), _p.z)
      .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinvel((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, speed * (0.35 + Math.random() * 0.3))
      .setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 })
      .setAngularDamping(0.5)
      .setLinearDamping(0.3);
    c.body = this.ph.world.createRigidBody(bd);
    for (const part of c.parts) {
      _p2.setFromMatrixPosition(part.local);
      _q2.setFromRotationMatrix(part.local);
      const r = Math.max(part.radius, 0.03);
      const half = Math.max(0.005, part.len / 2 - r * 0.5);
      _dir.set(0, 1, 0).applyQuaternion(_q2);
      const mid = _p2.addScaledVector(_dir, part.len / 2);
      this.ph.world.createCollider(R.ColliderDesc.capsule(half, r).setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w }).setDensity(650).setFriction(0.9), c.body);
    }
    c.state = 'phys';
    c.dropped = true;
    c.ride = null;
  }

  removeChunk(i, burnt) {
    const c = this.chunks[i];
    if (c.body) this.ph.world.removeRigidBody(c.body);
    for (const part of c.parts) this.sticks.release(part.idx);
    this.chunks.splice(i, 1);
    if (burnt) this.onBurned(c);
  }

  endWave() {
    this.wave = null;
    for (const c of this.chunks) {
      if (c.state === 'ride' || c.state === 'pending') {
        c.matrix = c.matrix || new THREE.Matrix4();
        this.dropInPit(c, 6);
      }
    }
  }

  clearAll() {
    for (let i = this.chunks.length - 1; i >= 0; i--) this.removeChunk(i, false);
    this.wave = null;
  }
}
