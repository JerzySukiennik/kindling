import * as THREE from 'three';
import { Character } from './character.js';
import { groundHeight, ZONE, LAMPS, LOBBY } from '../world/layout.js';

export const JUMP_V = 8.2;
export const GRAVITY = 20;

export class Player {
  constructor(scene, camera, obstacles) {
    this.camera = camera;
    this.char = new Character(scene);
    this.pos = new THREE.Vector3(0, groundHeight(0, 6), 6);
    this.vel = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.04;
    this.onGround = true;
    this.alive = true;
    this.ghost = false;
    this.speed = 0;
    this.localMove = new THREE.Vector2();
    this.justLanded = false;
    this.camPos = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.zoneObstacles = [...obstacles, ...LAMPS.map((l) => ({ x: l.x, z: l.z, r: 0.35 }))];
    this.obstacles = this.zoneObstacles;
    this.lobbyObstacles = [];
    this.solids = [];
    this.area = 'zone';
    this.canDouble = false;
    this.jumpsUsed = 0;
    this.emote = null;
    this.emoteCam = 0;
    this.beat = 0;
    this.onEmote = () => {};
    this.shake = 0;
    this.fovKick = 0;
    this.aimAmt = 0;
    this.stepAcc = 0;
    this.onStep = () => {};
    this.onJump = () => {};
    this.onLand = () => {};
    this._v = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  setCharacter(ch) {
    if (this.char === ch) return;
    this.char.root.visible = false;
    this.char = ch;
    ch.root.visible = true;
    ch.setGhost(this.ghost);
  }

  setArea(area) {
    this.area = area;
    this.obstacles = area === 'lobby' ? this.lobbyObstacles : this.zoneObstacles;
    this.solids = area === 'lobby' ? this.lobbySolids || [] : [];
    this.pushed = false;
    if (area === 'lobby') { this.pos.set(LOBBY.spawn.x, LOBBY.y, LOBBY.spawn.z); this.yaw = Math.PI; }
    else { this.pos.set(0, groundHeight(0, 6), 6); this.yaw = 0; }
    this.vel.set(0, 0, 0);
    this.pitch = 0.04;
  }

  groundAt(x, z, feet) {
    let g = groundHeight(x, z);
    for (const s of this.solids) {
      if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && feet >= s.top - 0.4 && s.top > g) g = s.top;
    }
    return g;
  }

  reset() {
    this.pos.set(0, groundHeight(0, 6), 6);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0.04;
    this.alive = true;
    this.setGhost(false);
  }

  setGhost(on) {
    this.ghost = on;
    this.alive = !on;
    this.char.setGhost(on);
  }

