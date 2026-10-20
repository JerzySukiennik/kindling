import * as THREE from 'three';
import { groundHeight } from '../world/layout.js';

const SHOTS = [
  { id: 'emerge', dur: 8.5, fov: 50 },
  { id: 'eyes', dur: 6.5, fov: 40 },
  { id: 'keeper', dur: 7.5, fov: 46 },
  { id: 'vista', dur: 8.5, fov: 56 },
];
const FADE = 0.6;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (x) => x * x * (3 - 2 * x);

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();

export class MenuDirector {
  constructor({ el, camera, monsters, player, onLightning }) {
    this.el = el;
    this.camera = camera;
    this.monsters = monsters;
    this.player = player;
    this.onLightning = onLightning;
    this.idx = 0;
    this.t = 0;
    this.intro = 1.4;
    this.leaving = 0;
    this.mouse = new THREE.Vector2();
    this.mouseS = new THREE.Vector2();
    this.look = new THREE.Vector3(0, 1.5, -30);
    this.veil = el.querySelector('.menu-veil');
    this.splitTitle();
    this.embers = new Embers(el.querySelector('.menu-embers'), el);
    window.addEventListener('mousemove', (e) => this.mouse.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1));
  }

  splitTitle() {
    const t = this.el.querySelector('.title');
    const word = t.textContent.trim();
    t.innerHTML = [...word].map((c, i) => `<span class="l" style="--i:${i}"><span>${c}</span></span>`).join('');
    t.setAttribute('aria-label', word);
  }

  enter(quick = false) {
    this.el.classList.remove('leaving');
    this.el.classList.toggle('quick', quick);
    this.leaving = 0;
    if (quick) return;
    this.idx = 0;
    this.t = 0;
    this.intro = 1.4;
    this.setup();
    this.embers.start();
  }

  leave() {
    this.el.classList.add('leaving');
    this.leaving = 0.001;
    return new Promise((res) => setTimeout(res, 720));
  }

  pick(pref, minZ = -999, maxZ = 999) {
    const list = this.monsters.monsters.filter((m) => m.alive);
    return list.find((m) => m.type === pref && m.pos.z > minZ && m.pos.z < maxZ) || list.find((m) => m.pos.z > minZ && m.pos.z < maxZ) || list[0];
  }

  place(m, x, z, heading = 0) {
    if (!m) return;
    m.pos.set(x, 0, z);
    m.heading = heading;
    m.initFeet();
  }

  setup() {
    const s = SHOTS[this.idx];
    const M = this.monsters.monsters;
    if (s.id === 'emerge') {
      const x = (Math.random() - 0.5) * 12;
      this.subject = M[0];
      this.place(M[0], x, -66.2, 0.05);
      this.place(M[3], x + 5.5, -69.5, -0.15);
      this.side = Math.random() < 0.5 ? -1 : 1;
      this.anchor = new THREE.Vector3(x + this.side * 2.6, 0, -57.8);
    } else if (s.id === 'eyes') {
      this.subject = this.pick('walker', -58, -26);
      if (this.subject.pos.z > -30) this.place(this.subject, this.subject.pos.x, -40, this.subject.heading);
      this.side = Math.random() < 0.5 ? -1 : 1;
    } else if (s.id === 'keeper') {
      this.place(M[1], -3.5, -21, 0.1);
      this.place(M[2], 4.5, -27, -0.08);
    } else if (s.id === 'vista') {
      this.onLightning(0.9);
    }
    this.look.copy(this.target(0, _l));
  }

  target(t, out) {
    const s = SHOTS[this.idx];
    const k = t / s.dur;
    if (s.id === 'emerge') {
      const h = this.subject.j.H;
      return out.set(h.x * 0.7 + this.anchor.x * 0.3, Math.max(1.2, h.y * 0.82), h.z);
    }
    if (s.id === 'eyes') return out.copy(this.subject.j.H);
    if (s.id === 'keeper') return out.set(-1.5 + k * 0.8, 1.9, -24);
    return out.set(12 - k * 8, 1.5 - k * 1.2, -52 + k * 4);
  }

  position(t, out) {
    const s = SHOTS[this.idx];
    const k = ease(Math.min(1, t / s.dur));
    if (s.id === 'emerge') {
      const z = this.anchor.z + k * 3.2;
      const x = this.anchor.x + this.side * k * 0.8;
      return out.set(x, groundHeight(x, z) + 0.7 + k * 0.5, z);
    }
    if (s.id === 'eyes') {
      const m = this.subject;
      const a = m.heading + this.side * (0.75 - k * 0.55);
      const d = 2.5 - k * 0.9;
      return out.set(m.j.H.x + Math.sin(a) * d, m.j.H.y - 0.32 + k * 0.12, m.j.H.z + Math.cos(a) * d);
    }
    if (s.id === 'keeper') {
      const p = this.player.pos;
      return out.set(p.x + 1.7 - k * 0.55, p.y + 1.05 + k * 0.45, p.z + 2.9 - k * 0.9);
    }
    return out.set(35 - k * 4, 1.9 + k * 6.5, -14 + k * 9);
  }

  update(dt, time) {
    const s = SHOTS[this.idx];
    this.t += dt;
    if (this.t >= s.dur && !this.leaving) {
      this.idx = (this.idx + 1) % SHOTS.length;
      this.t = 0;
      this.setup();
    }
    const cur = SHOTS[this.idx];
    this.intro = Math.max(0, this.intro - dt);
    const fadeIn = this.idx === 0 && this.intro > 0 ? smooth(0, 1.4, this.intro) : 1 - smooth(0, FADE, this.t);
    const fadeOut = smooth(cur.dur - FADE, cur.dur, this.t);
    if (this.leaving) this.leaving = Math.min(1, this.leaving + dt / 0.7);
    const v = Math.max(fadeIn, fadeOut, smooth(0.15, 1, this.leaving));
    this.veil.style.opacity = v.toFixed(3);

    const cam = this.camera;
    this.position(this.t, _p);
    this.target(this.t, _l);
    this.look.lerp(_l, this.t < 0.05 ? 1 : Math.min(1, dt * 3));
    this.mouseS.lerp(this.mouse, Math.min(1, dt * 2.5));
    _f.subVectors(this.look, _p).normalize();
    _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize();
    _u.crossVectors(_r, _f);
    const par = cur.id === 'eyes' ? 0.12 : cur.id === 'vista' ? 0.9 : 0.35;
    _p.addScaledVector(_r, this.mouseS.x * par).addScaledVector(_u, -this.mouseS.y * par * 0.45);
    _p.x += Math.sin(time * 0.9) * 0.025 + Math.sin(time * 2.3) * 0.01;
    _p.y += Math.sin(time * 1.3) * 0.02;
    if (this.leaving) _p.addScaledVector(_f, this.leaving * this.leaving * 6);
    cam.position.copy(_p);
    cam.lookAt(this.look);
    const fov = cur.fov + this.leaving * 14;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.embers.update(dt, this.mouseS);
  }
}

