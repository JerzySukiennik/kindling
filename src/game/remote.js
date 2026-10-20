import * as THREE from 'three';
import { Character } from './character.js';
import { LaserFX } from '../fx/laser.js';
import { CATALOG } from './profile.js';

const EMOTES = ['', 'wave', 'dance', 'point', 'laugh'];
const DELAY = 0.12;
const _v = new THREE.Vector3();

export function encodeState(p, game) {
  const f = (v) => Math.round(v * 100) / 100;
  const e = p.emote ? EMOTES.indexOf(p.emote.id) : 0;
  const fire = game.firing ? 1 : 0;
  const end = game.end;
  return [f(p.pos.x), f(p.pos.y), f(p.pos.z), f(p.yaw), f(p.pitch), f(p.speed), p.onGround ? 1 : 0, e, fire,
    fire ? f(end.x) : 0, fire ? f(end.y) : 0, fire ? f(end.z) : 0, p.alive ? 0 : 1, f(p.localMove.x), f(p.localMove.y)].join(',');
}

export class RemotePlayer {
  constructor(scene, uid, info, tags, makeAvatar) {
    this.uid = uid;
    this.scene = scene;
    this.makeAvatar = makeAvatar;
    this.body = 'keeper';
    this.wantBody = 'keeper';
    this.costume = 'none';
    this.beamC = CATALOG.beams[0].color;
    this.bodyT = 0;
    this.nick = info.n || 'Keeper';
    this.char = new Character(scene);
    this.char.root.visible = false;
    this.fx = new LaserFX(scene, undefined, { light: false });
    this.buf = [];
    this.pos = new THREE.Vector3(0, -50, 0);
    this.head = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0;
    this.onGround = true;
    this.justLanded = false;
    this.localMove = new THREE.Vector2();
    this.emote = null;
    this.beat = 0;
    this.alive = false;
    this.ghost = false;
    this.firing = false;
    this.endPt = new THREE.Vector3();
    this.muzzle = new THREE.Vector3();
    this.seen = false;
    this.ready = false;
    this.sparkT = 0;
    this.look = '';
    this.tag = document.createElement('div');
    this.tag.className = 'name-tag';
    this.tag.textContent = this.nick;
    tags.appendChild(this.tag);
    this.setInfo(info);
  }

  setInfo(info) {
    this.nick = info.n || this.nick;
    this.tag.textContent = this.nick;
    this.ready = !!info.rd;
    if ((info.lk || '') !== this.look) {
      this.look = info.lk || '';
      const [costume, beam, body] = this.look.split('|');
      this.costume = costume || 'none';
      this.beamC = (CATALOG.beams.find((x) => x.id === beam) || CATALOG.beams[0]).color;
      this.wantBody = body === 'jurek' ? 'jurek' : 'keeper';
      this.applyLook();
    }
  }

  applyLook() {
    if (this.wantBody !== this.body) {
      const next = this.wantBody === 'jurek' ? (this.makeAvatar ? this.makeAvatar(this.beamC) : null) : new Character(this.scene);
      if (next) {
        this.scene.remove(this.char.root);
        next.root.visible = this.char.root.visible;
        this.char = next;
        this.body = this.wantBody;
      }
    }
    this.char.setCostume(this.costume);
    this.char.setBeamColor(this.beamC);
    this.fx.setColor(this.beamC);
  }

  push(str, t) {
    const a = str.split(',').map(Number);
    if (a.length < 13 || a.some((x) => !Number.isFinite(x))) return;
    this.buf.push({ t, x: a[0], y: a[1], z: a[2], yaw: a[3], pitch: a[4], sp: a[5], g: a[6], e: a[7], f: a[8], ex: a[9], ey: a[10], ez: a[11], gh: a[12], lx: a[13] || 0, ly: a[14] || 0 });
    if (this.buf.length > 8) this.buf.shift();
    this.seen = true;
  }

  gone() {
    this.seen = false;
    this.buf.length = 0;
    this.alive = false;
    this.char.root.visible = false;
    this.fx.update(0, 0, false, this.pos, this.pos, false);
    this.tag.style.display = 'none';
  }

  update(dt, now, beat, camera, particles) {
    if (this.wantBody !== this.body) {
      this.bodyT -= dt;
      if (this.bodyT <= 0) { this.bodyT = 1; this.applyLook(); }
    }
    if (!this.seen || !this.buf.length) { this.char.root.visible = false; this.tag.style.display = 'none'; return; }
    const rt = now - DELAY;
    const b = this.buf;
    let a = b[0];
    let c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) {
      if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
    }
    const k = c.t > a.t ? THREE.MathUtils.clamp((rt - a.t) / (c.t - a.t), 0, 1) : 1;
    const wasGround = this.onGround;
    this.pos.set(THREE.MathUtils.lerp(a.x, c.x, k), THREE.MathUtils.lerp(a.y, c.y, k), THREE.MathUtils.lerp(a.z, c.z, k));
    let dy = c.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw = a.yaw + dy * k;
    this.pitch = THREE.MathUtils.lerp(a.pitch, c.pitch, k);
    const L = k > 0.5 ? c : a;
    this.speed = L.sp;
    this.onGround = !!L.g;
    this.justLanded = this.onGround && !wasGround;
    this.localMove.set(L.lx, L.ly);
    const em = EMOTES[L.e] || '';
    if (em) { if (!this.emote || this.emote.id !== em) this.emote = { id: em, t: 0 }; this.emote.t += dt; } else this.emote = null;
    this.beat = beat;
    this.ghost = !!L.gh;
    this.alive = !this.ghost;
    this.firing = !!c.f && !this.ghost;
    this.endPt.set(c.ex, c.ey, c.ez);
    this.head.copy(this.pos).add(_v.set(0, 1.55, 0));
    this.char.root.visible = true;
    this.char.setGhost(this.ghost);
    if (this.firing) this.char.fireKick = Math.min(1, this.char.fireKick + dt * 10);
    this.char.update(dt, this);
    this.char.muzzleWorld(this.muzzle);
    this.fx.update(dt, now, this.firing, this.muzzle, this.firing ? this.endPt : this.muzzle, this.firing);
    if (this.firing) {
      this.sparkT += dt;
      if (this.sparkT > 0.06) { this.sparkT = 0; particles.sparks(this.endPt, null, 2, null, 3); }
    }
    _v.copy(this.head).add(new THREE.Vector3(0, 0.55, 0)).project(camera);
    const d = camera.position.distanceTo(this.head);
    if (_v.z < 1 && d < 70) {
      this.tag.style.display = '';
      this.tag.style.transform = `translate(${((_v.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
      this.tag.style.opacity = String((this.ghost ? 0.45 : 1) * THREE.MathUtils.clamp(1.4 - d / 50, 0.25, 1));
    } else this.tag.style.display = 'none';
  }

  dispose() {
    this.scene.remove(this.char.root);
    this.fx.dispose();
    this.tag.remove();
  }
}
