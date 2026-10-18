const DB = 'kindling';
const STORE = 'music';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => res(tx.result || null);
      tx.onerror = () => res(null);
    });
  } catch (e) { return null; }
}

async function idbSet(key, val) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (val === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(val, key);
      tx.oncomplete = res;
      tx.onerror = res;
    });
  } catch (e) { /* storage unavailable */ }
}

const SAMPLES = {
  snap: ['snap1', 'snap2', 'snap3', 'snap4'],
  knock: ['knock1', 'knock2', 'knock3', 'knock4', 'knock5'],
  step: ['step1', 'step2', 'step3', 'step4', 'step5'],
  creak: ['creak1', 'creak2', 'creak3'],
  fire: ['fire_loop'],
  wind: ['wind_loop'],
  crow: ['crow1', 'crow2'],
  owl: ['owl'],
  howl: ['howl'],
  metal: ['metal1', 'metal2'],
  thud: ['thud'],
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.music = null;
    this.musicName = 'None';
    this.vol = { music: 0.55, sfx: 0.85 };
    this.listener = null;
    this.ready = false;
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.vol.sfx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.sfx.connect(this.comp).connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.vol.music;
    this.musicGain.connect(this.master);
    this.lobbyGain = c.createGain();
    this.lobbyGain.gain.value = 0;
    this.lobbyGain.connect(this.master);
    this.matchFade = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 1024;
    this.musicGain.connect(this.analyser);
    this.anBuf = new Float32Array(this.analyser.fftSize);
    this.slowRms = 0;
    this.hitCool = 0;
    this.noiseBuf = this.makeNoise(2);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2, 2.4);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain).connect(this.comp);
    this.ready = true;
    this.loadSamples();
    this.startAmbience();
    this.startLaser();
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  makeNoise(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeImpulse(sec, decay) {
    const c = this.ctx;
    const len = c.sampleRate * sec;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  async loadSamples() {
    const names = new Set(Object.values(SAMPLES).flat());
    await Promise.all([...names].map(async (n) => {
      for (const ext of ['mp3', 'ogg']) {
        try {
          const r = await fetch(`assets/audio/${n}.${ext}`);
          if (!r.ok) continue;
          this.buffers[n] = await this.ctx.decodeAudioData(await r.arrayBuffer());
          return;
        } catch (e) { /* try next */ }
      }
    }));
    if (this.buffers.fire_loop) this.swapLoop('fire', this.buffers.fire_loop);
    if (this.buffers.wind_loop) this.swapLoop('wind', this.buffers.wind_loop);
  }

  pick(group) {
    const list = SAMPLES[group].filter((n) => this.buffers[n]);
    return list.length ? this.buffers[list[Math.floor(Math.random() * list.length)]] : null;
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  out(pos, vol = 1, reverb = 0.3) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.maxDistance = 200;
      p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.sfx);
      if (reverb > 0) {
        const r = c.createGain();
        r.gain.value = reverb;
        p.connect(r).connect(this.reverb);
      }
    } else {
      g.connect(this.sfx);
      if (reverb > 0) {
        const r = c.createGain();
        r.gain.value = reverb;
        g.connect(r).connect(this.reverb);
      }
    }
    return g;
  }

  playBuf(buf, pos, vol = 1, rate = 1, reverb = 0.3) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.connect(this.out(pos, vol, reverb));
    s.start();
    return s;
  }

  noiseHit(pos, { vol = 1, f = 1200, q = 1, type = 'bandpass', dur = 0.12, attack = 0.002, reverb = 0.25, at = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.out(pos, vol, reverb));
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  tone(pos, { vol = 0.4, f = 200, f2 = null, type = 'sine', dur = 0.3, attack = 0.005, reverb = 0.3, at = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pos, vol, reverb));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  snap(pos, big = 0) {
    if (!this.ready) return;
    const b = this.pick('snap');
    if (b) { this.playBuf(b, pos, 0.9 + big * 0.4, 0.85 + Math.random() * 0.3 - big * 0.2, 0.35); return; }
    this.noiseHit(pos, { vol: 1.2, f: 2400 - big * 1200, q: 0.8, dur: 0.07 + big * 0.06, type: 'highpass' });
    this.noiseHit(pos, { vol: 0.9, f: 500 - big * 200, q: 4, dur: 0.12 + big * 0.1 });
    this.tone(pos, { vol: 0.3 + big * 0.3, f: 160 - big * 60, f2: 60, dur: 0.15, type: 'triangle' });
  }

  knock(pos, vol = 0.5) {
    if (!this.ready) return;
    const b = this.pick('knock');
    if (b) { this.playBuf(b, pos, vol, 0.8 + Math.random() * 0.5, 0.3); return; }
    this.noiseHit(pos, { vol: vol * 1.4, f: 380 + Math.random() * 500, q: 7, dur: 0.09 });
  }

  step(pos, vol = 0.3) {
    if (!this.ready) return;
    const b = this.pick('step');
    if (b) { this.playBuf(b, pos, vol, 0.85 + Math.random() * 0.3, 0.1); return; }
    this.noiseHit(pos, { vol: vol * 1.6, f: 900 + Math.random() * 600, q: 0.6, dur: 0.11, type: 'bandpass', reverb: 0.05 });
  }

  creak(pos) {
    if (!this.ready) return;
    const b = this.pick('creak');
    if (b) { this.playBuf(b, pos, 0.55, 0.7 + Math.random() * 0.5, 0.5); return; }
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const f = 70 + Math.random() * 60;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (1.4 + Math.random()), t + 0.5);
    const am = c.createOscillator();
    am.frequency.value = 22 + Math.random() * 20;
    const amg = c.createGain();
    amg.gain.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 3;
    am.connect(amg).connect(g.gain);
    o.connect(bp).connect(g).connect(this.out(pos, 0.5, 0.6));
    o.start(t); am.start(t);
    o.stop(t + 0.75); am.stop(t + 0.75);
  }

  bell(n = 1) {
    if (!this.ready) return;
    for (let k = 0; k < n; k++) {
      const at = k * 1.6;
      const base = 196;
      for (const [r, v, d] of [[0.5, 0.25, 5], [1, 0.4, 4], [1.19, 0.18, 3], [1.5, 0.15, 2.6], [2, 0.14, 2.2], [2.52, 0.08, 1.6], [3.0, 0.06, 1.2]]) {
        this.tone(null, { vol: v * 0.5, f: base * r, dur: d, attack: 0.004, reverb: 0.8, at });
      }
    }
  }

  chime() {
    if (!this.ready) return;
    this.tone(null, { vol: 0.12, f: 1320, dur: 0.25, reverb: 0.2 });
    this.tone(null, { vol: 0.08, f: 1980, dur: 0.3, reverb: 0.2, at: 0.04 });
  }

  rumble(pos, dur = 2.5, vol = 1) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.3);
    g.gain.setValueAtTime(vol, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp).connect(g).connect(this.out(pos, 2.2, 0.4));
    s.start(t);
    s.stop(t + dur + 0.1);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(48, t);
    o.frequency.linearRampToValueAtTime(70, t + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(vol * 0.12, t + 0.4);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const ol = c.createBiquadFilter();
    ol.type = 'lowpass';
    ol.frequency.value = 300;
    o.connect(ol).connect(og).connect(this.out(pos, 1.5, 0.3));
    o.start(t);
    o.stop(t + dur + 0.1);
    const mb = this.pick('metal');
    if (mb) this.playBuf(mb, pos, 0.9, 0.7, 0.6);
    else for (let i = 0; i < 4; i++) this.tone(pos, { vol: 0.08, f: 300 + Math.random() * 900, f2: 200 + Math.random() * 400, dur: 0.6, type: 'square', at: Math.random() * dur * 0.8, reverb: 0.6 });
  }

  whoosh(vol = 1) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 1.1);
    bp.frequency.exponentialRampToValueAtTime(300, t + 2.0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    s.connect(bp).connect(g).connect(this.out(null, 1.2, 0.3));
    s.start(t, 0);
    s.stop(t + 2.2);
  }

  scream() {
    if (!this.ready) return;
    this.tone(null, { vol: 0.25, f: 520, f2: 180, dur: 1.1, type: 'sawtooth', reverb: 0.8 });
    this.noiseHit(null, { vol: 0.6, f: 1400, q: 1.2, dur: 0.8, reverb: 0.8 });
  }

  makeLoop(buf, vol, filterFreq = null) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const g = c.createGain();
    g.gain.value = vol;
    let node = s;
    if (filterFreq) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filterFreq;
      f.Q.value = 0.5;
      node = s.connect(f);
    }
    node.connect(g).connect(this.sfx);
    s.start(0, Math.random() * Math.max(0.1, buf.duration - 0.2));
    return { s, g };
  }

  startAmbience() {
    this.loops = {};
    this.loops.wind = this.makeLoop(this.noiseBuf, 0.05, 420);
    this.loops.fire = this.makeLoop(this.noiseBuf, 0.0, 2200);
    this.ambT = 6;
  }

  swapLoop(name, buf) {
    const old = this.loops[name];
    const vol = old.g.gain.value;
    try { old.s.stop(); } catch (e) { /* already stopped */ }
    this.loops[name] = this.makeLoop(buf, vol);
    this.loops[name].sample = true;
  }

  startLaser() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 92;
    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 92.7;
    const o3 = c.createOscillator();
    o3.type = 'square';
    o3.frequency.value = 184.3;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 4;
    const lfo = c.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = c.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(lp.frequency);
    const o3g = c.createGain();
    o3g.gain.value = 0.25;
    o1.connect(lp); o2.connect(lp); o3.connect(o3g).connect(lp);
    lp.connect(g).connect(this.out(null, 0.32, 0.15));
    const sz = c.createBufferSource();
    sz.buffer = this.noiseBuf;
    sz.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const szg = c.createGain();
    szg.gain.value = 0;
    sz.connect(hp).connect(szg).connect(this.out(null, 0.5, 0.1));
    for (const o of [o1, o2, o3, lfo, sz]) o.start();
    this.laser = { g, szg, lp, o1, o2 };
  }

  updateLaser(on, burning, heat) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.laser.g.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.015 : 0.05);
    const crackle = burning ? 0.25 + Math.random() * 0.55 : 0;
    this.laser.szg.gain.setTargetAtTime(on ? crackle : 0, t, 0.02);
    const f = 92 + heat * 40;
    this.laser.o1.frequency.setTargetAtTime(f, t, 0.1);
    this.laser.o2.frequency.setTargetAtTime(f * 1.008, t, 0.1);
  }

  updateAmbience(dt, fireLevel, fireDist) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const fv = Math.min(1, (0.08 + fireLevel * 0.35) * (14 / Math.max(6, fireDist)));
    this.loops.fire.g.gain.setTargetAtTime(this.loops.fire.sample ? fv * 1.2 : fv * 0.06 * (0.5 + Math.random()), t, 0.05);
    if (!this.loops.fire.sample && Math.random() < dt * (3 + fireLevel * 10)) {
      this.noiseHit(null, { vol: fv * (0.2 + Math.random() * 0.5), f: 1500 + Math.random() * 3000, q: 2, dur: 0.02 + Math.random() * 0.03, reverb: 0.05 });
    }
    this.loops.wind.g.gain.setTargetAtTime(this.loops.wind.sample ? 0.35 : 0.05 + 0.03 * Math.sin(t * 0.2), t, 0.5);
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 9 + Math.random() * 14;
      const r = Math.random();
      const pos = { x: (Math.random() - 0.5) * 80, y: 6, z: -30 - Math.random() * 60 };
      const grp = r < 0.55 ? 'crow' : r < 0.8 ? 'owl' : 'howl';
      const b = this.pick(grp);
      if (b) this.playBuf(b, pos, grp === 'howl' ? 0.5 : 0.7, 0.92 + Math.random() * 0.16, 0.6);
    }
  }

  async setupMusic() {
    let url = null;
    let name = null;
    try {
      const r = await fetch('music/thriller.mp3', { method: 'HEAD' });
      if (r.ok) { url = 'music/thriller.mp3'; name = 'Thriller (local file)'; }
    } catch (e) { /* no local file */ }
    const stored = await idbGet('track');
    if (stored && stored.blob) { url = URL.createObjectURL(stored.blob); name = stored.name; }
    this.musicName = name || 'None';
    if (!url) return;
    this.attachMusic(url);
  }

  attachMusic(url) {
    if (this.music) { this.music.pause(); this.music.src = ''; }
    this.musicUrl = url;
    this.introHit = null;
    const a = new window.Audio();
    a.src = url;
    a.loop = true;
    a.crossOrigin = 'anonymous';
    this.music = a;
    if (this.ctx) {
      if (this.musicSrc) this.musicSrc.disconnect();
      this.musicSrc = this.ctx.createMediaElementSource(a);
      this.musicSrc.connect(this.matchFade).connect(this.musicGain);
    }
  }

  async playMusic() {
    if (!this.music) await this.setupMusic();
    if (this.music && this.ctx && !this.musicSrc) {
      this.musicSrc = this.ctx.createMediaElementSource(this.music);
      this.musicSrc.connect(this.matchFade).connect(this.musicGain);
    }
    if (this.music) { try { await this.music.play(); } catch (e) { /* autoplay blocked */ } }
  }

  async analyzeIntro() {
    if (!this.musicUrl) return null;
    if (this.introUrl === this.musicUrl) return this.introHit;
    if (this.introJob && this.introJobUrl === this.musicUrl) return this.introJob;
    this.introJobUrl = this.musicUrl;
    this.introJob = this._analyze(this.musicUrl);
    return this.introJob;
  }

  async _analyze(url) {
    try {
      const ab = await (await fetch(url)).arrayBuffer();
      const head = ab.byteLength > 2.8e6 ? ab.slice(0, 2.8e6) : ab;
      const dec = this.ctx || new OfflineAudioContext(2, 44100, 44100);
      const buf = await dec.decodeAudioData(head);
      const sr = buf.sampleRate;
      const n = Math.min(buf.length, sr * 70);
      const chans = [];
      for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
      const win = Math.floor(sr * 0.25);
      const rms = [];
      for (let i = 0; i + win <= n; i += win) {
        let s = 0;
        for (let k = i; k < i + win; k += 4) for (const ch of chans) s += ch[k] * ch[k];
        rms.push(Math.sqrt(s / ((win / 4) * chans.length)));
      }
      const max = Math.max(...rms);
      let hit = null;
      for (let i = 8; i < rms.length; i++) {
        if (rms[i] > max * 0.55) { hit = i * 0.25; break; }
      }
      if (hit !== null) {
        const i0 = Math.floor(hit * sr);
        let best = 0;
        let bi = i0;
        for (let k = i0; k < Math.min(n, i0 + win); k += 8) {
          const v = Math.abs(chans[0][k]);
          if (v > best * 1.0 && v > 0.25 * max) { bi = k; break; }
          if (v > best) best = v;
        }
        hit = bi / sr;
      }
      if (url !== this.musicUrl) return null;
      this.introHit = hit !== null && hit >= 3 && hit <= 45 ? hit : null;
      this.introUrl = url;
      return this.introHit;
    } catch (e) {
      this.introUrl = url;
      this.introHit = null;
      return null;
    }
  }

  beatNow(fallbackT) {
    if (this.scene === 'match' && this.music && !this.music.paused) return (this.music.currentTime - 41.75) / 0.5068;
    if (this.scene === 'lobby' && this.lobbyEl && !this.lobbyEl.paused) return this.lobbyEl.currentTime / 0.5172;
    return fallbackT / 0.5068;
  }

  get musicTime() { return this.music && !this.music.paused ? this.music.currentTime : null; }

  restartMusic() {
    if (!this.music) return;
    try { this.music.currentTime = 0; } catch (e) { /* not seekable yet */ }
    this.music.play().catch(() => {});
  }

  musicTransient(dt) {
    if (!this.analyser || !this.music || this.music.paused) return 0;
    this.analyser.getFloatTimeDomainData(this.anBuf);
    let s = 0;
    for (let i = 0; i < this.anBuf.length; i++) s += this.anBuf[i] * this.anBuf[i];
    const rms = Math.sqrt(s / this.anBuf.length) / Math.max(0.05, this.vol.music);
    this.hitCool = Math.max(0, this.hitCool - dt);
    const prev = this.slowRms;
    this.slowRms += (rms - this.slowRms) * Math.min(1, dt * 0.8);
    if (this.hitCool <= 0 && rms > 0.12 && rms > prev * 2.6) {
      this.hitCool = 9;
      return Math.min(1, rms / Math.max(prev * 5, 0.2));
    }
    return 0;
  }

  async setUserTrack(file) {
    await idbSet('track', file ? { blob: file, name: file.name } : null);
    this.musicName = file ? file.name : 'None';
    if (file) {
      this.attachMusic(URL.createObjectURL(file));
    } else {
      if (this.music) { this.music.pause(); this.music = null; }
      if (this.musicSrc) { this.musicSrc.disconnect(); this.musicSrc = null; }
      await this.setupMusic();
      if (this.music && this.ready) {
        this.musicSrc = this.ctx.createMediaElementSource(this.music);
        this.musicSrc.connect(this.matchFade).connect(this.musicGain);
      }
    }
  }

  async setupLobby() {
    let url = null;
    let name = null;
    try {
      const r = await fetch('music/ghostbusters.mp3', { method: 'HEAD' });
      if (r.ok) { url = 'music/ghostbusters.mp3'; name = 'Ghostbusters (local file)'; }
    } catch (e) { /* no local file */ }
    const stored = await idbGet('track-lobby');
    if (stored && stored.blob) { url = URL.createObjectURL(stored.blob); name = stored.name; }
    this.lobbyName = name || 'None';
    if (this.lobbyEl) { this.lobbyEl.pause(); this.lobbyEl.src = ''; }
    if (this.lobbySrc) { this.lobbySrc.disconnect(); this.lobbySrc = null; }
    this.lobbyEl = null;
    if (!url) return;
    const a = new window.Audio();
    a.src = url;
    a.loop = true;
    this.lobbyEl = a;
    if (this.ctx) {
      this.lobbySrc = this.ctx.createMediaElementSource(a);
      this.lobbySrc.connect(this.lobbyGain);
    }
  }

  async setLobbyTrack(file) {
    await idbSet('track-lobby', file ? { blob: file, name: file.name } : null);
    await this.setupLobby();
    if (this.scene === 'lobby') this.toLobby();
  }

  async toLobby() {
    this.scene = 'lobby';
    if (!this.ctx) return;
    if (this.lobbyEl === undefined) await this.setupLobby();
    if (this.lobbyEl && !this.lobbySrc) { this.lobbySrc = this.ctx.createMediaElementSource(this.lobbyEl); this.lobbySrc.connect(this.lobbyGain); }
    const t = this.ctx.currentTime;
    this.matchFade.gain.cancelScheduledValues(t);
    this.matchFade.gain.setTargetAtTime(0, t, 0.5);
    this.lobbyGain.gain.cancelScheduledValues(t);
    this.lobbyGain.gain.setTargetAtTime(this.vol.music, t, 0.6);
    if (this.lobbyEl) this.lobbyEl.play().catch(() => {});
    clearTimeout(this.pauseT);
    this.pauseT = setTimeout(() => { if (this.scene === 'lobby' && this.music) this.music.pause(); }, 2500);
  }

  async toMatch() {
    this.scene = 'match';
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.lobbyGain.gain.cancelScheduledValues(t);
    this.lobbyGain.gain.setTargetAtTime(0, t, 0.3);
    this.matchFade.gain.cancelScheduledValues(t);
    this.matchFade.gain.setValueAtTime(1, t);
    clearTimeout(this.pauseT);
    this.pauseT = setTimeout(() => { if (this.scene === 'match' && this.lobbyEl) this.lobbyEl.pause(); }, 1800);
  }

  setVolumes(music, sfx) {
    this.vol.music = music;
    this.vol.sfx = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.lobbyGain && this.scene === 'lobby') this.lobbyGain.gain.value = music;
    if (this.sfx) this.sfx.gain.value = sfx;
  }
}
