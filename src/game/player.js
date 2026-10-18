import * as THREE from 'three';
import { Character } from './character.js';
import { groundHeight, ZONE, LAMPS } from '../world/layout.js';

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
    this.obstacles = [...obstacles, ...LAMPS.map((l) => ({ x: l.x, z: l.z, r: 0.35 }))];
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
      this.pos.y = groundHeight(this.pos.x, this.pos.z) + 0.6 + Math.sin(performance.now() * 0.002) * 0.15;
    } else {
      if (allowControl && this.onGround && input.hit('Space')) {
        this.vel.y = JUMP_V;
        this.onGround = false;
        this.onJump();
      }
      this.vel.y -= GRAVITY * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gy = groundHeight(this.pos.x, this.pos.z);
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
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, ZONE.x0 + 0.3, ZONE.x1 - 0.3);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, ZONE.z0 + 0.25, ZONE.z1 - 0.25);
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
    const gy = groundHeight(this.camPos.x, this.camPos.z) + 0.35;
    if (this.camPos.y < gy) this.camPos.y = gy;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;
    const t = performance.now() * 0.001;
    cam.position.copy(this.camPos).add(new THREE.Vector3(Math.sin(t * 37) * sh * 0.06, Math.sin(t * 43 + 1) * sh * 0.05, 0));
    cam.lookAt(this.camPos.x + this.camDir.x, this.camPos.y + this.camDir.y, this.camPos.z + this.camDir.z);
    const fov = 58 + this.fovKick * 6 - this.aimAmt * 27;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
