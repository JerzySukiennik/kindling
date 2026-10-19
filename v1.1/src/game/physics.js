import RAPIER from 'rapier';
import * as THREE from 'three';
import { terrainColliderData } from '../world/terrain.js';
import { FENCE_X, PIT, BARRIER_Z, BARRIER_HALF_W } from '../world/layout.js';

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.acc = 0;
    const { verts, idx } = terrainColliderData(-23.5, 23.5, -66, 24, 0.5);
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.9).setRestitution(0.05));
    const lob = terrainColliderData(-27, 27, 27, 64, 0.75);
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(lob.verts, lob.idx).setFriction(0.9).setRestitution(0.05));
    for (const side of [-1, 1]) {
      const wall = RAPIER.ColliderDesc.cuboid(0.15, 2.5, 34).setTranslation(side * (FENCE_X - 0.15), 1.5, -30);
      this.world.createCollider(wall);
    }
    const back = RAPIER.ColliderDesc.cuboid(24, 3, 0.3).setTranslation(0, 1, PIT.z1 + 2.2);
    this.world.createCollider(back);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 3, 6).setTranslation(PIT.x0 - 2.5, 0, (PIT.z0 + PIT.z1) / 2));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 3, 6).setTranslation(PIT.x1 + 2.5, 0, (PIT.z0 + PIT.z1) / 2));
    const bb = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -4, BARRIER_Z);
    this.barrierBody = this.world.createRigidBody(bb);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(BARRIER_HALF_W, 1.7, 0.32).setTranslation(0, 1.7, 0.25).setFriction(0.6), this.barrierBody);
    this._v = new THREE.Vector3();
  }

  addStatic(c) {
    const d = this.R.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z);
    if (c.yaw) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
      d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    this.world.createCollider(d);
  }

  setBarrier(y, z) {
    this.barrierBody.setNextKinematicTranslation({ x: 0, y, z });
  }

  step(dt) {
    this.acc = Math.min(this.acc + dt, 1 / 20);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 3) {
      this.world.step();
      this.acc -= 1 / 60;
      n++;
    }
  }
}
