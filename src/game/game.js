import * as THREE from 'three';
import { groundHeight, SPAWN_Z, BARRIER_Z, BARRIER_STOP_Z, PIT, BARRIER_HALF_W, FIELD, pitMask, LOBBY } from '../world/layout.js';
import { U } from '../world/globals.js';
import { TYPES, THICK } from './monster.js';
import { CENTER_HALF, BARRIER_BACK, BARRIER_FRONT } from './barrier.js';
import { GRAVITY, JUMP_V } from './player.js';
import { PARKOUR, RANGE, MERCHANT } from '../world/lobby.js';

const LOBBY_TIME = 45;

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
    this.burnedNow = new Set();
    this.frame = 0;
    this.gunHeat = 0;
    this.overheat = false;
    this.firing = false;
    this.candy = 0;
    this.stats = { sticks: 0, kills: 0, cuts: 0 };
    this.fxAcc = 0;
    this.bot = false;
    this.uiOpen = false;
    this.camRay = new THREE.Vector3();
    this.muzzle = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.sideEnd = [new THREE.Vector3(), new THREE.Vector3()];
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this.candyFx = [];
    this.respawns = [];
    this.slowT = 0;
    this.slowCD = 0;
    this.spikeCharges = 1;
    this.spikes = null;
    this.pk = { running: false, t: 0, claimed: false };
    const cg = candyGeometry();
    const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0, emissive: 0xff8a20, emissiveIntensity: 0.25 });
    this.candyMesh = new THREE.InstancedMesh(cg, cm, 220);
    this.candyMesh.frustumCulled = false;
    this.candyMesh.count = 0;
    this.scene.add(this.candyMesh);
    if (this.lobby && this.lobby.candyBowls) {
      const bowls = new THREE.InstancedMesh(cg, cm, this.lobby.candyBowls.length * 14);
      const m = new THREE.Matrix4();
      const rnd = (s) => { const x = Math.sin(s * 91.7) * 43758.5; return x - Math.floor(x); };
      let i = 0;
      for (const [bx, by, bz] of this.lobby.candyBowls) {
        for (let k = 0; k < 14; k++) {
          const a = rnd(i + 1) * Math.PI * 2;
          const r = rnd(i + 7) * 0.2;
          m.compose(new THREE.Vector3(bx + Math.cos(a) * r, by + 0.12 + rnd(i + 3) * 0.08, bz + Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(i + 5) * 6, rnd(i + 9) * 6, rnd(i + 11) * 6)), new THREE.Vector3(0.07, 0.07, 0.07));
          bowls.setMatrixAt(i++, m);
        }
      }
      bowls.computeBoundingSphere();
      this.scene.add(bowls);
    }
    this.spikeMesh = this.makeSpikes();
    this.events = { gameover() {}, candy() {}, fade() {}, openShop() {} };
    this.wireHandlers();
  }

  makeSpikes() {
    const g = new THREE.ConeGeometry(0.07, 0.9, 6);
    g.translate(0, 0.45, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.9, roughness: 0.45 });
    const im = new THREE.InstancedMesh(g, mat, 40);
    im.count = 0;
    im.castShadow = true;
    im.frustumCulled = false;
    this.scene.add(im);
    return im;
  }

  get weapon() { return this.profile.equipped('weapon'); }

  wireHandlers() {
    const M = this.monsters;
    M.handlers.attackStart = (m) => { this.audio.creak(m.j.H); };
    M.handlers.grab = (m, p) => this.killPlayer(p, 'grab', m);
    M.handlers.death = (m) => {
      this.audio.snap(m.j.C, 1);
      this.audio.knock(m.j.P, 0.6);
      if (m.dummy) {
        this.respawns.push({ spot: m.spot, t: 2.5 });
        return;
      }
      this.stats.kills++;
      this.giveCandy(TYPES[m.type].candy, m.j.C, true);
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
    this.barrier.events.plow = () => {
      this.audio.rumble(this._v.set(0, 0.5, 4), 2.6, 1.2);
      this.player.shake = Math.max(this.player.shake, 0.6);
    };
    this.barrier.events.dump = () => {
      this.debris.endWave();
      this.phase = 'burn';
      this.timer = 3.5;
      this.audio.knock(this._v.set(0, 0.5, PIT.z0), 1);
      for (let x = -CENTER_HALF; x <= CENTER_HALF; x += 1.2) this.particles.embers(this._v.set(x, groundHeight(x, PIT.z0 + 1), PIT.z0 + 1), 3, 0.8, 2.5);
    };
    this.barrier.events.sunk = () => this.props && this.props.restoreCandles();
    this.debris.onBurned = (c) => {
      this.bonfire.feed(c.sticks);
      if (this.phase !== 'lobby') this.stats.sticks += c.sticks;
    };
    this.debris.onLand = (c) => {
      const p = this.debris.chunkPos(c, this._v);
      this.particles.embers(p, 6, 0.6, 2.2);
      this.particles.sparks(p, null, 6, null, 3);
      this.audio.knock(p, 0.3);
    };
    this.player.onStep = (p) => this.audio.step(p, 0.22);
    this.player.onJump = (dbl) => {
      this.audio.noiseHit(null, { vol: dbl ? 0.35 : 0.25, f: dbl ? 1200 : 700, q: 0.8, dur: 0.12, reverb: 0.05 });
      if (dbl) this.particles.dust(this.player.pos, 4, 0.4, 0.5);
    };
    this.player.onLand = (v) => this.audio.step(this.player.pos, 0.2 + v * 0.04);
  }

  lightning(s) {
    this.flash = Math.max(this.flash || 0, s);
    this.flashAge = 0;
  }

  applyLoadout() {
    this.player.canDouble = this.profile.has('abilities', 'double');
  }

  enterLobby() {
    this.phase = 'lobby';
    this.lobbyTimer = LOBBY_TIME;
    this.monsters.clear();
    this.debris.clearAll();
    this.barrier.reset();
    if (this.props) this.props.restoreCandles();
    for (const s of this.hot) s.heat = 0;
    this.hot.clear();
    this.spikes = null;
    this.spikeMesh.count = 0;
    this.slowT = 0;
    this.player.setGhost(false);
    this.player.setArea('lobby');
    this.hud.ghost(false);
    this.renderer.final.uniforms.uGhost.value = 0;
    this.hud.setRound('Graveyard Hill');
    this.hud.setStatus('');
    this.pk = { running: false, t: 0, claimed: false };
    for (const [x, z, type] of RANGE.dummies) this.spawnDummy({ x, z, type });
    const mer = this.monsters.spawn('walker', MERCHANT.x, MERCHANT.z, 4242);
    mer.npc = true;
    mer.heading = Math.PI / 2;
    mer.lookAt = this.player;
    mer.initFeet();
    this.lobby.drawBoard(this.profile);
    this.applyLoadout();
    this.audio.toLobby();
    this.hud.message('Graveyard Hill', 'Shop, practice, ring the bell · 1-4 emotes · R +60 s', 3.6);
  }

  spawnDummy(spot) {
    const m = this.monsters.spawn(spot.type, spot.x, spot.z, Math.floor(Math.random() * 1e9));
    m.dummy = true;
    m.spot = spot;
    m.heading = Math.atan2(RANGE.shooter.x - spot.x, RANGE.shooter.z - spot.z);
    m.lookAt = { pos: new THREE.Vector3(RANGE.shooter.x, LOBBY.y, RANGE.shooter.z), head: new THREE.Vector3(RANGE.shooter.x, LOBBY.y + 1.6, RANGE.shooter.z) };
    m.initFeet();
    return m;
  }

  startNight() {
    if (this.phase !== 'lobby') return;
    this.phase = 'transition';
    this.transT = 0;
    this.events.fade(true);
    this.hud.prompt(null);
    this.hud.timer(null);
  }

  newGame(introHit = null) {
    this.introSync = introHit;
    this.monsters.clear();
    this.debris.clearAll();
    for (const s of this.hot) s.heat = 0;
    this.hot.clear();
    this.round = 0;
    this.candy = 0;
    this.stats = { sticks: 0, kills: 0, cuts: 0 };
    this.gunHeat = 0;
    this.overheat = false;
    this.slowT = 0;
    this.slowCD = 0;
    this.spikes = null;
    this.spikeMesh.count = 0;
    this.player.setArea('zone');
    this.player.reset();
    this.barrier.reset();
    if (this.props) this.props.restoreCandles();
    this.queue = [];
    this.lastSpawn = null;
    this.sweepDelay = -1;
    this.barrierPending = false;
    this.applyLoadout();
    this.nextRound(true);
  }

  nextRound(first = false) {
    this.round++;
    this.phase = 'intermission';
    this.timer = first ? (this.introSync ? this.introSync + 1.5 : 7) : 6;
    this.spikeCharges = 1;
    this.hud.setRound(`Round ${this.round}`);
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
    this.frame++;
    this.time += dt;
    const now = this.time;
    const hit = this.audio.ready && this.phase !== 'lobby' ? this.audio.musicTransient(dt) : 0;
    if (hit > 0 && !this.introSync && this.phase !== 'gameover') this.lightning(0.3 + hit * 0.45);
    this.flashAge = (this.flashAge || 0) + dt;
    this.flash = Math.max(0, (this.flash || 0) - dt * 1.6);
    const fl = this.flash * (this.flashAge < 0.25 ? 0.55 + 0.45 * Math.sin(this.flashAge * 70) : 1);
    this.lightningLevel = Math.max(0, fl);
    const playing = this.phase !== 'menu' && this.phase !== 'gameover' && this.phase !== 'transition';
    const canControl = playing && !this.uiOpen && (input.locked || this.bot);
    const control = canControl && this.player.alive;
    if (playing || this.phase === 'transition') {
      if (this.bot && this.phase !== 'lobby') this.botControl(dt, mouse);
      this.player.update(dt, input, mouse, canControl);
    }
    this.player.beat = this.audio.beatNow(this.time);
    this.updateAbilities(dt, input, control);
    const wdt = this.slowT > 0 ? dt * 0.35 : dt;
    this.phaseUpdate(dt, now, input);
    this.monsters.update(wdt, now, this.phase === 'lobby' ? [] : this.players);
    this.updateSpikes(wdt, now);
    this.updateLaser(dt, now, control && (input.fire || this.botFire));
    this.debris.update(wdt, now);
    this.barrier.update(wdt, now);
    this.updateWaveKill();
    this.updateCandyFx(dt);
    this.updatePushers();
    if (this.lobby) this.lobby.update(dt, now, this.wardrobeOpen);
    this.hud.setCandy(this.profile.candy);
    this.hud.setHeat(this.gunHeat, this.overheat);
  }

  updateAbilities(dt, input, control) {
    const P = this.profile;
    this.slowT = Math.max(0, this.slowT - dt);
    this.slowCD = Math.max(0, this.slowCD - dt);
    const arena = this.phase !== 'lobby' && this.phase !== 'menu' && this.phase !== 'gameover' && this.phase !== 'transition';
    if (control && arena && P.has('abilities', 'slow') && input.hit('KeyQ') && this.slowCD <= 0) {
      this.slowT = 5;
      this.slowCD = 30;
      this.audio.whoosh(0.6);
      this.lightning(0.25);
    }
    if (control && arena && P.has('abilities', 'spikes') && input.hit('KeyF') && this.spikeCharges > 0) this.placeSpikes();
    if (this.audio.music) this.audio.music.playbackRate = this.slowT > 0 ? 0.82 : 1;
    this.renderer.final.uniforms.uGhost.value = Math.max(this.player.alive ? 0 : 1, this.slowT > 0 ? 0.35 : 0);
    const list = [];
    if (P.has('abilities', 'slow')) list.push({ key: 'Q', name: 'Slow', state: this.slowT > 0 ? 'active' : this.slowCD <= 0 ? 'ready' : '', cd: this.slowT > 0 ? 0 : this.slowCD / 30 });
    if (P.has('abilities', 'spikes')) list.push({ key: 'F', name: 'Spikes', state: this.spikes ? 'active' : this.spikeCharges > 0 ? 'ready' : '', cd: this.spikeCharges > 0 ? 0 : 1 });
    this.hud.abilities(arena ? list : []);
  }

  placeSpikes() {
    const co = this.camera.position;
    const d = this.player.camDir;
    const t = this.rayGround(co, d, 45, this._v);
    let x;
    let z;
    if (t > 0) { x = this._v.x; z = this._v.z; } else { x = this.player.pos.x; z = this.player.pos.z - 12; }
    z = THREE.MathUtils.clamp(z, -55, -2.5);
    x = THREE.MathUtils.clamp(x, FIELD.x0 + 4, FIELD.x1 - 4);
    this.spikes = { x, z, t: 0, life: 15, hitSet: new Set() };
    this.spikeCharges--;
    this.audio.rumble(this._v.set(x, 0.5, z), 1.0, 0.8);
    for (let i = 0; i < 10; i++) this.particles.dust(this._v.set(x + (Math.random() - 0.5) * 7, groundHeight(x, z) + 0.1, z), 1, 0.5, 0.8);
  }

  updateSpikes(dt, now) {
    const s = this.spikes;
    const im = this.spikeMesh;
    if (!s) { im.count = 0; return; }
    s.t += dt;
    const rise = Math.min(1, s.t / 0.25) * Math.min(1, Math.max(0, (s.life - s.t) / 0.5));
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 20; i++) {
      for (let r = 0; r < 2; r++) {
        const x = s.x - 3.6 + i * 0.38 + (r ? 0.19 : 0);
        const z = s.z + (r ? 0.35 : -0.35) + Math.sin(i * 7.3) * 0.1;
        const tilt = Math.sin(i * 3.1 + r) * 0.25;
        m.makeRotationFromEuler(new THREE.Euler(tilt, 0, Math.cos(i * 2.3) * 0.2)).scale(this._v.set(1, Math.max(0.01, rise * (0.7 + 0.3 * Math.sin(i * 5.7))), 1)).setPosition(x, groundHeight(x, z) - 0.05, z);
        im.setMatrixAt(n++, m);
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    for (const mo of this.monsters.monsters) {
      if (!mo.alive || mo.dummy || mo.npc) continue;
      if (Math.abs(mo.pos.z - s.z) < 1.0 && Math.abs(mo.pos.x - s.x) < 3.9) {
        mo.speedNow *= 0.3;
        if (!s.hitSet.has(mo)) {
          s.hitSet.add(mo);
          const shin = mo.segs.find((g) => g.key.startsWith('shin') && g.attached && g.keep === 1);
          if (shin) {
            const res = mo.cut(shin, 0.5, now);
            if (res) {
              this.audio.snap(res.point, 0.8);
              this.particles.sparks(res.point, null, 12, null, 4);
              this.giveCandy(2, res.point, false);
            }
          }
        }
      }
    }
    if (s.t >= s.life) { this.spikes = null; im.count = 0; }
  }

  phaseUpdate(dt, now, input) {
    const alive = this.monsters.aliveCount;
    switch (this.phase) {
      case 'lobby': this.updateLobby(dt, input); break;
      case 'transition': {
        this.transT += dt;
        if (this.transT > 0.75) {
          this.bellRung = false;
          this.audio.toMatch();
          this.newGame(this.getIntro ? this.getIntro() : null);
          this.audio.restartMusic();
          this.events.fade(false);
        }
        break;
      }
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
        this.spawnT += dt * (this.slowT > 0 ? 0.35 : 1);
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
            this.hud.message('Here it comes', this.round === 1 ? 'Jump over the barrier with Space' : '', 3);
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
        this.hud.setStatus('');
        const b = this.barrier;
        if (b.plowing) {
          const d = Math.abs(this.player.pos.z - b.z);
          this.player.shake = Math.max(this.player.shake, 0.25 + Math.max(0, 1 - d / 12) * 0.5);
          if (this.props) this.props.knockCandles(b.z + BARRIER_FRONT + (this.debris.wave ? this.debris.wave.length : 0));
          for (let i = 0; i < 4; i++) {
            const x = (Math.random() - 0.5) * 2 * CENTER_HALF;
            const p = this._v.set(x, groundHeight(x, b.z + 0.6) + 0.04, b.z + 0.62);
            this.particles.sparks(p, null, 1, null, 2.5);
            if (i === 0) this.particles.dust(p, 1, 0.6, 0.6);
          }
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
          this.nextRound();
        }
        break;
      }
      default: break;
    }
  }

  updateLobby(dt, input) {
    const p = this.player;
    if (!this.uiOpen) this.lobbyTimer -= dt;
    if (!this.uiOpen && input.hit('KeyR') && !this.bellRung) {
      this.lobbyTimer = Math.min(this.lobbyTimer + 60, 600);
      this.hud.message('+60 s', 'The night can wait', 1.6);
      this.audio.chime();
    }
    const t = Math.max(0, Math.ceil(this.lobbyTimer));
    this.hud.timer(this.bellRung ? 'The bell tolls' : `Night falls in ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  ·  R +60 s`);
    if (this.lobbyTimer <= 0) { this.bellRung = false; this.startNight(); return; }
    let near = null;
    let best = 1e9;
    for (const it of this.lobby.interactables) {
      const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
      if (d < it.r && d < best) { best = d; near = it; }
    }
    this.hud.prompt(near && !this.uiOpen ? near.label : null);
    if (near && !this.uiOpen && (input.hit('KeyE') || (this.bot && near.id === 'bell'))) {
      if (near.id === 'bell') {
        if (!this.bellRung) {
          this.bellRung = true;
          this.lobby.ringBell();
          this.audio.bell(3);
          this.lobbyTimer = Math.min(this.lobbyTimer, 4);
        }
      } else this.events.openShop(near.id);
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t -= dt;
      if (r.t <= 0) { this.spawnDummy(r.spot); this.respawns.splice(i, 1); }
    }
    const pk = this.pk;
    const onPillar = (i) => {
      const [x, z, top] = PARKOUR[i];
      return p.onGround && Math.abs(p.pos.x - x) < 0.56 && Math.abs(p.pos.z - z) < 0.56 && Math.abs(p.pos.y - (LOBBY.y + top)) < 0.12;
    };
    if (!pk.running && onPillar(0)) { pk.running = true; pk.t = 0; this.audio.chime(); }
    if (pk.running) {
      pk.t += dt;
      this.hud.setStatus(`Parkour ${pk.t.toFixed(1)} s`);
      if (onPillar(PARKOUR.length - 1)) {
        pk.running = false;
        const prev = this.profile.data.stats.parkourBest;
        this.profile.recordParkour(pk.t);
        this.lobby.drawBoard(this.profile);
        const record = !prev || pk.t < prev;
        this.hud.message(`${pk.t.toFixed(2)} s`, record ? 'New parkour record' : 'Golden pumpkin reached', 2.8);
        if (!pk.claimed) { pk.claimed = true; this.giveCandy(30, this.lobby.goldPumpkin.position, true); }
        this.audio.bell(1);
      } else if (p.onGround && p.pos.y < LOBBY.y + 0.2 && pk.t > 0.3) {
        pk.running = false;
        this.hud.setStatus('');
      }
    } else if (this.hud.lastStatus && this.hud.lastStatus.startsWith('Parkour')) this.hud.setStatus('');
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
    const height = Math.min(0.9, 0.36 + this.round * 0.045 + pile * 0.0004);
    const length = Math.min(2.6, 0.95 + this.round * 0.11 + pile * 0.001);
    this.debris.startWave(() => this.barrier.z + BARRIER_FRONT + length, this.barrier.plowSpeed, height, length, CENTER_HALF - 0.6);
    this.phase = 'wave';
    this.player.shake = Math.max(this.player.shake, 0.8);
    this.audio.knock(this._v.set(0, 0.5, BARRIER_STOP_Z), 1);
    if (this.round === 1) this.hud.message('Jump!', 'Space to jump over the barrier', 2.4);
    for (let x = -BARRIER_HALF_W + 1; x < BARRIER_HALF_W; x += 1.5) {
      if (Math.abs(x) < CENTER_HALF) continue;
      this.particles.sparks(this._v.set(x, groundHeight(x, BARRIER_STOP_Z) + 0.05, BARRIER_STOP_Z), null, 3, null, 3);
      this.particles.dust(this._v, 1, 0.8, 0.9);
    }
  }

  updateWaveKill() {
    if (this.phase === 'lobby' || this.phase === 'menu') return;
    for (const p of this.players) {
      if (!p.alive) { p.pushed = false; continue; }
      if (p.pushed || p.pos.z > PIT.z0 + 0.2) {
        const g = groundHeight(p.pos.x, p.pos.z);
        if (pitMask(p.pos.x, p.pos.z) > 0.35 && p.pos.y - g < 0.25) {
          this.particles.embers(p.pos, 30, 0.8, 3);
          this.particles.sparks(p.pos, null, 20, null, 5);
          this.killPlayer(p, 'fire');
          continue;
        }
      }
    }
    const b = this.barrier;
    const w = this.debris.wave;
    if (this.phase !== 'wave' || !b.plowing || !w) {
      if (!b.plowing) for (const p of this.players) if (p.pushed && p.pos.z < PIT.z0 - 0.5) p.pushed = false;
      return;
    }
    for (const p of this.players) {
      if (!p.alive || Math.abs(p.pos.x) > CENTER_HALF + 0.3) continue;
      const g = groundHeight(p.pos.x, p.pos.z);
      const feet = p.pos.y - g;
      const rel = p.pos.z - b.z;
      if (rel > -BARRIER_BACK - 0.3 && rel < BARRIER_FRONT + 0.25 && feet < b.topY - g - 0.08) {
        p.pos.z = b.z - BARRIER_BACK - 0.35;
        p.vel.z = Math.min(p.vel.z, -1.5);
        continue;
      }
      const dz = w.z - p.pos.z;
      if (dz >= 0 && dz <= w.length + 0.2 && feet < this.debris.waveProfile(Math.min(dz, w.length)) * 0.72 + 0.02) {
        if (!p.pushed) { this.audio.knock(p.pos, 0.8); p.shake = Math.max(p.shake, 0.7); }
        p.pushed = true;
        p.pos.z = w.z + 0.32;
        p.vel.z = Math.max(p.vel.z, b.plowSpeed * 0.6);
      }
    }
  }

  killPlayer(p, how) {
    if (!p.alive) return;
    p.setGhost(true);
    this.audio.scream();
    this.particles.dust(p.pos, 10, 0.8, 1.0);
    p.shake = 1;
    if (p === this.player) this.hud.ghost(true);
    if (this.players.every((q) => !q.alive)) {
      this.phase = 'gameover';
      this.profile.recordGame(Math.max(0, this.round - 1), this.stats.sticks, this.stats.kills);
      setTimeout(() => this.events.gameover(this), 2200);
    }
  }

  giveCandy(n, at, burst) {
    this.candy += n;
    this.profile.addCandy(n);
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
      if (n < 220) this.candyMesh.setMatrixAt(n++, m.compose(c.p, q.setFromEuler(c.rot), s.setScalar(0.09)));
    }
    this.candyMesh.count = n;
    this.candyMesh.instanceMatrix.needsUpdate = true;
  }

  cutTime(r) {
    const power = 1 + 0.28 * this.profile.level('power');
    const w = this.weapon;
    const k = w === 'reaper' ? 2.2 : w === 'splitter' ? 0.62 : 1;
    return (0.05 + 15 * Math.pow(r / THICK, 1.55)) / (power * k);
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
    if (!b.active || b.yC < -3.2) return -1;
    const zf = b.z + 0.3;
    if (Math.abs(d.z) < 1e-5) return -1;
    const t = (zf - o.z) / d.z;
    if (t < 0 || t > maxT) return -1;
    const y = o.y + d.y * t;
    const gy = b.groundY;
    const x = o.x + d.x * t;
    if (y < gy || y > b.topY + 0.05 || Math.abs(x) > (b.yW > -3.2 ? BARRIER_HALF_W : CENTER_HALF)) return -1;
    return t;
  }

  traceBeam(from, dir, maxLen, extraR, out) {
    let end = maxLen;
    const hit = this.monsters.raycast(from, dir, maxLen + 0.3, extraR);
    if (hit) end = hit.t;
    const tg = this.rayGround(from, dir, end, this._v3);
    if (tg > 0 && tg < end - 0.05) end = tg;
    out.copy(from).addScaledVector(dir, end);
    return hit && end === hit.t ? hit : null;
  }

  updateLaser(dt, now, wantFire) {
    const p = this.player;
    const P = this.profile;
    const w = this.weapon;
    const cool = P.level('cooling');
    if (this.overheat) {
      this.gunHeat -= dt * 0.55 * (1 + 0.15 * cool);
      if (this.gunHeat <= 0.3) this.overheat = false;
    }
    const firing = wantFire && !this.overheat && p.alive;
    this.firing = firing;
    const heatRate = 0.2 * (1 - 0.11 * cool) * (w === 'splitter' ? 1.15 : w === 'reaper' ? 1.3 : w === 'arc' ? 1.1 : 1);
    if (firing) {
      this.gunHeat += dt * heatRate;
      if (this.gunHeat >= 1) { this.gunHeat = 1; this.overheat = true; this.audio.noiseHit(p.head, { vol: 0.6, f: 4000, q: 0.5, dur: 0.5, type: 'highpass' }); }
    } else if (!this.overheat) this.gunHeat = Math.max(0, this.gunHeat - dt * 0.42 * (1 + 0.15 * cool));
    p.char.muzzleWorld(this.muzzle);
    let burning = false;
    const extraR = 0.025 * P.level('focus') + (w === 'reaper' ? 0.12 : 0);
    const range = w === 'reaper' ? 16 : 160;
    this.burnedNow.clear();
    const fx2 = this.laserFX2;
    const fx3 = this.laserFX3;
    let side1 = false;
    let side2 = false;
    if (firing) {
      p.char.fireKick = Math.min(1, p.char.fireKick + dt * 10);
      const co = this.camera.position;
      const cd = this.camRay.copy(p.camDir);
      let tBest = 160;
      const mh = this.monsters.raycast(co, cd, tBest, extraR);
      if (mh) tBest = mh.t;
      const tg = this.rayGround(co, cd, tBest, this._v);
      if (tg > 0) tBest = Math.min(tBest, tg);
      const tb = this.rayBarrier(co, cd, tBest);
      if (tb > 0) tBest = tb;
      this.aim.copy(co).addScaledVector(cd, tBest);
      const d2 = this._v2.subVectors(this.aim, this.muzzle);
      const len = Math.min(range, Math.max(0.05, d2.length()));
      d2.normalize();
      const hit = this.traceBeam(this.muzzle, d2, len, extraR, this.end);
      const factor = 1;
      if (hit) { burning = true; this.burn(hit, dt, now, factor); }
      else this.groundFx(this.end, dt);
      if (w === 'splitter') {
        for (let k = 0; k < 2; k++) {
          const dir = this._v.copy(d2).applyAxisAngle(new THREE.Vector3(0, 1, 0), k ? 0.075 : -0.075);
          const h2 = this.traceBeam(this.muzzle, dir, len, extraR, this.sideEnd[k]);
          if (h2) this.burn(h2, dt, now, 1);
          if (k) side2 = true; else side1 = true;
        }
      }
      if (w === 'arc' && hit) {
        const hp = this._v.lerpVectors(hit.seg.A, hit.seg.B, hit.s);
        let bestS = null;
        let bestM = null;
        let bd = 3.2;
        for (const m of this.monsters.monsters) {
          if (!m.alive || m.npc) continue;
          for (const sg of m.segs) {
            if (!sg.attached || sg === hit.seg) continue;
            const mid = this._v3.lerpVectors(sg.A, sg.B, 0.5);
            const d = mid.distanceTo(hp);
            if (d < bd && (m !== hit.monster || d > 0.6)) { bd = d; bestS = sg; bestM = m; }
          }
        }
        if (bestS) {
          this.burn({ seg: bestS, s: 0.5, monster: bestM }, dt, now, 0.6);
          this.sideEnd[0].lerpVectors(bestS.A, bestS.B, 0.5);
          this.arcFrom = this.end.clone();
          side1 = true;
        }
      }
    } else {
      this.end.copy(this.muzzle);
    }
    for (const s of this.hot) {
      if (this.burnedNow.has(s)) continue;
      s.heat = Math.max(0, s.heat - dt * 1.4);
      this.sticks.setBurn(s.idx, s.hotT, s.heat);
      if (s.heat <= 0 || !s.attached) { this.hot.delete(s); this.sticks.setBurn(s.idx, 0.5, 0); }
    }
    this.laserFX.uniforms.uWidth.value = w === 'reaper' ? 0.2 : 0.11;
    this.laserFX.update(dt, now, firing, this.muzzle, this.end, burning);
    if (fx2) fx2.update(dt, now, firing && side1, w === 'arc' && this.arcFrom ? this.arcFrom : this.muzzle, this.sideEnd[0], false);
    if (fx3) fx3.update(dt, now, firing && side2, this.muzzle, this.sideEnd[1], false);
    this.audio.updateLaser(firing, burning, this.gunHeat);
  }

  groundFx(at, dt) {
    this.fxAcc += dt;
    if (this.fxAcc > 0.05) {
      this.fxAcc = 0;
      this.particles.sparks(at, null, 2, this.laserFX.uniforms.uColor.value.clone().multiplyScalar(4), 2.5);
      if (Math.random() < 0.4) this.particles.smoke(at, 1, 0.05, 0.6, 0.18, 0.5);
    }
  }

  burn(hit, dt, now, factor) {
    const s = hit.seg;
    if (this.burnedNow.has(s)) return;
    this.burnedNow.add(s);
    const len = s.A.distanceTo(s.B);
    const continuing = s.lastBurn === this.frame - 1;
    if (!continuing || Math.abs(hit.s - s.hotT) * len > Math.max(0.05, s.r * 2.2)) {
      if (!continuing || s.heat < 0.15) s.hotT = hit.s;
      else s.hotT = THREE.MathUtils.lerp(s.hotT, hit.s, 0.5);
      s.heat *= 0.55;
    }
    s.lastBurn = this.frame;
    s.heat += (dt * factor) / this.cutTime(s.r);
    this.hot.add(s);
    this.sticks.setBurn(s.idx, s.hotT, Math.min(1, s.heat));
    this.fxAcc += dt;
    const pt = this._v3.lerpVectors(s.A, s.B, s.hotT);
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
      if (!res) return;
      this.stats.cuts++;
      this.audio.snap(res.point, Math.min(1, s.r * 12));
      this.particles.sparks(res.point, null, 14, null, 5);
      this.particles.embers(res.point, 8, 0.1, 1.5);
      this.particles.smoke(res.point, 3, 0.08, 0.5, 0.25 + s.r * 3, 0.8);
      if (!res.kill && !m.dummy) this.giveCandy(res.decor ? 1 : 2, res.point, false);
    }
  }

  updatePushers() {
    const arr = U.pushers.value;
    let k = 0;
    for (const m of this.monsters.monsters) {
      if (k >= 15) break;
      if (!m.alive) continue;
      arr[k++].set(m.pos.x, 0, m.pos.z, 0.9 + m.T.hipW * 4);
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
      if (!m.alive || m.pos.z < -58 || m.npc) continue;
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
    if (w && this.phase === 'wave' && p.onGround && this.barrier.state === 'plowing') {
      const dz = w.z - p.pos.z;
      const v = this.barrier.plowSpeed;
      const pass = (w.length + BARRIER_FRONT + BARRIER_BACK + 0.3) / v;
      const t0 = Math.max(0.1, JUMP_V / GRAVITY - pass / 2);
      if (-dz / v <= t0 + 0.02 && -dz / v > t0 - 0.06) { p.vel.y = JUMP_V; p.onGround = false; }
    }
    mouse.dx = 0;
    mouse.dy = 0;
  }
}
