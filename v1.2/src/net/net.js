// Kindling: Firebase RTDB layer (anonymous auth, server list, presence, player state, host state, events, leaderboard).

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const ROOT = new URLSearchParams(location.search).get('realm') === 'test' ? 'kindlingTest' : 'kindling';
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STALE = 25000;
export const MAX_PLAYERS = 4;

export class Net {
  constructor() {
    this.fb = null;
    this.db = null;
    this.uid = null;
    this.offset = 0;
    this.sid = null;
    this.hostUid = null;
    this.players = new Map();
    this.states = new Map();
    this.index = new Map();
    this.cb = { players() {}, state() {}, stateGone() {}, hostG() {}, mAdd() {}, mChange() {}, mRemove() {}, event() {}, host() {}, index() {}, status() {} };
    this.subs = [];
    this.g = null;
    this.mData = new Map();
    this.indexSub = null;
    this.connected = false;
    this.joinedAt = 0;
  }

  now() { return Date.now() + this.offset; }
  r(p) { return this.fb.ref(this.db, p); }
  sp(p = '') { return `${ROOT}/servers/${this.sid}${p ? '/' + p : ''}`; }
  get isHost() { return !!this.sid && this.hostUid === this.uid; }

  async connect(timeout = 10000) {
    if (this.db) return true;
    const limit = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))]);
    const [appM, authM, dbM] = await limit(Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-database.js`),
    ]));
    this.fb = dbM;
    const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(firebaseConfig);
    const auth = authM.getAuth(app);
    await limit(auth.authStateReady ? auth.authStateReady() : Promise.resolve());
    const user = auth.currentUser || (await limit(authM.signInAnonymously(auth))).user;
    this.uid = user.uid;
    this.db = dbM.getDatabase(app);
    dbM.onValue(this.r('.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
    dbM.onValue(this.r('.info/connected'), (s) => {
      this.connected = !!s.val();
      if (this.connected && this.sid) this.armDisconnect();
      this.cb.status(this.connected);
    });
    return true;
  }

  watchIndex(on) {
    const F = this.fb;
    if (this.indexSub) this.indexSub();
    this.indexSub = null;
    if (!on) return;
    const q = F.query(this.r(`${ROOT}/index`), F.orderByChild('u'), F.startAt(this.now() - STALE));
    this.indexSub = F.onValue(q, (s) => {
      this.index.clear();
      s.forEach((c) => { this.index.set(c.key, c.val()); });
      this.cb.index(this.index);
    });
  }

  async purgeStale() {
    const F = this.fb;
    try {
      const s = await F.get(F.query(this.r(`${ROOT}/index`), F.orderByChild('u'), F.endAt(this.now() - 120000)));
      const jobs = [];
      s.forEach((c) => {
        jobs.push(F.remove(this.r(`${ROOT}/index/${c.key}`)).catch(() => {}));
        jobs.push(F.remove(this.r(`${ROOT}/servers/${c.key}`)).catch(() => {}));
      });
      await Promise.all(jobs);
    } catch (e) { /* best effort */ }
  }

  code() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE[Math.floor(Math.random() * CODE.length)];
    return s;
  }

  async create(priv, me) {
    const F = this.fb;
    await this.purgeStale();
    for (let i = 0; i < 12; i++) {
      const sid = this.code();
      const s = await F.get(this.r(`${ROOT}/servers/${sid}/players`));
      if (s.exists()) continue;
      return this.join(sid, me, { create: true, priv });
    }
    throw new Error('no free code');
  }

  async quick(me) {
    const F = this.fb;
    const s = await F.get(F.query(this.r(`${ROOT}/index`), F.orderByChild('u'), F.startAt(this.now() - STALE)));
    const list = [];
    s.forEach((c) => { const v = c.val(); if (!v.pv && v.c > 0 && v.c < MAX_PLAYERS) list.push([c.key, v]); });
    list.sort((a, b) => (b[1].p === 'hill') - (a[1].p === 'hill') || b[1].c - a[1].c);
    for (const [sid] of list) {
      try { return await this.join(sid, me); } catch (e) { /* full or gone, try next */ }
    }
    return this.create(false, me);
  }

  async join(sid, me, opt = {}) {
    const F = this.fb;
    sid = sid.toUpperCase();
    const ps = await F.get(this.r(`${ROOT}/servers/${sid}/players`));
    const count = ps.exists() ? Object.keys(ps.val()).filter((k) => k !== this.uid).length : 0;
    if (!opt.create && count === 0) throw new Error('No server with that code');
    if (count >= MAX_PLAYERS) throw new Error('That server is full');
    this.sid = sid;
    this.joinedAt = this.now();
    this.me = { n: me.n, j: F.serverTimestamp(), lk: me.lk || '', rd: false };
    const up = {};
    up[`players/${this.uid}`] = this.me;
    if (opt.create) { up['meta/pv'] = !!opt.priv; up['meta/c'] = F.serverTimestamp(); }
    await F.update(this.r(this.sp()), up);
    this.armDisconnect();
    this.listen();
    if (opt.create) await F.set(this.r(this.sp('meta/host')), this.uid);
    return sid;
  }

  armDisconnect() {
    const F = this.fb;
    F.onDisconnect(this.r(this.sp(`players/${this.uid}`))).remove();
    F.onDisconnect(this.r(this.sp(`st/${this.uid}`))).remove();
  }

  listen() {
    const F = this.fb;
    const add = (u) => this.subs.push(u);
    this.hostLoaded = false;
    this.playersLoaded = false;
    const check = () => { if (this.hostLoaded && this.playersLoaded && (!this.hostUid || !this.players.has(this.hostUid))) this.claimHostIfNeeded(); };
    add(F.onValue(this.r(this.sp('players')), (s) => {
      this.players.clear();
      s.forEach((c) => { this.players.set(c.key, c.val()); });
      this.playersLoaded = true;
      this.cb.players(this.players);
      check();
    }));
    add(F.onValue(this.r(this.sp('meta/host')), (s) => {
      const prev = this.hostUid;
      this.hostUid = s.val();
      this.hostLoaded = true;
      if (prev !== this.hostUid) this.cb.host(this.hostUid === this.uid, prev);
      check();
    }));
    const st = this.r(this.sp('st'));
    const stOn = (c) => { if (c.key === this.uid) return; this.states.set(c.key, c.val()); this.cb.state(c.key, c.val()); };
    add(F.onChildAdded(st, stOn));
    add(F.onChildChanged(st, stOn));
    add(F.onChildRemoved(st, (c) => { this.states.delete(c.key); if (c.key !== this.uid) this.cb.stateGone(c.key); }));
    add(F.onValue(this.r(this.sp('host/g')), (s) => { this.g = s.val(); if (!this.isHost && s.exists()) this.cb.hostG(this.g); }));
    const m = this.r(this.sp('host/m'));
    add(F.onChildAdded(m, (c) => { this.mData.set(c.key, c.val()); if (!this.isHost) this.cb.mAdd(c.key, c.val()); }));
    add(F.onChildChanged(m, (c) => { this.mData.set(c.key, c.val()); if (!this.isHost) this.cb.mChange(c.key, c.val()); }));
    add(F.onChildRemoved(m, (c) => { this.mData.delete(c.key); if (!this.isHost) this.cb.mRemove(c.key); }));
    const ev = F.query(this.r(this.sp('ev')), F.orderByChild('t'), F.startAt(this.joinedAt - 1500));
    add(F.onChildAdded(ev, (c) => this.cb.event(c.val(), c.key)));
  }

  async claimHostIfNeeded() {
    const F = this.fb;
    if (!this.sid) return;
    const order = [...this.players.entries()].sort((a, b) => (a[1].j || 0) - (b[1].j || 0) || (a[0] < b[0] ? -1 : 1));
    const first = order.length ? order[0][0] : this.uid;
    if (first !== this.uid) return;
    try {
      await F.runTransaction(this.r(this.sp('meta/host')), (cur) => {
        if (cur && cur !== this.uid && this.players.has(cur)) return undefined;
        return this.uid;
      }, { applyLocally: false });
    } catch (e) { /* someone else won */ }
  }

  async leave() {
    const F = this.fb;
    if (!this.sid) return;
    const sid = this.sid;
    const last = this.players.size <= 1;
    const wasHost = this.isHost;
    for (const u of this.subs) u();
    this.subs = [];
    try {
      F.onDisconnect(this.r(this.sp(`players/${this.uid}`))).cancel();
      F.onDisconnect(this.r(this.sp(`st/${this.uid}`))).cancel();
      await F.remove(this.r(this.sp(`st/${this.uid}`)));
      await F.remove(this.r(this.sp(`players/${this.uid}`)));
      if (wasHost || last) {
        F.onDisconnect(this.r(`${ROOT}/index/${sid}`)).cancel();
        await F.remove(this.r(`${ROOT}/index/${sid}`)).catch(() => {});
      }
      if (last) await F.remove(this.r(`${ROOT}/servers/${sid}`)).catch(() => {});
      else if (wasHost) await F.remove(this.r(`${ROOT}/servers/${sid}/meta/host`)).catch(() => {});
    } catch (e) { /* offline */ }
    this.sid = null;
    this.hostUid = null;
    this.g = null;
    this.mData.clear();
    this.players.clear();
    this.states.clear();
  }

  sendState(str) { if (this.sid) this.fb.set(this.r(this.sp(`st/${this.uid}`)), str).catch(() => {}); }
  setMe(fields) {
    if (!this.sid) return;
    Object.assign(this.me, fields);
    this.fb.update(this.r(this.sp(`players/${this.uid}`)), fields).catch(() => {});
  }

  event(k, data = {}) {
    if (!this.sid) return;
    const F = this.fb;
    F.push(this.r(this.sp('ev')), { ...data, k, by: this.uid, t: F.serverTimestamp() }).catch(() => {});
  }

  hostWrite(paths) {
    if (!this.isHost) return;
    const up = {};
    for (const k in paths) up['host/' + k] = paths[k];
    this.fb.update(this.r(this.sp()), up).catch(() => {});
  }

  writeIndex(v) {
    if (!this.isHost) return;
    const F = this.fb;
    const ref = this.r(`${ROOT}/index/${this.sid}`);
    F.set(ref, { ...v, u: F.serverTimestamp() }).catch(() => {});
    F.onDisconnect(ref).remove();
  }

  async trimEvents() {
    const F = this.fb;
    if (!this.isHost) return;
    try {
      const s = await F.get(F.query(this.r(this.sp('ev')), F.orderByChild('t'), F.endAt(this.now() - 20000), F.limitToFirst(80)));
      const up = {};
      s.forEach((c) => { up[c.key] = null; });
      if (Object.keys(up).length) await F.update(this.r(this.sp('ev')), up);
    } catch (e) { /* best effort */ }
  }

  async topTeams(n = 6) {
    const F = this.fb;
    const s = await F.get(F.query(this.r(`${ROOT}/lb/teams`), F.orderByChild('r'), F.limitToLast(n)));
    const out = [];
    s.forEach((c) => { out.push(c.val()); });
    return out.sort((a, b) => b.r - a.r || a.t - b.t);
  }

  async topPlayers(n = 6) {
    const F = this.fb;
    const s = await F.get(F.query(this.r(`${ROOT}/lb/players`), F.orderByChild('r'), F.limitToLast(n * 3)));
    const out = [];
    s.forEach((c) => { out.push(c.val()); });
    return out.sort((a, b) => b.r - a.r || b.s - a.s).slice(0, n);
  }

  submitTeam(r, names) {
    if (r < 1) return;
    const F = this.fb;
    F.push(this.r(`${ROOT}/lb/teams`), { r, n: names.slice(0, 80), t: Date.now() }).catch(() => {});
  }

  async submitPlayer(n, r, s) {
    const F = this.fb;
    const ref = this.r(`${ROOT}/lb/players/${this.uid}`);
    try {
      const cur = (await F.get(ref)).val();
      if (cur && (cur.r > r || (cur.r === r && cur.s >= s)) && cur.n === n) return;
      const best = cur && (cur.r > r || (cur.r === r && cur.s >= s)) ? { r: cur.r, s: cur.s } : { r, s };
      await F.set(ref, { n, r: best.r, s: best.s, t: Date.now() });
    } catch (e) { /* offline */ }
  }
}
