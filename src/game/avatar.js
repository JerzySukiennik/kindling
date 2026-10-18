import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Pose } from './rigpose.js';
import { makeGun, gunMaterials } from './character.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _n = new THREE.Vector3();

export class AvatarCharacter {
  static async load(scene, url, beam) {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new AvatarCharacter(scene, gltf, beam);
  }

  constructor(scene, gltf, beam) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);
    this.root.visible = false;
    this.meshes = [];
    this.bones = new Map();
    this.model.traverse((o) => {
      if (o.isBone) this.bones.set(o.name, o);
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const m = o.material;
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        m.roughness = Math.max(m.roughness ?? 1, 0.6);
        m.metalness = 0;
        o.userData.baseMat = m;
        o.layers.enable(1);
        this.meshes.push(o);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const name of ['idle', 'walk', 'run']) {
      const clip = gltf.animations.find((a) => a.name === name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      this.actions[name] = a;
    }
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
    this.pose = new Pose(this.model, this.bones);
    this.restMixer = new THREE.AnimationMixer(this.model);
    for (const a of Object.values(this.actions)) a.stop();
    for (const [, b] of this.bones) b.updateMatrixWorld(true);
    this.pose.captureRest();
    for (const a of Object.values(this.actions)) a.play();
    const hips = this.bones.get('Hips');
    this.hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
    this.mats = gunMaterials(new THREE.Color(...beam));
    const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.baseMat = mat;
      m.layers.enable(1);
      parent.add(m);
      this.meshes.push(m);
      return m;
    };
    this.aimPivot = new THREE.Group();
    this.aimPivot.position.set(0, 1.36, 0);
    this.root.add(this.aimPivot);
    const G = makeGun(this.mats, add);
    this.aimPivot.add(G.gun);
    G.gun.position.set(0.14, -0.06, 0.34);
    this.gun = G.gun;
    this.emitter = G.emitter;
    this.muzzleLocal = G.muzzleLocal;
    this.gripR = G.gripR;
    this.gripL = G.gripL;
    this.ghostMat = new THREE.MeshStandardMaterial({ color: 0x9fc4ff, emissive: 0x3f6fbf, emissiveIntensity: 0.9, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.3 });
    this.ghost = false;
    this.fireKick = 0;
    this.land = 0;
    this.blend = { idle: 1, walk: 0, run: 0 };
  }

  setBeamColor(c) { this.mats.glow.color.setRGB(c[0], c[1], c[2]).multiplyScalar(2.6); }
  setCostume() {}

  setGhost(on) {
    if (on === this.ghost) return;
    this.ghost = on;
    for (const m of this.meshes) {
      m.material = on ? this.ghostMat : m.userData.baseMat;
      m.castShadow = !on;
    }
  }

  muzzleWorld(out) {
    this.gun.updateWorldMatrix(true, false);
    return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
  }

  update(dt, s) {
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.yaw + Math.PI;
    const sp = s.speed;
    const air = !s.onGround;
    const want = air ? { idle: 1, walk: 0, run: 0 } : sp < 0.3 ? { idle: 1, walk: 0, run: 0 } : sp < 5 ? { idle: 0, walk: 1, run: 0 } : { idle: 0, walk: 0.2, run: 0.8 };
    const k = Math.min(1, dt * 8);
    for (const n of Object.keys(this.actions)) {
      this.blend[n] += (want[n] - this.blend[n]) * k;
      this.actions[n].setEffectiveWeight(this.blend[n]);
    }
    if (this.actions.walk) this.actions.walk.timeScale = THREE.MathUtils.clamp(sp / 1.6, 0.6, 2.2) * (s.localMove.y < -0.3 ? -1 : 1);
    if (this.actions.run) this.actions.run.timeScale = THREE.MathUtils.clamp(sp / 5, 0.8, 1.5);
    this.mixer.update(dt);
    const hips = this.bones.get('Hips');
    if (hips) { hips.position.x = this.hipsRest.x; hips.position.z = this.hipsRest.z; }
    this.land = Math.max(0, this.land - dt * 4);
    if (s.justLanded) this.land = 1;
    if (hips && this.land > 0) hips.position.y = this.hipsRest.y - this.land * 0.08 / Math.max(1e-3, this.model.scale.y);
    this.fireKick = Math.max(0, this.fireKick - dt * 6);
    this.aimPivot.rotation.set(-s.pitch + this.fireKick * 0.04, 0.0, 0);
    this.gun.position.z = 0.34 - this.fireKick * 0.02;
    this.root.updateMatrixWorld(true);
    const P = this.pose;
    const right = _v2.set(-1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q));
    P.spine(-s.pitch * 0.45, 0.18, 0);
    P.neckHead(-s.pitch * 0.4, 0.12, 0);
    if (air) {
      for (const [side, a, b] of [['Left', 0.5, 0.9], ['Right', -0.2, 0.5]]) {
        const ul = this.bones.get(side + 'UpLeg');
        const lg = this.bones.get(side + 'Leg');
        if (ul) P.rotateWorld(ul, right, a);
        if (lg) P.rotateWorld(lg, right, -b);
      }
    }
    this.root.updateMatrixWorld(true);
    this.gun.updateWorldMatrix(true, false);
    const gq = this.gun.getWorldQuaternion(_q);
    _f.set(0, 0, 1).applyQuaternion(gq);
    for (const [side, grip, poleSide] of [['Right', this.gripR, 1], ['Left', this.gripL, -1]]) {
      const target = _v.copy(grip).applyMatrix4(this.gun.matrixWorld);
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, poleSide * 0.8).normalize();
      _n.copy(right).multiplyScalar(-poleSide);
      P.arm(side, target, pole, side === 'Right' ? new THREE.Vector3(0, -1, 0).applyQuaternion(gq) : _f, _n);
      P.curl(side, { all: 0.9, Thumb: 0.4 });
    }
  }
}