  update(dt, input, mouse, allowControl) {
    this.aimAmt += (((allowControl && input.aim && !this.ghost) ? 1 : 0) - this.aimAmt) * Math.min(1, dt * 12);
    if (allowControl) {
      const sens = 0.0022 * (1 - this.aimAmt * 0.55);
      this.yaw -= mouse.dx * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.dy * sens, -0.55, 0.75);
    }
    const fwd = this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = this._v.set(0, 0, 0);
    if (allowControl) {
      if (input.down('KeyW')) wish.add(fwd);
      if (input.down('KeyS')) wish.sub(fwd);
      if (input.down('KeyD')) wish.add(right);
      if (input.down('KeyA')) wish.sub(right);
    }
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();
    if (allowControl && !this.ghost) {
      const ids = ['wave', 'dance', 'point', 'laugh'];
      for (let i = 0; i < 4; i++) {
        if (input.hit('Digit' + (i + 1)) && this.onGround) {
          this.emote = this.emote && this.emote.id === ids[i] ? null : { id: ids[i], t: 0 };
          if (this.emote) this.onEmote(this.emote.id);
        }
      }
    }
    if (this.emote) {
      this.emote.t += dt;
      const dur = { wave: 3, dance: 1e9, point: 2.4, laugh: 2.6 }[this.emote.id];
      if (moving || !this.onGround || this.ghost || input.fire || input.aim || input.hit('Space') || this.emote.t > dur) this.emote = null;
    }
    this.emoteCam += ((this.emote && this.emote.t > 0.15 ? 1 : 0) - this.emoteCam) * Math.min(1, dt * 3);
    const sprint = allowControl && input.down('ShiftLeft') && moving && input.down('KeyW') && this.aimAmt < 0.3;
    const maxSpeed = this.ghost ? 5 : sprint ? 6.6 : 4.3 - this.aimAmt * 1.6;
    const accel = this.onGround ? 14 : 4;
    const tx = wish.x * maxSpeed;
    const tz = wish.z * maxSpeed;
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, accel * dt);
    this.justLanded = false;
    if (this.ghost) {
      this.vel.y = 0;
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = this.groundAt(this.pos.x, this.pos.z, 99) + 0.6 + Math.sin(performance.now() * 0.002) * 0.15;
    } else {
      if (this.onGround) this.jumpsUsed = 0;
      if (allowControl && input.hit('Space')) {
        if (this.onGround) {
          this.vel.y = JUMP_V;
          this.onGround = false;
          this.jumpsUsed = 1;
          this.onJump(false);
        } else if (this.canDouble && this.jumpsUsed < 2) {
          this.vel.y = JUMP_V * 0.88;
          this.jumpsUsed = 2;
          this.onJump(true);
        }
      }
      this.vel.y -= GRAVITY * dt;
      const ox = this.pos.x;
      const oz = this.pos.z;
      this.pos.addScaledVector(this.vel, dt);
      const feetPrev = this.pos.y - this.vel.y * dt;
      for (const sd of this.solids) {
        const pad = 0.3;
        if (this.pos.x > sd.x0 - pad && this.pos.x < sd.x1 + pad && this.pos.z > sd.z0 - pad && this.pos.z < sd.z1 + pad && feetPrev < sd.top - 0.4) {
          const insideBefore = ox > sd.x0 - pad && ox < sd.x1 + pad && oz > sd.z0 - pad && oz < sd.z1 + pad;
          if (!insideBefore) { this.pos.x = ox; this.pos.z = oz; }
          else {
            const dl = this.pos.x - (sd.x0 - pad);
            const dr = sd.x1 + pad - this.pos.x;
            const db = this.pos.z - (sd.z0 - pad);
            const df = sd.z1 + pad - this.pos.z;
            const mn = Math.min(dl, dr, db, df);
            if (mn === dl) this.pos.x = sd.x0 - pad; else if (mn === dr) this.pos.x = sd.x1 + pad; else if (mn === db) this.pos.z = sd.z0 - pad; else this.pos.z = sd.z1 + pad;
          }
        }
      }
      const gy = this.groundAt(this.pos.x, this.pos.z, Math.max(this.pos.y, feetPrev));
      if (this.pos.y <= gy) {
        if (!this.onGround) { this.justLanded = true; this.onLand(Math.abs(this.vel.y)); }
        this.pos.y = gy;
        this.vel.y = 0;
        this.onGround = true;
      } else if (this.onGround && this.pos.y - gy < 0.25) {
        this.pos.y = gy;
        this.vel.y = 0;
      } else {
        this.onGround = false;
      }
    }
    if (this.area === 'lobby') {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, LOBBY.x0, LOBBY.x1);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, LOBBY.z0, LOBBY.z1);
    } else {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, ZONE.x0 + 0.3, ZONE.x1 - 0.3);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, ZONE.z0 + 0.25, this.pushed ? 30 : ZONE.z1 - 0.25);
    }
    for (const o of this.obstacles) {
      const dx = this.pos.x - o.x;
      const dz = this.pos.z - o.z;
      const rr = o.r + 0.32;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x = o.x + (dx / d) * rr;
        this.pos.z = o.z + (dz / d) * rr;
      }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const inv = -(this.yaw + Math.PI);
    const c = Math.cos(inv);
    const s = Math.sin(inv);
    this.localMove.set(this.vel.x * c + this.vel.z * s, -this.vel.x * s + this.vel.z * c);
    if (this.localMove.lengthSq() > 1e-4) this.localMove.normalize();
    if (this.onGround && !this.ghost && this.speed > 0.5) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > (sprint ? 1.25 : 0.95)) { this.stepAcc = 0; this.onStep(this.pos, sprint); }
    }
    this.char.update(dt, this);
    this.head.copy(this.pos).add(this._v.set(0, 1.55, 0));
    this.fovKick += ((sprint ? 1 : 0) - this.fovKick) * Math.min(1, dt * 4);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const cam = this.camera;
    const cp = Math.cos(this.pitch);
    this.camDir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    const pivot = this._v.copy(this.pos).add(new THREE.Vector3(0, 1.62, 0));
    const right = this._right;
    const back = 3.5 - this.fovKick * 0.3 - this.aimAmt * 1.7;
    this.camPos.copy(pivot).addScaledVector(this.camDir, -back).addScaledVector(right, 0.95 - this.aimAmt * 0.25).add(new THREE.Vector3(0, 0.18 - this.aimAmt * 0.08, 0));
    if (this.emoteCam > 0.001) {
      const ang = this.yaw - 0.55;
      const front = this._v2 || (this._v2 = new THREE.Vector3());
      front.set(this.pos.x - Math.sin(ang) * 3.0, this.pos.y + 1.55, this.pos.z - Math.cos(ang) * 3.0);
      this.camPos.lerp(front, this.emoteCam);
      const lookAt = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
      const dirToChar = lookAt.sub(this.camPos).normalize();
      this.camDirEm = (this.camDirEm || new THREE.Vector3()).copy(this.camDir).lerp(dirToChar, this.emoteCam).normalize();
    }
    const gy = this.groundAt(this.camPos.x, this.camPos.z, 99) + 0.35;
    if (this.camPos.y < gy) this.camPos.y = gy;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;
    const t = performance.now() * 0.001;
    cam.position.copy(this.camPos).add(new THREE.Vector3(Math.sin(t * 37) * sh * 0.06, Math.sin(t * 43 + 1) * sh * 0.05, 0));
    const ld = this.emoteCam > 0.001 ? this.camDirEm : this.camDir;
    cam.lookAt(this.camPos.x + ld.x, this.camPos.y + ld.y, this.camPos.z + ld.z);
    const fov = 58 + this.fovKick * 6 - this.aimAmt * 27;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
