import * as THREE from 'three';
import { RemotePlayer, encodeState } from './remote.js';
import { HIDE } from './barrier.js';
import { groundHeight, LOBBY } from '../world/layout.js';

const TYPE_LIST = ['twig', 'walker', 'brute', 'stilt'];
const B_STATES = ['hidden', 'rising', 'up', 'moving', 'lowering', 'plowing', 'dumping'];
const NIGHT = ['intermission', 'spawning', 'fight', 'sweep', 'wave', 'burn'];
const LOBBY_MS = 45000;
const SEND = 0.1;
const HOST = 0.125;
const DELAY = 0.13;
const f2 = (v) => Math.round(v * 100) / 100;

export class Multiplayer {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.remotes = new Map();
    this.byNid = new Map();
    this.mCache = new Map();
    this.slots = [];
    this.g = null;
    this.nidSeq = 1;
    this.sendT = 0;
    this.hostT = 0;
    this.indexT = 0;
    this.trimT = 5;
    this.rosterT = 0;
    this.lt = 0;
    this.lastPh = null;
    this.lastR = 0;
    this.lastG = '';
    this.gAge = 0;
    this.overT = -1;
    this.bMismatch = 0;
    this.priv = false;
    this.tags = document.getElementById('name-tags');
    this.rosterEl = document.getElementById('hud-roster');
    this.feedEl = document.getElementById('hud-feed');
    this.wire();
  }

  get uid() { return this.net.uid; }
  get isHost() { return this.net.isHost; }
  get code() { return this.net.sid; }
  clock() { return performance.now() / 1000; }
  crewSize() { return Math.max(1, this.net.players.size); }
  event(k, data) { this.net.event(k, data); }

  wire() {
    const N = this.net;
    N.cb.players = (map) => this.syncPlayers(map);
    N.cb.state = (uid, str) => { const r = this.remotes.get(uid); if (r) r.push(str, this.clock()); };
    N.cb.stateGone = (uid) => { const r = this.remotes.get(uid); if (r) r.gone(); };
    N.cb.hostG = (g) => { this.g = g; };
    N.cb.mAdd = (k, v) => this.mUpdate(+k, v);
    N.cb.mChange = (k, v) => this.mUpdate(+k, v);
    N.cb.mRemove = (k) => this.mRemove(+k);
    N.cb.event = (e) => this.onEvent(e);
    N.cb.host = (me) => { if (me) this.becomeHost(); else this.becomeClient(); };
    this.syncPlayers(N.players);
    const t = this.clock();
    for (const [uid, str] of N.states) { const r = this.remotes.get(uid); if (r) r.push(str, t); }
    if (N.g && !N.isHost) this.g = N.g;
    if (!N.isHost) for (const [k, v] of N.mData) this.mUpdate(+k, v);
  }

  start(priv) {
    this.priv = !!priv;
    this.game.enterLobby();
    this.updateLook();
    this.feed(`Server ${this.code}`);
  }

  async leave() {
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.byNid.clear();
    this.mCache.clear();
    this.rosterEl.innerHTML = '';
    this.rosterEl.classList.add('hidden');
    await this.net.leave();
  }

  updateLook() {
    const eq = this.profile.data.equipped;
    this.net.setMe({ lk: `${eq.costume || 'none'}|${eq.beam || 'toxic'}` });
  }

  feed(text) {
    const el = document.createElement('div');
    el.className = 'feed-line';
    el.textContent = text;
    this.feedEl.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 5200);
  }

  syncPlayers(map) {
    const G = this.game;
    this.slots = [...map.entries()].sort((a, b) => (a[1].j || 0) - (b[1].j || 0) || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
    if (this.spawnPending && this.slots.includes(this.uid)) {
      this.spawnPending = false;
      if (G.phase === 'lobby') G.player.pos.x = LOBBY.spawn.x + this.spawnX();
    }
    for (const [uid, info] of map) {
      if (uid === this.uid) continue;
      let r = this.remotes.get(uid);
      if (!r) {
        r = new RemotePlayer(this.scene, uid, info, this.tags);
        this.remotes.set(uid, r);
        this.feed(`${r.nick} joined`);
      } else {
        const was = r.ready;
        r.setInfo(info);
        if (!was && r.ready && G.phase === 'lobby') { this.lobby.ringBell(); this.audio.bell(1); this.feed(`${r.nick} is ready`); }
      }
    }
    for (const [uid, r] of this.remotes) {
      if (map.has(uid)) continue;
      this.feed(`${r.nick} left`);
      r.dispose();
      this.remotes.delete(uid);
    }
    this.renderRoster();
  }

  renderRoster() {
    const G = this.game;
    const lobby = G.phase === 'lobby' || G.phase === 'transition';
    const rows = this.slots.map((uid) => {
      const info = this.net.players.get(uid) || {};
      const mine = uid === this.uid;
      const r = this.remotes.get(uid);
      const ghost = lobby ? false : mine ? !G.player.alive : r ? r.ghost : false;
      const state = lobby ? (info.rd ? 'ready' : '') : ghost ? 'ghost' : '';
      const host = uid === this.net.hostUid ? '<i class="crown"></i>' : '';
      return `<div class="ro ${mine ? 'me' : ''} ${ghost ? 'gh' : ''}">${host}<span>${esc(info.n || '?')}</span><em>${state}</em></div>`;
    });
    this.rosterEl.innerHTML = `<div class="ro-head">Server <b>${this.code}</b>${this.priv ? ' · private' : ''}</div>${rows.join('')}`;
    this.rosterEl.classList.remove('hidden');
  }

  setReady(on) { this.net.setMe({ rd: !!on }); }

  spawnX() {
    const i = Math.max(0, this.slots.indexOf(this.uid));
    return [0, -1.7, 1.7, -3.4][i] || 0;
  }

  readyText() {
    let n = 0;
    for (const p of this.net.players.values()) if (p.rd) n++;
    return `${n}/${this.net.players.size} ready`;
  }

  lobbyLeft() {
    const end = this.isHost ? this.lt : this.g ? this.g.lt : 0;
    if (!end) return LOBBY_MS / 1000;
    return Math.max(0, (end - this.net.now()) / 1000);
  }

  async refreshBoard() {
    try {
      const [teams, players] = await Promise.all([this.net.topTeams(6), this.net.topPlayers(6)]);
      if (!this.net.sid) return;
      this.lobby.online = { teams, players };
      this.lobby.drawBoard(this.profile);
    } catch (e) { /* offline */ }
  }

  onLobby() {
    this.refreshBoard();
    if (this.slots.includes(this.uid)) this.game.player.pos.x = LOBBY.spawn.x + this.spawnX();
    else this.spawnPending = true;
    if (this.net.me && this.net.me.rd) this.setReady(false);
    this.byNid.clear();
    if (this.isHost) {
      this.lt = this.net.now() + LOBBY_MS;
      this.net.hostWrite({ m: null });
      this.mCache.clear();
    }
    this.lastPh = 'lobby';
  }

  onGameOver() {
    const G = this.game;
    const rounds = Math.max(0, G.round - 1);
    const nick = (this.net.me && this.net.me.n) || 'Keeper';
    this.net.submitPlayer(nick, rounds, G.stats.sticks);
    if (this.isHost) {
      const names = this.slots.map((u) => (this.net.players.get(u) || {}).n).filter(Boolean).join(', ');
      this.net.submitTeam(rounds, names);
      this.overT = this.net.now() + 7000;
    }
  }

  targets() {
    const out = [this.game.player];
    for (const r of this.remotes.values()) if (r.seen) out.push(r);
    return out;
  }

  slotOf(p) {
    if (!p) return -1;
    if (p === this.game.player) return this.slots.indexOf(this.uid);
    return p.uid ? this.slots.indexOf(p.uid) : -1;
  }

  slotPlayer(i) {
    const uid = this.slots[i];
    if (!uid) return null;
    if (uid === this.uid) return this.game.player;
    return this.remotes.get(uid) || null;
  }

  grab(p, m) { if (p.uid) this.net.event('grab', { to: p.uid, m: m.nid || 0 }); }

  requestCut(m, seg, at) {
    this.net.event('cut', { m: m.nid, s: seg.key, a: Math.round(at * 1000) / 1000 });
  }

  applyCut(m, key, at, by, silent) {
    if (!m || !m.alive) return;
    if (m.cuts.some((c) => c[0] === key && c[1] === at)) return;
    const seg = m.segs.find((s) => s.key === key);
    if (!seg || !seg.attached) return;
    m.lastCutBy = by;
    m.cuts.push([key, at]);
    if (this.isHost) m.cutsDirty = true;
    const res = m.cut(seg, at, this.game.time);
    if (res && !silent) this.game.cutFx(res, seg, m, by === this.uid);
  }

  onEvent(e) {
    const G = this.game;
    if (!e || !e.k) return;
    if (e.k === 'cut') this.applyCut(this.byNid.get(e.m), e.s, e.a, e.by, false);
    else if (e.k === 'grab') {
      if (e.to === this.uid && G.player.alive && NIGHT.includes(G.phase)) G.killPlayer(G.player, 'grab');
    } else if (e.k === 'slow' && e.by !== this.uid) {
      G.slowT = 5;
      this.audio.whoosh(0.6);
      G.lightning(0.25);
    } else if (e.k === 'spk' && e.by !== this.uid && NIGHT.includes(G.phase)) {
      G.spikes = { x: e.x, z: e.z, t: 0, life: 15, hitSet: new Set(), own: false };
      this.audio.rumble(new THREE.Vector3(e.x, 0.5, e.z), 1.0, 0.8);
    }
  }

  mUpdate(nid, v) {
    if (!v) return;
    const prev = this.mCache.get(nid) || {};
    const cur = { ...prev, ...v };
    this.mCache.set(nid, cur);
    const m = this.byNid.get(nid);
    if (!m) return;
    if (v.p) this.sample(m, v.p);
    if (v.c != null) this.reconcile(m, v.c, false);
  }

  mRemove(nid) {
    this.mCache.delete(nid);
    const m = this.byNid.get(nid);
    this.byNid.delete(nid);
    if (!m || !m.alive) return;
    if (NIGHT.includes(this.game.phase)) { m.lastCutBy = null; m.die(this.game.time, 'torso'); } else this.drop(m);
  }

  drop(m) {
    const M = this.game.monsters;
    const i = M.monsters.indexOf(m);
    if (i < 0) return;
    for (const s of m.segs) if (s.attached) M.sticks.release(s.idx);
    M.setEye(m.eyeIdx, null);
    M.setEye(m.eyeIdx + 1, null);
    M.eyeFree.push(m.eyeIdx);
    M.monsters.splice(i, 1);
  }

  sample(m, p) {
    const a = p.split(',').map(Number);
    m.netBuf.push({ t: this.clock(), x: a[0], z: a[1], h: a[2], sp: a[3], st: a[4], at: a[5], tg: a[6] });
    if (m.netBuf.length > 6) m.netBuf.shift();
  }

  reconcile(m, c, silent) {
    const list = c ? c.split(';') : [];
    for (let i = m.cuts.length; i < list.length; i++) {
      const [key, at] = list[i].split('@');
      this.applyCut(m, key, Number(at), null, silent);
      if (!m.alive) break;
    }
  }

  ensurePuppets() {
    const M = this.game.monsters;
    for (const [nid, v] of this.mCache) {
      if (this.byNid.has(nid) || !v.p || v.t == null) continue;
      const [x, z, h] = v.p.split(',').map(Number);
      const m = M.spawn(TYPE_LIST[v.t] || 'walker', x, z, v.s);
      Object.assign(m, { nid, net: true, puppet: true, heading: h, netBuf: [], cuts: [] });
      m.pos.y = groundHeight(x, z);
      m.initFeet();
      m.pose(0, this.game.time);
      this.byNid.set(nid, m);
      this.sample(m, v.p);
      if (v.c) { m.silent = true; this.reconcile(m, v.c, true); m.silent = false; }
    }
  }

  puppets(dt) {
    const t = this.clock() - DELAY;
    for (const m of this.byNid.values()) {
      if (!m.alive || !m.puppet || !m.netBuf.length) continue;
      const b = m.netBuf;
      let a = b[0];
      let c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= t && b[i + 1].t >= t) { a = b[i]; c = b[i + 1]; break; }
      let x;
      let z;
      let h;
      if (t > c.t) {
        const ex = Math.min(0.25, t - c.t);
        x = c.x + Math.sin(c.h) * c.sp * ex;
        z = c.z + Math.cos(c.h) * c.sp * ex;
        h = c.h;
      } else {
        const k = c.t > a.t ? THREE.MathUtils.clamp((t - a.t) / (c.t - a.t), 0, 1) : 1;
        x = THREE.MathUtils.lerp(a.x, c.x, k);
        z = THREE.MathUtils.lerp(a.z, c.z, k);
        let dh = c.h - a.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        h = a.h + dh * k;
      }
      m.pos.x = x;
      m.pos.z = z;
      m.heading = h;
      m.speedNow = c.sp;
      if (c.st === 1 && m.state !== 'attack') {
        m.state = 'attack';
        m.attackT = c.at;
        m.attackDone = true;
        this.game.monsters.onAttackStart(m, null);
      } else if (c.st === 0 && m.state === 'attack') m.state = 'walk';
      m.target = this.slotPlayer(c.tg);
    }
  }

  becomeHost() {
    const G = this.game;
    let maxNid = 0;
    for (const m of this.byNid.values()) {
      maxNid = Math.max(maxNid, m.nid);
      if (m.alive) { m.puppet = false; m.goal = undefined; m.netP = undefined; }
    }
    this.nidSeq = Math.max(this.nidSeq, maxNid + 1);
    const g = this.g;
    if (!g) return;
    this.feed('You are now hosting this server');
    this.lt = g.lt || this.net.now() + LOBBY_MS;
    G.queue = [];
    G.lastSpawn = null;
    G.sweepDelay = -1;
    G.total = g.tot || 0;
    G.timer = g.tm ? Math.max(0.5, (g.tm - this.net.now()) / 1000) : 3;
    if (G.phase === 'spawning') G.phase = 'fight';
    G.barrierPending = G.phase === 'fight' && G.barrier.state === 'hidden';
    if (G.phase === 'burn') G.timer = 2;
    if (G.phase === 'transition') G.transT = 0;
    if (G.phase === 'gameover') this.overT = this.net.now() + 4000;
  }

  becomeClient() {
    for (const m of this.byNid.values()) if (m.alive) { m.puppet = true; m.netBuf = m.netBuf || []; }
  }

  syncBarrier(g) {
    const B = this.game.barrier;
    const [bs, bz, bt] = String(g.b || '0,0,0').split(',').map(Number);
    const li = B_STATES.indexOf(B.state);
    if (bs === 1 && li === 0) B.rise();
    else if (bs === 3 && li === 2) B.go();
    else if (bs >= 2 && bs <= 5 && li === 0) {
      B.state = B_STATES[bs];
      B.z = bz;
      B.t = bt;
      B.yC = B.yW = bs >= 4 ? HIDE : 0;
    }
    if (bs === li && (bs === 3 || bs === 5) && Math.abs(B.z - bz) > 0.8) B.z += (bz - B.z) * 0.35;
    if (bs === 0 && li >= 1 && li <= 3) {
      this.bMismatch += 1;
      if (this.bMismatch > 60) { B.reset(); this.bMismatch = 0; }
    } else this.bMismatch = 0;
  }

  edge(g) {
    const G = this.game;
    const prevPh = this.lastPh;
    this.lastPh = g.ph;
    this.lastR = g.r;
    const ph = g.ph;
    const local = G.phase;
    if (ph === 'lobby') { if (local !== 'lobby') G.enterLobby(); return; }
    if (ph === 'transition') { if (local === 'lobby') G.startNight(); return; }
    if (ph === 'gameover') { if (NIGHT.includes(local)) G.endGame(); return; }
    if (!NIGHT.includes(ph)) return;
    if (!NIGHT.includes(local)) {
      const fresh = local === 'transition' && g.r === 1;
      this.audio.toMatch();
      G.resetNight();
      this.byNid.clear();
      G.round = g.r;
      G.phase = ph;
      G.roundUI(fresh);
      if (fresh) this.audio.restartMusic();
      G.events.fade(false);
      if (!fresh) {
        G.player.setGhost(true);
        G.hud.ghost(true);
        G.hud.message('The night has started', 'You join as a ghost until the next round', 3.4);
      }
      return;
    }
    if (g.r > G.round) {
      if (G.round >= 1) G.roundBonus();
      G.round = g.r;
      G.phase = 'intermission';
      G.roundUI(false);
    }
    if (ph === 'spawning' && prevPh === 'intermission') G.roundStartUI(g.tot, g.r > 1);
    if (ph === 'sweep' && prevPh === 'fight') {
      G.hud.message('Here it comes', g.r === 1 ? 'Jump over the barrier with Space' : '', 3);
      this.audio.rumble(new THREE.Vector3(0, 1, -30), 9, 0.8);
    }
    if (NIGHT.indexOf(ph) > NIGHT.indexOf(G.phase)) G.phase = ph;
  }

  mirror(dt) {
    const g = this.g;
    const G = this.game;
    if (!g) return;
    if (g.ph !== this.lastPh || g.r !== this.lastR) this.edge(g);
    if (!NIGHT.includes(G.phase)) return;
    this.ensurePuppets();
    if (G.phase === 'intermission') G.timer = g.tm ? (g.tm - this.net.now()) / 1000 : 0;
    this.syncBarrier(g);
    if (g.fl > G.bonfire.level) G.bonfire.level = g.fl;
  }

  preUpdate(dt) {
    const now = this.clock();
    const beat = this.audio.beatNow(this.game.time);
    for (const r of this.remotes.values()) r.update(dt, now, beat, this.camera, this.particles);
    if (!this.isHost) this.puppets(dt);
  }

  encodeMonster(m) {
    return `${f2(m.pos.x)},${f2(m.pos.z)},${f2(m.heading)},${f2(m.speedNow)},${m.state === 'attack' ? 1 : 0},${f2(m.attackT || 0)},${this.slotOf(m.target)}`;
  }

  hostTick() {
    const G = this.game;
    const N = this.net;
    const up = {};
    for (const m of G.monsters.monsters) {
      if (m.dummy || m.npc || !m.alive) continue;
      if (!m.net) {
        m.net = true;
        m.nid = this.nidSeq++;
        m.cuts = m.cuts || [];
        this.byNid.set(m.nid, m);
        m.netP = this.encodeMonster(m);
        up[`m/${m.nid}`] = { t: TYPE_LIST.indexOf(m.type), s: m.seed, p: m.netP, c: '' };
        continue;
      }
      const p = this.encodeMonster(m);
      if (p !== m.netP) { up[`m/${m.nid}/p`] = p; m.netP = p; }
      if (m.cutsDirty) { up[`m/${m.nid}/c`] = m.cuts.map(([k, a]) => `${k}@${a}`).join(';'); m.cutsDirty = false; }
    }
    for (const [nid, m] of this.byNid) {
      if (m.alive) continue;
      up[`m/${nid}`] = null;
      this.byNid.delete(nid);
    }
    const B = G.barrier;
    const g = {
      ph: G.phase, r: G.round,
      tm: G.phase === 'intermission' && !G.introSync ? Math.round(N.now() + G.timer * 1000) : 0,
      lt: Math.round(this.lt), q: G.queue ? G.queue.length : 0, tot: G.total || 0,
      b: `${B_STATES.indexOf(B.state)},${f2(B.z)},${f2(B.t)}`, fl: f2(G.bonfire.level),
    };
    const s = JSON.stringify(g);
    this.gAge += HOST;
    if (s !== this.lastG || this.gAge > 1) { up.g = g; this.lastG = s; this.gAge = 0; }
    if (Object.keys(up).length) N.hostWrite(up);
  }

  hostLogic(dt) {
    const G = this.game;
    const N = this.net;
    if (G.phase === 'lobby') {
      let all = N.players.size > 0;
      for (const p of N.players.values()) if (!p.rd) all = false;
      if (all) this.lt = Math.min(this.lt, N.now() + 4000);
    }
    if (NIGHT.includes(G.phase) && !G.player.alive) {
      let anyAlive = false;
      for (const uid of N.players.keys()) {
        if (uid === this.uid) continue;
        const r = this.remotes.get(uid);
        if (r && r.seen && r.alive) anyAlive = true;
      }
      if (!anyAlive) G.endGame();
    }
    if (this.overT > 0 && N.now() >= this.overT) {
      this.overT = -1;
      if (G.phase === 'gameover') G.enterLobby();
    }
    this.indexT -= dt;
    if (this.indexT <= 0) {
      this.indexT = 3;
      const names = this.slots.map((u) => (N.players.get(u) || {}).n).filter(Boolean);
      const p = G.phase === 'lobby' || G.phase === 'transition' ? 'hill' : G.phase === 'gameover' ? 'over' : 'night';
      N.writeIndex({ n: `${names[0] || 'Keeper'}'s hill`.slice(0, 40), c: N.players.size, p, r: G.round || 0, pv: this.priv, nk: names.join(', ').slice(0, 90) });
    }
    this.trimT -= dt;
    if (this.trimT <= 0) { this.trimT = 10; N.trimEvents(); }
  }

  postUpdate(dt) {
    const G = this.game;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = SEND; this.net.sendState(encodeState(G.player, G)); }
    if (this.isHost) {
      this.hostLogic(dt);
      this.hostT -= dt;
      if (this.hostT <= 0) { this.hostT = HOST; this.hostTick(); }
    }
    this.rosterT -= dt;
    if (this.rosterT <= 0) { this.rosterT = 0.5; this.renderRoster(); }
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

