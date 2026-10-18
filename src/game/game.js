import * as THREE from 'three';
import { groundHeight, SPAWN_Z, BARRIER_Z, BARRIER_STOP_Z, PIT, BARRIER_HALF_W, FIELD } from '../world/layout.js';
import { U } from '../world/globals.js';
import { TYPES } from './monster.js';
import { GRAVITY, JUMP_V } from './player.js';

const CANDY_KEY = 'kindling.candy';
const BEST_KEY = 'kindling.best';

function load(key, def) {
  try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
}

function candyGeometry() {
  const pts = [[0.0, 0], [0.42, 0.0], [0.5, 0.06], [0.47, 0.3], [0.36, 0.62], [0.2, 0.88], [0.06, 1.0], [0.0, 1.02]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  g.scale(1, 1, 0.62);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.34) c.setRGB(1.0, 0.72, 0.08);
    else if (y < 0.68) c.setRGB(1.0, 0.33, 0.02);
    else c.setRGB(1.0, 0.95, 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, -0.5, 0);
  g.computeVertexNormals();
  return g;
}

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.players = [this.player];
    this.phase = 'menu';
    this.time = 0;
    this.round = 0;
    this.timer = 0;
    this.queue = [];
    this.spawnT = 0;
    this.lastSpawn = null;
    this.barrierPending = false;
    this.sweepDelay = -1;
    this.hot = new Set();
    this.gunHeat = 0;
    this.overheat = false;
    this.firing = false;
    this.bank = load(CANDY_KEY, 0);
    this.best = load(BEST_KEY, 0);
    this.candy = 0;
    this.stats = { sticks: 0, kills: 0, cuts: 0 };
    this.fxAcc = 0;
    this.bot = false;
    this.camRay = new THREE.Vector3();
    this.muzzle = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.candyFx = [];
    const cg = candyGeometry();
    const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, emissive: 0xff8a20, emissiveIntensity: 0.25 });
    this.candyMesh = new THREE.InstancedMesh(cg, cm, 160);
    this.candyMesh.frustumCulled = false;
    this.candyMesh.count = 0;
    this.candyMesh.castShadow = false;
    this.scene.add(this.candyMesh);
    this.events = { gameover() {}, candy() {} };
    this.wireHandlers();
  }

  wireHandlers() {
    const M = this.monsters;
    M.handlers.attackStart = (m) => { this.audio.creak(m.j.H); };
    M.handlers.grab = (m, p) => this.killPlayer(p, 'grab', m);
    M.handlers.death = (m) => {
      this.stats.kills++;
      this.giveCandy(TYPES[m.type].candy, m.j.C, true);
      this.audio.snap(m.j.C, 1);
      this.audio.knock(m.j.P, 0.6);
    };
    M.handlers.step = (m, at) => { if (Math.random() < 0.35) this.audio.knock(at, 0.12 + m.T.rLimb * 3); };
    this.barrier.events.riseStart = () => {
      this.audio.rumble(this._v.set(0, 1, BARRIER_Z), 2.6, 1);
      this.player.shake = Math.max(this.player.shake, 0.55);
      this.hud.message('No more are coming', 'Cut them all down', 3);
    };
    this.barrier.events.riseEnd = () => {
      for (let x = -BARRIER_HALF_W; x <= BARRIER_HALF_W; x += 2) this.particles.dust(this._v.set(x, groundHeight(x, BARRIER_Z) + 0.1, BARRIER_Z + 0.5), 2, 1.2, 1.2);
    };
    this.barrier.events.arrive = () => this.launchWave();
    this.debris.onBurned = (c) => {
      this.bonfire.feed(c.sticks);
      this.stats.sticks += c.sticks;
    };
    this.debris.onLand = (c) => {
      const p = this.debris.chunkPos(c, this._v);
      this.particles.embers(p, 6, 0.6, 2.2);
      this.particles.sparks(p, null, 6, null, 3);
      this.audio.knock(p, 0.3);
    };
    this.player.onStep = (p) => this.audio.step(p, 0.22);
    this.player.onJump = () => this.audio.noiseHit(null, { vol: 0.25, f: 700, q: 0.8, dur: 0.12, reverb: 0.05 });
    this.player.onLand = (v) => this.audio.step(this.player.pos, 0.2 + v * 0.04);
  }

  lightning(s) {
    this.flash = Math.max(this.flash || 0, s);
    this.flashAge = 0;
  }

  newGame(introHit = null) {
    this.introSync = introHit;
    this.monsters.clear();
    this.debris.clearAll();
    this.bonfire.reset();
    for (const s of this.hot) s.heat = 0;
    this.hot.clear();
    this.round = 0;
    this.candy = 0;
    this.stats = { sticks: 0, kills: 0, cuts: 0 };
    this.gunHeat = 0;
    this.overheat = false;
    this.player.reset();
    this.barrier.state = 'hidden';
    this.barrier.y = -3.7;
    this.barrier.z = BARRIER_Z;
    this.queue = [];
    this.lastSpawn = null;
    this.sweepDelay = -1;
    this.barrierPending = false;
    this.nextRound(true);
  }

  nextRound(first = false) {
    this.round++;
    this.phase = 'intermission';
    this.timer = first ? (this.introSync ? this.introSync + 1.5 : 7) : 6;
    this.hud.setRound(this.round);
    for (const p of this.players) if (!p.alive) { p.setGhost(false); p.pos.set(0, groundHeight(0, 6), 6); }
    this.hud.ghost(false);
    this.renderer.final.uniforms.uGhost.value = 0;
    if (!first) this.hud.message(`Round ${this.round}`, 'Get ready', 2.6);
    else this.hud.message('Kindling', 'Hold left mouse to burn them', 3.2);
  }

  buildQueue(r) {
    const n = Math.min(42, 3 + r * 2 + Math.floor((r * r) / 7));
    const interval = Math.max(0.55, 3.0 - r * 0.22);
    const q = [];
    let t = 0.5;
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      let type = 'twig';
      if (r >= 2 && x < 0.55) type = 'walker';
      if (r >= 1 && x < 0.3) type = 'walker';
      if (r >= 3 && x < 0.16 + r * 0.015) type = 'brute';
      if (r >= 4 && x > 0.86) type = 'stilt';
      if (r === 1 && i === 0) type = 'walker';
      q.push({ type, at: t });
      t += interval * (0.6 + Math.random() * 0.8);
    }
    return q;
  }

  update(dt, input, mouse) {
    this.time += dt;
    const now = this.time;
    const hit = this.audio.ready ? this.audio.musicTransient(dt) : 0;
    if (hit > 0 && !this.introSync && this.phase !== 'gameover') this.lightning(0.3 + hit * 0.45);
    this.flashAge = (this.flashAge || 0) + dt;
    this.flash = Math.max(0, (this.flash || 0) - dt * 1.6);
    const fl = this.flash * (this.flashAge < 0.25 ? 0.55 + 0.45 * Math.sin(this.flashAge * 70) : 1);
    this.lightningLevel = Math.max(0, fl);
    const playing = this.phase !== 'menu' && this.phase !== 'gameover';
    const control = playing && input.locked && this.player.alive || (playing && this.bot && this.player.alive);
    if (playing) {
      if (this.bot) this.botControl(dt, mouse);
      this.player.update(dt, input, mouse, playing && (input.locked || this.bot));
    }
    this.phaseUpdate(dt, now);
    this.monsters.update(dt, now, this.players);
    this.updateLaser(dt, now, control && (input.fire || this.botFire));
    this.debris.update(dt, now);
    this.barrier.update(dt, now);
    this.updateWaveKill();
    this.updateCandyFx(dt);
    this.updatePushers();
    this.hud.setCandy(this.candy);
    this.hud.setHeat(this.gunHeat, this.overheat);
  }

  phaseUpdate(dt, now) {
    const alive = this.monsters.aliveCount;
    switch (this.phase) {
      case 'intermission': {
        this.timer -= dt;
        if (this.introSync) {
          this.hud.setStatus('');
          const mt = this.audio.musicTime;
          if ((mt !== null && mt >= this.introSync) || this.timer <= 0) {
            this.introSync = null;
            this.lightning(1);
            this.player.shake = Math.max(this.player.shake, 0.5);
            this.startRound(false);
          }
        } else {
          this.hud.setStatus(`Next round in ${Math.max(0, Math.ceil(this.timer))}`);
          if (this.timer <= 0) this.startRound(true);
        }
        break;
      }
      case 'spawning': {
        this.spawnT += dt;
        while (this.queue.length && this.queue[0].at <= this.spawnT) {
          const s = this.queue.shift();
          const x = (Math.random() - 0.5) * 2 * (FIELD.x1 - 4);
          this.lastSpawn = this.monsters.spawn(s.type, x, SPAWN_Z - Math.random() * 3, Math.floor(Math.random() * 1e9));
          if (Math.random() < 0.5) this.audio.creak(this.lastSpawn.pos);
        }
        this.hud.setStatus(`${alive + this.queue.length} left`);
        if (!this.queue.length) { this.phase = 'fight'; this.barrierPending = true; }
        break;
      }
      case 'fight': {
        this.hud.setStatus(alive ? `${alive} left` : '');
        if (this.barrierPending) {
          const ls = this.lastSpawn;
          if (!ls || !ls.alive || ls.pos.z > BARRIER_Z + 2.8) { this.barrier.rise(); this.barrierPending = false; }
        }
        if (!this.barrierPending && this.barrier.state === 'up' && alive === 0) {
          if (this.sweepDelay < 0) this.sweepDelay = 1.4;
          this.sweepDelay -= dt;
          if (this.sweepDelay <= 0) {
            this.sweepDelay = -1;
            this.phase = 'sweep';
            this.barrier.go();
            this.hud.message('Here it comes', this.round === 1 ? 'Jump over the wave with Space' : '', 3);
            this.audio.rumble(this._v.set(0, 1, -30), 9, 0.8);
          }
        }
        break;
      }
      case 'sweep': {
        const d = BARRIER_STOP_Z - this.barrier.z;
        this.hud.setStatus(d > 0 ? `${Math.ceil(d)} m` : '');
        this.player.shake = Math.max(this.player.shake, 0.18 + Math.max(0, 1 - d / 40) * 0.35);
        break;
      }
      case 'wave': {
        const w = this.debris.wave;
        if (w && w.z > PIT.z1 + w.length + 1.5) {
          this.debris.endWave();
          this.phase = 'burn';
          this.timer = 3.2;
        }
        break;
      }
      case 'burn': {
        this.timer -= dt;
        this.hud.setStatus('');
        if (this.timer <= 0) {
          const bonus = this.round * 10;
          this.giveCandy(bonus, null, false);
          this.hud.message(`Round ${this.round} survived`, `+${bonus} candy corn`, 2.6);
          this.audio.chime();
          if (this.round > this.best) { this.best = this.round; save(BEST_KEY, this.best); }
          this.nextRound();
        }
        break;
      }
      default: break;
    }
  }

  startRound(bell) {
    this.phase = 'spawning';
    this.queue = this.buildQueue(this.round);
    this.total = this.queue.length;
    this.spawnT = 0;
    if (bell) this.audio.bell(Math.min(3, 1 + Math.floor(this.round / 4)));
    this.hud.message(`Round ${this.round}`, `${this.total} are coming`, 2.8);
  }

  launchWave() {
    const pile = this.debris.fieldCount();
    let front = BARRIER_STOP_Z + 0.6;
    for (const c of this.debris.chunks) {
      if (c.state !== 'phys') continue;
      const p = this.debris.chunkPos(c, this._v);
      if (p.z < 1.5 && p.z > front - 2) front = Math.max(front, p.z + 0.3);
    }
    const height = THREE.MathUtils.clamp(0.42 + pile * 0.0055, 0.45, 1.2);
    const length = THREE.MathUtils.clamp(1.5 + pile * 0.012, 1.6, 3.4);
    const speed = 8.6;
    this.debris.startWave(front, speed, height, length);
    this.phase = 'wave';
    this.player.shake = Math.max(this.player.shake, 0.8);
    this.audio.whoosh(1);
    this.audio.knock(this._v.set(0, 0.5, front), 1);
    for (let x = -BARRIER_HALF_W + 1; x < BARRIER_HALF_W; x += 1.5) {
      this.particles.sparks(this._v.set(x, groundHeight(x, BARRIER_STOP_Z) + 0.05, BARRIER_STOP_Z), null, 3, null, 3);
      this.particles.dust(this._v, 1, 0.8, 0.9);
    }
  }

  updateWaveKill() {
    const w = this.debris.wave;
    if (!w || this.phase !== 'wave') return;
    for (const p of this.players) {
      if (!p.alive) continue;
      const dz = w.z - p.pos.z;
      if (dz < 0 || dz > w.length) continue;
      const hp = this.debris.waveProfile(dz);
      const feet = p.pos.y - groundHeight(p.pos.x, p.pos.z);
      if (feet < hp * 0.78 - 0.05) this.killPlayer(p, 'wave');
    }
    for (let i = 0; i < 3; i++) {
      const x = (Math.random() - 0.5) * 2 * (FIELD.x1 - 1);
      this.particles.dust(this._v.set(x, groundHeight(x, w.z) + 0.1, w.z), 1, 0.5, 0.7);
    }
  }

  killPlayer(p, how, m) {
    if (!p.alive) return;
    p.setGhost(true);
    this.audio.scream();
    this.particles.dust(p.pos, 10, 0.8, 1.0);
    p.shake = 1;
    if (p === this.player) {
      this.hud.ghost(true);
      this.renderer.final.uniforms.uGhost.value = 1;
    }
    if (this.players.every((q) => !q.alive)) {
      this.phase = 'gameover';
      this.bank += this.candy;
      save(CANDY_KEY, this.bank);
      if (this.round - 1 > this.best) { this.best = this.round - 1; save(BEST_KEY, this.best); }
      setTimeout(() => this.events.gameover(this), 2200);
    }
  }

  giveCandy(n, at, burst) {
    this.candy += n;
    this.events.candy(n);
    if (!at) return;
    const proj = this._v2.copy(at).project(this.camera);
    if (proj.z < 1) {
      const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      this.hud.popup(x, y, '+' + n, true);
    }
    if (burst) {
      const k = Math.min(12, 2 + Math.floor(n / 2));
      for (let i = 0; i < k; i++) {
        this.candyFx.push({
          p: at.clone(),
          v: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4),
          t: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), rot: new THREE.Euler(),
        });
      }
    }
  }

  updateCandyFx(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const target = this._v.copy(this.player.pos).add(this._v2.set(0, 1.1, 0));
    let n = 0;
    for (let i = this.candyFx.length - 1; i >= 0; i--) {
      const c = this.candyFx[i];
      c.t += dt;
      if (c.t < 0.45) {
        c.v.y -= 9 * dt;
        c.p.addScaledVector(c.v, dt);
      } else {
        const k = Math.min(1, (c.t - 0.45) * 2.2);
        c.p.lerp(target, k * k * 0.5 + dt * 4);
        if (c.p.distanceTo(target) < 0.45 || c.t > 2.2) {
          this.candyFx.splice(i, 1);
          if (Math.random() < 0.5) this.audio.chime();
          continue;
        }
      }
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
      if (n < 160) this.candyMesh.setMatrixAt(n++, m.compose(c.p, q.setFromEuler(c.rot), s.setScalar(0.09)));
    }
    this.candyMesh.count = n;
    this.candyMesh.instanceMatrix.needsUpdate = true;
  }

  cutTime(r) {
    return 0.05 + 15 * Math.pow(r, 1.55);
  }

  rayGround(o, d, maxT, out) {
    let tPrev = 0;
    let step = 0.4;
    for (let t = 0.3; t < maxT; t += step) {
      const y = o.y + d.y * t;
      const g = groundHeight(o.x + d.x * t, o.z + d.z * t);
      if (y < g) {
        let a = tPrev;
        let b = t;
        for (let k = 0; k < 8; k++) {
          const mid = (a + b) / 2;
          if (o.y + d.y * mid < groundHeight(o.x + d.x * mid, o.z + d.z * mid)) b = mid; else a = mid;
        }
        out.copy(o).addScaledVector(d, b);
        return b;
      }
      tPrev = t;
      step = Math.min(1.5, 0.4 + t * 0.02);
    }
    return -1;
  }

  rayBarrier(o, d, maxT) {
    const b = this.barrier;
    if (!b.active || b.y < -2.5) return -1;
    const zf = b.z + 0.3;
    if (Math.abs(d.z) < 1e-5) return -1;
    const t = (zf - o.z) / d.z;
    if (t < 0 || t > maxT) return -1;
    const y = o.y + d.y * t;
    const gy = groundHeight(0, b.z) + b.y;
    const x = o.x + d.x * t;
    if (y < gy || y > gy + 3.45 || Math.abs(x) > BARRIER_HALF_W) return -1;
    return t;
  }

  updateLaser(dt, now, wantFire) {
    const p = this.player;
    if (this.overheat) {
      this.gunHeat -= dt * 0.55;
      if (this.gunHeat <= 0.3) this.overheat = false;
    }
    const firing = wantFire && !this.overheat && p.alive;
    this.firing = firing;
    if (firing) {
      this.gunHeat += dt * 0.2;
      if (this.gunHeat >= 1) { this.gunHeat = 1; this.overheat = true; this.audio.noiseHit(p.head, { vol: 0.6, f: 4000, q: 0.5, dur: 0.5, type: 'highpass' }); }
    } else if (!this.overheat) this.gunHeat = Math.max(0, this.gunHeat - dt * 0.42);
    p.char.muzzleWorld(this.muzzle);
    let burning = false;
    if (firing) {
      p.char.fireKick = Math.min(1, p.char.fireKick + dt * 10);
      const co = this.camera.position;
      const cd = this.camRay.copy(p.camDir);
      let tBest = 160;
      const mh = this.monsters.raycast(co, cd, tBest);
      if (mh) tBest = mh.t;
      const tg = this.rayGround(co, cd, tBest, this._v);
      if (tg > 0) tBest = Math.min(tBest, tg);
      const tb = this.rayBarrier(co, cd, tBest);
      if (tb > 0) tBest = tb;
      this.aim.copy(co).addScaledVector(cd, tBest);
      const d2 = this._v2.subVectors(this.aim, this.muzzle);
      const len = Math.max(0.05, d2.length());
      d2.multiplyScalar(1 / len);
      let end = len;
      const hit = this.monsters.raycast(this.muzzle, d2, len + 0.3);
      if (hit) end = hit.t;
      const tg2 = this.rayGround(this.muzzle, d2, end, this._v);
      if (tg2 > 0 && tg2 < end - 0.05) end = tg2;
      this.end.copy(this.muzzle).addScaledVector(d2, end);
      if (hit && end === hit.t) {
        burning = true;
        this.burn(hit, dt, now);
      } else {
        this.fxAcc += dt;
        if (this.fxAcc > 0.05) {
          this.fxAcc = 0;
          this.particles.sparks(this.end, null, 2, new THREE.Color(2, 5, 1.5), 2.5);
          if (Math.random() < 0.4) this.particles.smoke(this.end, 1, 0.05, 0.6, 0.18, 0.5);
        }
      }
    } else {
      this.end.copy(this.muzzle);
    }
    for (const s of this.hot) {
      if (s === this.burningSeg && firing) continue;
      s.heat = Math.max(0, s.heat - dt * 1.4);
      this.sticks.setBurn(s.idx, s.hotT, s.heat);
      if (s.heat <= 0 || !s.attached) { this.hot.delete(s); this.sticks.setBurn(s.idx, 0.5, 0); }
    }
    if (!burning) this.burningSeg = null;
    this.laserFX.update(dt, now, firing, this.muzzle, this.end, burning);
    this.audio.updateLaser(firing, burning, this.gunHeat);
  }

  burn(hit, dt, now) {
    const s = hit.seg;
    const len = s.A.distanceTo(s.B);
    if (this.burningSeg !== s || Math.abs(hit.s - s.hotT) * len > Math.max(0.05, s.r * 2.2)) {
      if (this.burningSeg !== s || s.heat < 0.15) s.hotT = hit.s;
      else s.hotT = THREE.MathUtils.lerp(s.hotT, hit.s, 0.5);
      s.heat *= 0.55;
    }
    this.burningSeg = s;
    s.heat += dt / this.cutTime(s.r);
    this.hot.add(s);
    this.sticks.setBurn(s.idx, s.hotT, Math.min(1, s.heat));
    this.fxAcc += dt;
    const pt = this._v.lerpVectors(s.A, s.B, s.hotT);
    if (this.fxAcc > 0.04) {
      this.fxAcc = 0;
      this.particles.sparks(pt, null, 2 + Math.floor(Math.random() * 3), null, 3.5);
      this.particles.embers(pt, 1, 0.05, 0.8);
      if (Math.random() < 0.5) this.particles.smoke(pt, 1, 0.03, 0.4, 0.14 + s.r * 2, 0.7);
    }
    if (s.heat >= 1) {
      const m = hit.monster;
      const res = m.cut(s, s.hotT, now);
      s.heat = 0;
      this.hot.delete(s);
      this.burningSeg = null;
      if (!res) return;
      this.stats.cuts++;
      this.audio.snap(res.point, Math.min(1, s.r * 12));
      this.particles.sparks(res.point, null, 14, null, 5);
      this.particles.embers(res.point, 8, 0.1, 1.5);
      this.particles.smoke(res.point, 3, 0.08, 0.5, 0.25 + s.r * 3, 0.8);
      if (!res.kill) this.giveCandy(res.decor ? 1 : 2, res.point, false);
    }
  }

  updatePushers() {
    const arr = U.pushers.value;
    let k = 0;
    for (const m of this.monsters.monsters) {
      if (k >= 15) break;
      if (!m.alive) continue;
      arr[k++].set(m.pos.x, 0, m.pos.z, 0.7 + m.T.hipW * 4);
    }
    while (k < 15) arr[k++].set(0, -1000, 0, 0);
    arr[15].set(this.player.pos.x, 0, this.player.pos.z, 0.7);
  }

  botControl(dt, mouse) {
    const p = this.player;
    this.botFire = false;
    let best = null;
    let bd = 1e9;
    for (const m of this.monsters.monsters) {
      if (!m.alive || m.pos.z < -58) continue;
      const d = m.pos.distanceTo(p.pos);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) {
      const seg = best.segs.find((s) => s.key === 'torso' && s.attached) || best.segs.find((s) => s.attached);
      if (seg) {
        const tgt = this._v.lerpVectors(seg.A, seg.B, 0.5);
        const from = this.camera.position;
        const d = this._v2.subVectors(tgt, from).normalize();
        const yaw = Math.atan2(-d.x, -d.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
        let dy = yaw - p.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        p.yaw += dy * Math.min(1, dt * 10);
        p.pitch += (pitch - p.pitch) * Math.min(1, dt * 10);
        this.botFire = Math.abs(dy) < 0.06 && bd < 70;
      }
    }
    const w = this.debris.wave;
    if (w && this.phase === 'wave' && p.onGround) {
      const dz = w.z - p.pos.z;
      const lead = (JUMP_V / GRAVITY) * 0.55 * w.speed;
      if (dz > -lead - 0.3 && dz < -lead + 0.6) { p.vel.y = JUMP_V; p.onGround = false; }
    }
    mouse.dx = 0;
    mouse.dy = 0;
  }
}
