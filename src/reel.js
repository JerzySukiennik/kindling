import * as THREE from 'three';
import { groundHeight, LOBBY } from './world/layout.js';
import { PARKOUR, RANGE } from './world/lobby.js';

const FPS = 30;
const DT = 1 / 60;
const W = 1080;
const H = 1920;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const smooth = (a, b, x) => ease((x - a) / (b - a));
const lerp = THREE.MathUtils.lerp;
const Y0 = LOBBY.y;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Stage {
  constructor(k, reel) {
    this.k = k;
    this.reel = reel;
    this.game = k.game;
    this.m = k.monsters;
    this.p = k.player;
    this.cam = k.camera;
    this.r = 0;
    this.cutMul = 1;
    this.sm = {};
  }

  beat() { return (this.r - this.reel.anchor) / this.reel.period; }

  reset(area) {
    const g = this.game;
    this.m.clear();
    this.k.debris.clearAll();
    g.bot = false;
    g.botTarget = null;
    g.botAimT = 0.5;
    this.cutMul = 1;
    if (area === 'lobby') {
      g.enterLobby();
      g.lobbyTimer = 999;
    } else {
      g.phase = 'reel';
      this.p.setArea('zone');
      this.k.barrier.reset();
    }
    g.players = [];
  }

  remove(keep = []) {
    const M = this.m;
    for (let i = M.monsters.length - 1; i >= 0; i--) {
      const m = M.monsters[i];
      if (keep.includes(m) || m.npc || m.dummy) continue;
      for (const s of m.segs) if (s.attached) M.sticks.release(s.idx);
      M.setEye(m.eyeIdx, null);
      M.setEye(m.eyeIdx + 1, null);
      M.eyeFree.push(m.eyeIdx);
      M.monsters.splice(i, 1);
    }
  }

  spawn(type, x, z, seed, heading = 0, opts = {}) {
    const m = this.m.spawn(type, x, z, seed);
    m.pos.y = groundHeight(x, z);
    m.heading = heading;
    m.initFeet();
    Object.assign(m, opts);
    m.pose(0, this.game.time);
    return m;
  }

  place(m, x, z, heading) {
    m.pos.set(x, groundHeight(x, z), z);
    if (heading !== undefined) m.heading = heading;
    for (const L of m.legs) L.swing = null;
    for (const A of m.arms) A.swing = null;
    m.wasCrawl = false;
    m.initFeet();
    m.pose(0, this.game.time);
  }

  seg(m, key) { return m.segs.find((s) => s.key === key); }

  key(pos, intensity = 5) {
    this.light.position.copy(pos);
    this.light.intensity = intensity;
  }

  cutLeg(m, i, at = 0.5) {
    const s = this.seg(m, 'thigh' + i);
    if (s && s.attached) m.cut(s, at, this.game.time);
  }

  dancer(m, dance = true) {
    m.beatFn = () => this.beat();
    m.beatPeriod = this.reel.period;
    m.dance = dance;
    return m;
  }

  playerAt(x, z, yaw) {
    const p = this.p;
    p.pos.set(x, p.groundAt(x, z, 99), z);
    p.vel.set(0, 0, 0);
    p.yaw = yaw;
    p.pitch = 0.04;
    p.onGround = true;
    p.emote = null;
  }

  fire(n) {
    const b = this.k.bonfire;
    b.feed(n);
    b.shown = b.level;
  }

  prerun(sec) {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) this.k.sim(DT, DT);
  }

  look(pos, at, fov) {
    const c = this.cam;
    c.position.copy(pos);
    c.lookAt(at);
    if (Math.abs(c.fov - fov) > 1e-3) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  follow(key, target, rate, dt) {
    const s = this.sm[key];
    if (!s || this.fresh) { this.sm[key] = target.clone(); return this.sm[key]; }
    return s.lerp(target, Math.min(1, rate * dt));
  }
}

const zoneY = (x, z) => groundHeight(x, z);