class Embers {
  constructor(cv, host) {
    this.cv = cv;
    this.host = host;
    this.ctx = cv.getContext('2d');
    this.P = [];
    const sp = document.createElement('canvas');
    sp.width = sp.height = 64;
    const g = sp.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,140,1)');
    gr.addColorStop(0.18, 'rgba(255,150,50,0.8)');
    gr.addColorStop(0.45, 'rgba(255,90,10,0.25)');
    gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this.sprite = sp;
    this.fit = () => { const d = Math.min(1.5, devicePixelRatio); cv.width = innerWidth * d; cv.height = innerHeight * d; this.d = d; };
    this.fit();
    window.addEventListener('resize', this.fit);
  }

  start() {
    this.P.length = 0;
    for (let i = 0; i < 40; i++) this.spawn(Math.random());
  }

  spawn(age = 0) {
    const W = this.cv.width;
    const H = this.cv.height;
    this.P.push({ x: Math.random() * W, y: H * (1.02 - age * 0.9), vx: (Math.random() - 0.5) * 18, vy: -(18 + Math.random() * 46), l: 1 - age * 0.6, d: 5 + Math.random() * 6, s: 0.5 + Math.random() * 1.3, ph: Math.random() * 6.28 });
  }

  update(dt, mouse) {
    if (this.host.classList.contains('hidden')) return;
    const c = this.ctx;
    const d = this.d;
    if (this.P.length < 70 && Math.random() < dt * 9) this.spawn();
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = 'lighter';
    const now = performance.now() * 0.001;
    for (let i = this.P.length - 1; i >= 0; i--) {
      const p = this.P[i];
      p.l -= dt / p.d;
      if (p.l <= 0 || p.y < -20) { this.P.splice(i, 1); continue; }
      p.vx += (Math.sin(now * 1.7 + p.ph) * 14 - mouse.x * 6) * dt;
      p.x += p.vx * dt * d;
      p.y += p.vy * dt * d;
      const a = Math.min(1, p.l * 1.6) * (0.55 + 0.45 * Math.sin(now * 9 + p.ph));
      const r = p.s * d * 9;
      c.globalAlpha = Math.max(0, a);
      c.drawImage(this.sprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
  }
}