const THRILLER = {
  song: 'music/thriller.mp3',
  offset: 14.0,
  dur: 42,
  anchor: 27.79,
  period: 0.5088,
  hit: 3.4,
  end: 38.5,
  fade: [37.4, 38.4],
  dips: [],
  tagline: 'They are made of sticks',
  lightning: [[3.4, 1], [14.1, 0.75], [27.79, 0.55], [35.93, 0.5]],
  captions: [],
  shots: [
    {
      at: 0,
      setup(S) {
        S.reset('zone');
        S.p.hidden = true;
        S.playerAt(-9, 2, 0);
        S.fire(1500);
        S.a = S.spawn('walker', -0.6, -70.4, 11, 0, { goal: V(-0.4, 0, 40), speedMul: 0.6 });
        S.spawn('stilt', 2.4, -73.8, 12, 0, { goal: V(2.6, 0, 40) });
        S.spawn('twig', -2.8, -72.2, 13, 0, { goal: V(-2.8, 0, 40), speedMul: 0.7 });
        S.spawn('brute', 4.4, -76.6, 14, 0, { goal: V(4.2, 0, 40) });
      },
      camera(S) {
        const k = ease((S.r - 3.29) / 5.3);
        const x = 1.0 - k * 0.2;
        const z = -58.6 + k * 3.4;
        const h = S.a.j.H;
        S.look(V(x, zoneY(x, z) + 0.5 + k * 0.8, z), V(lerp(0.3, h.x, 0.5), lerp(2.6, h.y * 0.85, 0.5), lerp(-66, h.z, 0.6)), 60);
      },
    },
    {
      at: 8.6,
      setup(S) {
        S.remove();
        S.e = S.spawn('walker', 0.8, -45.5, 21, 0, { goal: V(0.8, 0, 40) });
        S.spawn('twig', -2.2, -50, 22, 0, { goal: V(-2.2, 0, 40) });
        S.spawn('brute', 3.6, -52.5, 23, 0, { goal: V(3.6, 0, 40) });
        S.prerun(1.0);
      },
      camera(S, u) {
        const e = S.e;
        const x = e.pos.x - 2.7;
        const z = e.pos.z + 1.1 + u * 0.15;
        S.look(V(x, zoneY(x, z) + 0.32, z), V(e.pos.x, e.pos.y + 0.5, e.pos.z + 0.3), 44);
      },
    },
    {
      at: 12.4,
      setup(S) {
        S.remove();
        S.f = S.spawn('walker', 0.2, -37, 31, 0, { goal: V(0.2, 0, 40), speedMul: 0.32 });
        S.spawn('stilt', -3.5, -46, 32, 0, { goal: V(-3.5, 0, 40) });
        S.prerun(0.8);
      },
      camera(S, u) {
        const m = S.f;
        const k = ease(u / 3.6);
        const h = m.j.H;
        const pos = h.clone().addScaledVector(m.fwd, lerp(2.3, 1.3, k)).addScaledVector(m.lat, 0.18).add(V(0, -0.12, 0));
        S.look(pos, h, 38);
      },
    },
    {
      at: 16.0,
      setup(S) {
        S.remove();
        S.p.hidden = false;
        S.playerAt(0, 6, 0);
        S.game.players = [S.p];
        const types = ['walker', 'twig', 'walker', 'brute', 'stilt', 'walker', 'twig', 'walker', 'brute', 'walker', 'twig', 'stilt', 'walker', 'walker'];
        types.forEach((t, i) => {
          const x = (((i * 7) % 13) - 6) * 1.05 + (Math.random() - 0.5) * 0.8;
          const z = -7 - (i % 5) * 3.4 - Math.floor(i / 5) * 1.5;
          S.spawn(t, x, z, 100 + i, 0);
        });
        S.prerun(0.6);
      },
      camera(S, u) {
        const k = ease(u / 4.6);
        S.look(V(lerp(0.6, 1.6, k), lerp(8.5, 3.0, k), lerp(15.5, 10.5, k)), V(0, lerp(0.4, 1.6, k), lerp(-12, -9, k)), 60);
      },
    },
    {
      at: 20.6,
      setup(S) {
        S.remove();
        S.playerAt(0.4, 6.4, 0.05);
        S.game.players = [S.p];
        S.t = S.spawn('twig', -0.5, -1.2, 41, 0, { goal: V(0.4, 0, 6.4), speedMul: 0.28 });
        S.spawn('walker', 3.2, -13, 42, 0, { speedMul: 0.6 });
        S.spawn('brute', -3.6, -17, 43, 0, { speedMul: 0.6 });
        S.cutMul = 6;
        S.game.bot = true;
        S.game.botAimT = 0.4;
        const th = S.seg(S.t, 'thigh0');
        S.game.botTarget = () => (S.r > 21.25 && th.attached && S.t.alive ? th : null);
        S.prerun(0.5);
      },
      camera(S, u, dt) {
        const p = S.p;
        const k = ease(u / 4);
        const fwd = V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        const right = V(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const pos = p.pos.clone().addScaledVector(right, lerp(0.95, 0.8, k)).add(V(0, lerp(1.85, 1.75, k), 0)).addScaledVector(fwd, -lerp(1.9, 1.5, k));
        const th = S.seg(S.t, 'thigh0');
        const tgt = th.attached ? V().lerpVectors(th.A, th.B, 0.5) : S.t.j.P.clone();
        S.look(pos, S.follow('look5', tgt, 6, dt), 46);
      },
    },
    {
      at: 24.6,
      setup(S) {
        const g = S.game;
        g.bot = false;
        g.botTarget = null;
        S.cutMul = 1;
        g.players = [];
        S.t.goal = V(S.t.pos.x, 0, 50);
        S.t.speedMul = 0.3;
        const th = S.seg(S.t, 'thigh0');
        S.k.sticks.setEnds(th.idx, th.endA, 2, -1, g.time - 0.3);
      },
      camera(S, u, dt) {
        const m = S.t;
        const th = S.seg(m, 'thigh0');
        const k = ease(u / 3.19);
        const a = lerp(-1.9, -0.55, k);
        const P = th.B;
        const pos = P.clone().addScaledVector(m.fwd, Math.cos(a) * 1.3).addScaledVector(m.lat, Math.sin(a) * 1.3).add(V(0, 0.3, 0));
        S.look(S.follow('pos6', pos, 8, dt), S.follow('look6', P.clone().add(V(0, 0.25, 0)), 10, dt), 40);
      },
    },
    {
      at: 27.79,
      setup(S) {
        S.remove([S.t]);
        S.k.debris.clearAll();
        S.p.hidden = true;
        S.playerAt(-11, 1, 0);
        S.place(S.t, 0, 8.4, Math.PI);
        Object.assign(S.t, { goal: V(0, 0, -60), speedMul: 0.1 });
        S.dancer(S.t);
        S.d2 = S.dancer(S.spawn('walker', -3.8, 10.4, 51, Math.PI, { goal: V(-3.8, 0, -60), speedMul: 0.1 }));
        S.d3 = S.dancer(S.spawn('twig', 3.9, 10.2, 52, Math.PI, { goal: V(3.9, 0, -60), speedMul: 0.1 }));
        S.cutLeg(S.d2, 1, 0.55);
        S.cutLeg(S.d3, 0, 0.5);
      },
      camera(S, u, dt) {
        const k = ease(u / 4.07);
        const c = S.follow('c7', S.t.j.P, 5, dt);
        const a = lerp(-0.55, 0.35, k);
        const R = 3.3;
        const x = c.x + Math.sin(a) * R;
        const z = c.z - Math.cos(a) * R;
        S.look(V(x, zoneY(x, z) + lerp(0.75, 1.05, k), z), c.clone().add(V(0, 0.45, 0)), 52);
      },
    },
    {
      at: 31.86,
      setup(S) {
        S.c = S.dancer(S.spawn('walker', S.t.pos.x + 1.5, S.t.pos.z - 0.4, 61, Math.PI, { goal: V(S.t.pos.x + 1.5, 0, -60), speedMul: 0.55 }), false);
        S.cutLeg(S.c, 0, 0.35);
        S.cutLeg(S.c, 1, 0.4);
        S.footCam = null;
      },
      camera(S, u, dt) {
        const leg = S.t.legs.find((l) => l.state === 'full');
        if (!S.footCam) S.footCam = leg.foot.clone().add(V(-0.55, 0.16, -1.25));
        const pos = S.footCam.clone().add(V(u * 0.05, u * 0.12, -u * 0.08));
        const k = ease((u - 0.4) / 3.2);
        const look = V().lerpVectors(leg.foot.clone().add(V(0, 0.15, 0)), S.t.j.H, k);
        S.look(pos, S.follow('look8', look, 6, dt), 48);
      },
    },
    {
      at: 35.93,
      setup(S) {
        S.place(S.t, 0, 8.0, Math.PI);
        S.place(S.d2, -1.95, 8.9, Math.PI);
        S.place(S.d3, 1.95, 8.9, Math.PI);
        S.place(S.c, 0.95, 6.6, Math.PI);
        S.c.speedMul = 0.2;
        S.k.debris.clearAll();
        S.p.hidden = false;
        S.playerAt(-0.95, 6.5, 0);
        S.p.emote = { id: 'dance', t: 0.3 };
        S.key(V(-0.4, 2.4, 4.4), 5);
      },
      camera(S, u) {
        const k = ease(u / 2.5);
        S.look(V(lerp(0.3, 0, k), lerp(1.25, 2.4, k), lerp(2.0, -2.2, k)), V(0, lerp(1.5, 1.6, k), 8.2), 62);
      },
    },
  ],
};

const GHOSTBUSTERS = {
  song: 'music/ghostbusters.mp3',
  offset: 8.0,
  dur: 42,
  anchor: 4.94,
  period: 0.5215,
  hit: 4.94,
  end: 38.5,
  fade: [37.5, 38.4],
  dips: [[21.1, 21.63, 21.95]],
  tagline: 'Who you gonna burn?',
  lightning: [[4.94, 1], [19.54, 1], [20.58, 0.8], [21.63, 0.9]],
  captions: [[22.0, 25.6, 'Cut them apart'], [29.97, 31.95, 'Jump the wall'], [32.4, 35.9, 'Feed the fire']],
  shots: [
    {
      at: 0,
      setup(S) {
        S.reset('lobby');
        S.p.hidden = false;
        S.playerAt(1.6, 37.3, 2.68);
      },
      camera(S) {
        const k = ease((S.r - 4.94) / 4.17);
        S.look(V(lerp(-2.0, 5.2, k), lerp(16.5, Y0 + 2.8, k), lerp(46.5, 30.8, k)), V(lerp(0, 0.6, k), lerp(4.0, Y0 + 0.8, k), lerp(37.5, 39.6, k)), 60);
      },
    },
    {
      at: 9.11,
      setup(S) {
        S.playerAt(0.3, 37.1, 0.12);
        S.p.emote = { id: 'dance', t: 0.3 };
        S.key(V(1.0, Y0 + 2.3, 34.6), 7);
      },
      camera(S, u) {
        const k = ease(u / 2.09);
        S.look(V(lerp(1.3, 0.7, k), Y0 + lerp(0.75, 1.0, k), lerp(33.6, 34.3, k)), V(0.3, Y0 + 1.25, 37.1), 52);
      },
    },
    {
      at: 11.2,
      setup(S) {
        S.p.hidden = true;
        S.p.emote = null;
        S.mer = S.m.monsters.find((m) => m.npc);
        S.mer.lookAt = { pos: S.cam.position, head: S.cam.position };
        S.key(V(-8.4, Y0 + 2.8, 43.4), 6);
      },
      camera(S, u) {
        const k = ease(u / 2.09);
        S.look(V(lerp(-6.9, -7.7, k), Y0 + lerp(1.95, 1.8, k), lerp(42.3, 43.4, k)), V(-11.4, Y0 + lerp(2.2, 2.35, k), 45.0), 54);
      },
    },
    {
      at: 13.28,
      setup(S) {
        const w = S.k.lobby.wardrobe;
        S.k.shopUI.open = true;
        S.k.shopUI.mode = 'wardrobe';
        w.snapCamera();
        w.focus(null, null);
      },
      update(S, u) {
        if (u > 0.6) S.k.lobby.wardrobe.focus('costumes', 'pumpkin');
      },
      camera(S, u, dt) {
        const w = S.k.lobby.wardrobe;
        const it = w.items.get('costumes:pumpkin');
        const near = smooth(0.45, 1.5, u);
        const b = it.base;
        const pos = near > 0 ? V(lerp(7.0, b.x - 2.1, near), lerp(Y0 + 1.7, b.y + 0.62, near), lerp(45, b.z - 0.15, near)) : V(7.0, Y0 + 1.7, 45);
        S.look(S.follow('pos13', pos, 5, dt), S.follow('look13', V(b.x, b.y + 0.52, b.z), 6, dt), 40);
      },
    },
    {
      at: 15.37,
      setup(S) {
        const g = S.game;
        S.k.shopUI.open = false;
        S.k.lobby.wardrobe.focus(null, null);
        S.k.profile.data.equipped.costume = 'pumpkin';
        S.k.applyLook();
        S.p.hidden = false;
        S.playerAt(RANGE.shooter.x, RANGE.shooter.z, Math.PI + 0.06);
        g.phase = 'reel';
        g.players = [S.p];
        g.bot = true;
        S.cutMul = 3;
        const dm = S.m.monsters.filter((m) => m.dummy).sort((a, b) => a.pos.z - b.pos.z)[0];
        S.dm = dm;
        g.botTarget = () => {
          if (S.r < 15.6 || !dm.alive) return null;
          return ['uarm1', 'uarm0', 'torso'].map((k) => S.seg(dm, k)).find((s) => s && s.attached) || null;
        };
      },
      camera(S, u) {
        const k = ease(u / 2.09);
        S.look(V(lerp(-17.4, -17.9, k), Y0 + lerp(1.35, 1.5, k), lerp(34.0, 35.2, k)), V(-21.2, Y0 + 1.5, 42.5), 50);
      },
    },
    {
      at: 17.46,
      setup(S) {
        const g = S.game;
        g.bot = false;
        g.botTarget = null;
        S.cutMul = 1;
        const [x, z, h] = PARKOUR[4];
        S.playerAt(x, z, 0);
        S.p.pos.y = Y0 + h;
      },
      update(S, u) {
        const per = S.reel.period;
        const i = Math.min(3, Math.floor(u / per));
        const f = Math.min(1, (u - i * per) / per);
        const A = PARKOUR[4 + i];
        const B = PARKOUR[5 + i];
        const ay = Y0 + A[2];
        const by = Y0 + B[2];
        const hm = 0.95;
        const p = S.p;
        p.pos.set(lerp(A[0], B[0], f), lerp(ay, by, f) + 4 * hm * f * (1 - f), lerp(A[1], B[1], f));
        p.vel.set((B[0] - A[0]) / per, (by - ay) / per + 4 * hm * (1 - 2 * f) / per, (B[1] - A[1]) / per);
        p.onGround = f >= 1;
        p.yaw = Math.atan2(-(B[0] - A[0]), -(B[1] - A[1]));
      },
      camera(S, u, dt) {
        const c = S.p.pos;
        S.key(c.clone().add(V(-2.2, 1.6, -1.2)), 6);
        S.look(S.follow('pos12', c.clone().add(V(-4.6, 1.2, -2.2)), 4, dt), S.follow('look12', c.clone().add(V(0, 0.6, 0.8)), 6, dt), 55);
      },
    },
    {
      at: 19.54,
      setup(S) {
        S.p.hidden = true;
        S.k.lobby.ringBell();
      },
      update(S, u) {
        if (u > 1.04 && !S.rang) { S.rang = true; S.k.lobby.ringBell(); }
      },
      camera(S, u) {
        const k = ease(u / 2.09);
        S.look(V(lerp(1.1, 0.5, k), Y0 + lerp(11.0, 11.7, k), lerp(47.4, 48.6, k)), V(0, Y0 + 12.0, 54.2), 46);
      },
    },
    {
      at: 21.63,
      setup(S) {
        const g = S.game;
        S.remove();
        S.m.clear();
        g.newGame(null);
        g.phase = 'reel';
        g.round = 6;
        g.players = [S.p];
        S.p.hidden = false;
        S.playerAt(0, 6, 0);
        g.bot = true;
        const spots = [['walker', -3.5, -6], ['twig', 2.8, -8], ['brute', 0.5, -11], ['walker', -5.5, -13], ['stilt', 5, -14], ['twig', -1.8, -16], ['walker', 3, -19], ['brute', -4, -21], ['walker', 1, -23]];
        spots.forEach(([t, x, z], i) => S.spawn(t, x, z, 300 + i, 0));
        S.prerun(0.3);
      },
      camera(S, u, dt) {
        const p = S.p;
        const piv = p.pos.clone().add(V(0, 1.62, 0));
        const d = p.camDir;
        const right = V(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const pos = piv.clone().addScaledVector(d, -2.7).addScaledVector(right, 0.6).add(V(0, 0.35, 0));
        S.look(S.follow('pos20', pos, 10, dt), S.follow('look20', piv.clone().addScaledVector(d, 12).add(V(0, -0.4, 0)), 8, dt), 60);
      },
    },
    {
      at: 25.8,
      setup(S) {
        const g = S.game;
        S.remove();
        S.playerAt(0, 6.2, 0);
        S.cr = S.spawn('walker', 0.6, 0.6, 401, 0, { speedMul: 0.8 });
        S.cutLeg(S.cr, 0, 0.3);
        S.cutLeg(S.cr, 1, 0.35);
        S.cutMul = 4;
        const neck = S.seg(S.cr, 'neck');
        g.botTarget = () => (S.r > 26.55 && neck.attached && S.cr.alive ? neck : null);
        S.crCam = null;
      },
      camera(S, u, dt) {
        const m = S.cr;
        if (m.alive || !S.crCam) {
          S.crCam = { pos: m.pos.clone().addScaledVector(m.fwd, 3.7).addScaledVector(m.lat, 1.0).add(V(0, 0.55, 0)), look: m.j.H.clone() };
        }
        S.look(S.follow('pos21', S.crCam.pos, 6, dt), S.follow('look21', S.crCam.look, 8, dt), 46);
      },
    },
    {
      at: 27.89,
      setup(S) {
        const g = S.game;
        S.remove();
        g.botTarget = null;
        S.cutMul = 1;
        const types = ['walker', 'brute', 'twig', 'walker', 'stilt', 'brute', 'walker', 'twig', 'walker', 'brute'];
        const dead = types.map((t, i) => S.spawn(t, -8 + i * 1.8, -10 + (i % 4) * 2.4, 500 + i, 0));
        S.prerun(0.1);
        for (const m of dead) m.die(g.time, 'torso');
        S.prerun(1.2);
        S.playerAt(0.2, 7.2, 0);
        S.k.barrier.reset();
        g.phase = 'fight';
        g.barrierPending = false;
        g.sweepDelay = -1;
        S.k.barrier.rise();
        for (let i = 0; i < 1500; i++) {
          const b = S.k.barrier;
          if (b.state === 'moving' && b.z >= -10.4) break;
          S.k.sim(DT, DT);
        }
        S.playerAt(0.2, 7.2, 0);
      },
      camera(S, u, dt) {
        const b = S.k.barrier;
        if (u < 2.086) {
          S.look(V(0.9, zoneY(0.9, 10.4) + 0.8, 10.4), S.follow('look22', V(-0.3, 1.3, b.z), 5, dt), 56);
        } else {
          const k = ease((u - 2.086) / 2.08);
          S.look(V(lerp(3.2, 2.6, k), lerp(3.6, 3.9, k), lerp(13.0, 13.4, k)), V(-0.2, 0.8, lerp(3.5, 4.5, k)), 56);
        }
      },
    },
    {
      at: 32.06,
      setup(S) {
        S.game.phase = 'reel';
        S.fire(900);
        S.k.bonfire.shown = 0.6;
      },
      camera(S, u) {
        const k = ease(u / 4.17);
        S.look(V(lerp(-2.6, -5.5, k), lerp(1.4, 6.8, k), lerp(10.6, 2.2, k)), V(0, lerp(1.6, 1.2, k), lerp(16.5, 17.0, k)), 58);
      },
    },
    {
      at: 36.23,
      setup(S) {
        S.game.bot = false;
        S.playerAt(0, 10.4, 0);
        S.p.emote = { id: 'laugh', t: 0 };
        S.key(V(0.6, zoneY(0, 8) + 2.0, 8.0), 7);
      },
      camera(S, u) {
        const k = ease(u / 2.27);
        const g = zoneY(0, 10.4);
        S.look(V(lerp(0.5, 0.35, k), zoneY(0.5, 7.4) + lerp(0.85, 1.0, k), lerp(7.4, 7.9, k)), V(0, g + 1.45, 10.4), 50);
      },
    },
  ],
};

const REELS = { thriller: THRILLER, ghostbusters: GHOSTBUSTERS };

function emberSprite() {
  const sp = document.createElement('canvas');
  sp.width = sp.height = 64;
  const g = sp.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,150,1)');
  gr.addColorStop(0.18, 'rgba(255,150,50,0.85)');
  gr.addColorStop(0.45, 'rgba(255,90,10,0.25)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return sp;
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

class Overlay {
  constructor(reel) {
    this.reel = reel;
    this.cv = document.createElement('canvas');
    this.cv.width = W;
    this.cv.height = H;
    this.c = this.cv.getContext('2d');
    this.sprite = emberSprite();
    this.word = 'Kindling';
  }

  embers(r, alpha, count = 70) {
    const c = this.c;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const sp = 0.05 + hash(i + 1) * 0.12;
      const ph = (r * sp + hash(i + 7)) % 1;
      const x = hash(i + 3) * W + Math.sin(r * (0.6 + hash(i + 9)) + i) * 40;
      const y = H * 1.05 - ph * H * 1.2;
      const s = (3 + hash(i + 5) * 9) * (1 - ph * 0.5);
      const a = alpha * Math.min(1, (1 - ph) * 1.8) * (0.55 + 0.45 * Math.sin(r * 9 + i * 1.7));
      if (a <= 0) continue;
      c.globalAlpha = a;
      c.drawImage(this.sprite, x - s * 3, y - s * 3, s * 6, s * 6);
    }
    c.restore();
  }

  glowBottom(alpha) {
    const c = this.c;
    const g = c.createRadialGradient(W / 2, H * 1.08, 0, W / 2, H * 1.08, H * 0.6);
    g.addColorStop(0, `rgba(120,45,10,${0.55 * alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  title(r0, r, y, size = 200) {
    const c = this.c;
    c.save();
    c.font = `${size}px "IM Fell English SC"`;
    c.textBaseline = 'alphabetic';
    const w = c.measureText(this.word).width;
    const x0 = W / 2 - w / 2;
    for (let i = 0; i < this.word.length; i++) {
      const p = clamp01((r - r0 - i * 0.14) / 0.75);
      if (p <= 0) continue;
      const e = 1 - Math.pow(1 - p, 3);
      const x = x0 + c.measureText(this.word.slice(0, i)).width;
      const flick = 0.75 + 0.25 * Math.sin(r * 7.3 + i * 2.1) * Math.sin(r * 3.1 + i);
      c.globalAlpha = e;
      c.filter = p < 1 ? `blur(${((1 - e) * 16).toFixed(1)}px)` : 'none';
      const hot = 1 - e;
      c.fillStyle = `rgb(${Math.round(lerp(239, 255, hot))},${Math.round(lerp(230, 190, hot))},${Math.round(lerp(214, 110, hot))})`;
      c.shadowColor = `rgba(255,${Math.round(130 + 40 * hot)},40,${(0.55 + 0.35 * hot) * flick})`;
      c.shadowBlur = 50 + 40 * hot;
      c.fillText(this.word[i], x, y + (1 - e) * size * 0.25);
      c.shadowBlur = 0;
      c.fillText(this.word[i], x, y + (1 - e) * size * 0.25);
    }
    c.restore();
    return w;
  }

  line(p, y, w) {
    if (p <= 0) return;
    const c = this.c;
    const e = ease(p);
    const lw = w * e;
    c.save();
    const g = c.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
    g.addColorStop(0, 'rgba(255,138,31,0)');
    g.addColorStop(0.5, 'rgba(255,150,50,0.95)');
    g.addColorStop(1, 'rgba(255,138,31,0)');
    c.fillStyle = g;
    c.shadowColor = 'rgba(255,130,30,0.8)';
    c.shadowBlur = 18;
    c.fillRect(W / 2 - lw / 2, y - 2, lw, 4);
    c.restore();
  }

  text(str, y, { size = 48, weight = 600, spacing = 10, color = 'rgba(239,230,214,0.8)', alpha = 1, rise = 0, glow = 0 } = {}) {
    if (alpha <= 0) return;
    const c = this.c;
    c.save();
    c.font = `${weight} ${size}px "Barlow Condensed"`;
    c.letterSpacing = spacing + 'px';
    c.textAlign = 'center';
    c.globalAlpha = alpha;
    c.fillStyle = color;
    if (glow) { c.shadowColor = `rgba(255,130,30,${glow})`; c.shadowBlur = 24; }
    c.fillText(str.toUpperCase(), W / 2 + spacing / 2, y + rise);
    c.restore();
  }

  pill(str, y, alpha) {
    if (alpha <= 0) return;
    const c = this.c;
    c.save();
    c.font = '600 64px "Barlow Condensed"';
    c.letterSpacing = '3px';
    const tw = c.measureText(str).width;
    const pw = tw + 90;
    const ph = 118;
    c.globalAlpha = alpha;
    c.beginPath();
    c.roundRect(W / 2 - pw / 2, y - ph / 2, pw, ph, ph / 2);
    c.fillStyle = 'rgba(255,138,31,0.16)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255,150,50,0.9)';
    c.shadowColor = 'rgba(255,130,30,0.7)';
    c.shadowBlur = 26;
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#fff3e0';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(str, W / 2 + 1.5, y + 3);
    c.restore();
  }

  caption(r) {
    for (const [a, b, str] of this.reel.captions) {
      if (r < a || r > b) continue;
      const pin = ease((r - a) / 0.2);
      const pout = 1 - ease((r - (b - 0.22)) / 0.22);
      this.text(str, 1330, { size: 96, weight: 700, spacing: 6, color: '#fff6ea', alpha: Math.min(pin, pout), rise: (1 - pin) * 36, glow: 0.65 });
    }
  }

  draw(src, r) {
    const R = this.reel;
    const c = this.c;
    c.globalAlpha = 1;
    c.drawImage(src, 0, 0, W, H);
    let black = r < R.hit ? 1 : 0;
    black = Math.max(black, smooth(R.fade[0], R.fade[1], r));
    for (const [a, m, b] of R.dips) {
      if (r >= a && r < m) black = Math.max(black, smooth(a, m, r));
      else if (r >= m && r < b) black = Math.max(black, 1 - smooth(m, b, r));
    }
    if (black > 0) {
      c.globalAlpha = black;
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    if (r < R.hit) {
      const out = smooth(R.hit - 0.35, R.hit, r);
      this.glowBottom(smooth(0, 1.5, r));
      this.embers(r, smooth(0.2, 1.4, r) * (1 - out));
      c.save();
      c.globalAlpha = 1 - out;
      const w = this.title(0.45, r, 900, 250);
      this.line(clamp01((r - 1.5) / 0.8), 958, w * 1.05);
      this.text(R.tagline, 1065, { size: 52, spacing: 12, alpha: smooth(1.9, 2.6, r) * (1 - out) });
      c.restore();
    }
    if (r >= R.end) {
      const e = r - R.end;
      this.glowBottom(smooth(0, 1.2, e));
      this.embers(r, smooth(0, 0.8, e));
      const w = this.title(R.end + 0.1, r, 800, 250);
      this.line(clamp01((e - 0.8) / 0.7), 860, w * 1.05);
      const a1 = smooth(0.55, 1.0, e);
      this.text('New game', 1000, { size: 92, weight: 600, spacing: 28, color: '#ff9a3c', alpha: a1, rise: (1 - a1) * 26, glow: 0.55 });
      const a2 = smooth(1.0, 1.4, e);
      this.text('Play free in your browser', 1105, { size: 46, weight: 500, spacing: 10, alpha: a2 * 0.85 });
      this.pill('kindling.gzowo.fun', 1235, smooth(1.3, 1.75, e));
    }
    if (r >= R.hit && r < R.hit + 0.35) {
      c.globalAlpha = 0.9 * (1 - (r - R.hit) / 0.35);
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    this.caption(r);
    return this.cv;
  }
}

export async function setupReel(k, name) {
  const reel = REELS[name];
  if (!reel) throw new Error('unknown reel ' + name);
  await Promise.all([
    document.fonts.load('210px "IM Fell English SC"'),
    document.fonts.load('600 60px "Barlow Condensed"'),
    document.fonts.load('700 96px "Barlow Condensed"'),
    document.fonts.load('500 40px "Barlow Condensed"'),
  ]);
  Math.random = mulberry32(20261031);
  const S = new Stage(k, reel);
  S.light = new THREE.PointLight(0xffd9b0, 0, 9, 1.4);
  k.scene.add(S.light);
  let simT = -DT;
  performance.now = () => (simT + 20) * 1000;
  const P = k.profile;
  P.save = () => {};
  P.data.upgrades = { power: 0, cooling: 0, focus: 0 };
  P.data.owned.abilities = [];
  P.data.equipped = { weapon: 'torch', beam: 'toxic', costume: 'none', body: 'keeper' };
  k.applyLook();
  k.game.applyLoadout();
  k.enterPlay();
  k.settings.quality = 'high';
  k.applyPreset.auto = 'high';
  k.applyPreset('high');
  k.input.locked = true;
  k.input.enabled = false;
  k.audio.beatNow = () => S.beat();
  const cutTime = k.game.cutTime.bind(k.game);
  k.game.cutTime = (r) => cutTime(r) * S.cutMul;
  const overlay = new Overlay(reel);
  const lightning = reel.lightning.map((l) => [...l]);
  let shot = null;
  k.reelHook = (dt) => {
    if (shot && shot.camera) shot.camera(S, S.r - shot.at, dt);
    S.fresh = false;
  };
  const step = (render) => {
    k.frozen = false;
    simT += DT;
    S.r = simT;
    let next = null;
    for (const s of reel.shots) if (s.at <= simT + 1e-6) next = s;
    if (next && next !== shot) {
      S.light.intensity = 0;
      shot = next;
      S.sm = {};
      S.fresh = true;
      shot.setup(S);
    }
    for (const l of lightning) if (!l.done && simT >= l[0]) { l.done = true; k.game.lightning(l[1]); }
    if (shot && shot.update) shot.update(S, simT - shot.at, DT);
    k.game.gunHeat = 0;
    k.game.overheat = false;
    if (render) k.tick(DT); else k.sim(DT, DT);
  };
  window.frame = (i, q = 0.92) => {
    const T = i / FPS;
    const n = Math.max(1, Math.round((T - simT) / DT));
    for (let s = 0; s < n; s++) step(s === n - 1);
    k.frozen = true;
    const cv = overlay.draw(k.R.renderer.domElement, simT);
    return cv.toDataURL('image/jpeg', q);
  };
  window.reelInfo = { fps: FPS, frames: Math.round(reel.dur * FPS), offset: reel.offset, dur: reel.dur, song: reel.song };
  window.reelStage = S;
  window.reelReady = true;
}
