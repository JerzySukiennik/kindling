import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { LOBBY } from './layout.js';
import { CATALOG } from '../game/profile.js';
import { buildCostume, gunMaterials } from '../game/character.js';

const CX = 10.95;
const CZ = 45;

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function createWardrobe(scene, darkWood, planks) {
  const y0 = LOBBY.y;
  const root = new THREE.Group();
  scene.add(root);
  const add = (geo, mat, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const xB = CX + 0.42;
  const xF = CX - 0.45;
  add(mergeGeometries([
    box(0.06, 2.6, 2.3, xB, y0 + 1.35, CZ),
    box(0.92, 2.72, 0.07, CX, y0 + 1.36, CZ - 1.15), box(0.92, 2.72, 0.07, CX, y0 + 1.36, CZ + 1.15),
    box(1.0, 0.12, 2.46, CX, y0 + 2.74, CZ), box(1.06, 0.08, 2.56, CX - 0.02, y0 + 2.83, CZ),
    box(0.98, 0.16, 2.42, CX, y0 + 0.08, CZ),
  ]), darkWood);
  add(mergeGeometries([box(0.84, 0.045, 2.24, CX + 0.01, y0 + 0.42, CZ), box(0.84, 0.045, 2.24, CX + 0.01, y0 + 1.05, CZ), box(0.84, 0.045, 2.24, CX + 0.01, y0 + 1.72, CZ)]), planks);
  add(box(0.02, 2.4, 2.18, xB - 0.035, y0 + 1.35, CZ), new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 }));
  const brass = new THREE.MeshStandardMaterial({ color: 0x7a6236, metalness: 0.9, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(xF, y0 + 1.36, CZ + s * 1.15);
    hinge.rotation.y = s * 1.95;
    root.add(hinge);
    add(box(0.05, 2.5, 1.12, 0, 0, -s * 0.56), darkWood, hinge);
    add(box(0.02, 2.1, 0.86, -0.03, 0, -s * 0.56), planks, hinge);
    add(new THREE.SphereGeometry(0.03, 10, 8).translate(-0.05, 0, -s * 1.02), brass, hinge);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 2.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 1.1) }));
  strip.position.set(CX - 0.3, y0 + 2.64, CZ);
  root.add(strip);
  const light = new THREE.PointLight(0xffb070, 3.2, 4.2, 1.6);
  light.position.set(CX - 0.9, y0 + 1.9, CZ);
  root.add(light);

  const linen = new THREE.MeshStandardMaterial({ color: 0x8a7f6c, roughness: 0.85 });
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.6 });
  const mats = gunMaterials(new THREE.Color(0.55, 1, 0.3));
  mats.lens = new THREE.MeshStandardMaterial({ color: 0x0a0c0b, roughness: 0.3, metalness: 0.85, emissive: new THREE.Color(0.18, 0.4, 0.1), emissiveIntensity: 0.7 });
  const items = new Map();
  const slot = (key, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = -Math.PI / 2;
    root.add(g);
    const kind = key === 'bodies:jurek' ? 'mini' : key.startsWith('beams') ? 'vial' : 'head';
    items.set(key, { g, base: new THREE.Vector3(x, y, z), kind, hover: 0 });
    return g;
  };
  const top = y0 + 1.745;
  const mid = y0 + 1.075;
  const costumeSlots = [['witch', top, -0.6], ['plague', top, 0.0], ['pumpkin', top, 0.6], ['keeper', mid, -0.6], ['bone', mid, 0.0], ['jurek', mid, 0.6]];
  for (const [id, y, dz] of costumeSlots) {
    const g = slot((id === 'keeper' || id === 'jurek' ? 'bodies:' : 'costumes:') + id, CX + 0.05, y, CZ + dz);
    if (id === 'jurek') continue;
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 16).translate(0, 0.015, 0), standMat, g);
    add(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 10).translate(0, 0.13, 0), standMat, g);
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0);
    g.add(head);
    if (id !== 'pumpkin' && id !== 'bone' && id !== 'plague') add(new THREE.SphereGeometry(0.095, 20, 16), linen, head);
    if (id === 'witch') add(new THREE.SphereGeometry(0.095, 20, 16), linen, head);
    const c = buildCostume(id, mats);
    head.add(c);
  }
  CATALOG.beams.forEach((b, i) => {
    const g = slot('beams:' + b.id, CX - 0.05, y0 + 0.445, CZ - 0.72 + i * 0.36);
    const col = new THREE.Color(b.color[0], b.color[1], b.color[2]);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 18).translate(0, 0.1, 0), new THREE.MeshStandardMaterial({ color: 0x9fb0b8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }), g);
    add(new THREE.CylinderGeometry(0.038, 0.038, 0.14, 18).translate(0, 0.075, 0), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.35) }), g);
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 12).translate(0, 0.215, 0), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }), g);
  });

  const cam = { pos: new THREE.Vector3(CX - 3.1, y0 + 1.55, CZ), look: new THREE.Vector3(CX, y0 + 1.3, CZ) };
  const out = {
    root, items, light,
    focusKey: null,
    camPos: cam.pos.clone(),
    camLook: cam.look.clone(),
    focus(cat, id) { out.focusKey = cat && id ? cat + ':' + id : null; },
    setAvatar(model, clips) {
      const g = items.get('bodies:jurek').g;
      const mini = SkeletonUtils.clone(model);
      mini.scale.setScalar(0.36);
      mini.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(mini);
      const idle = clips.find((c) => c.name === 'idle');
      if (idle) { mixer.clipAction(idle).play(); mixer.update(0.5); }
      out.miniMixer = mixer;
      g.add(mini);
    },
    update(dt, active) {
      for (const [key, it] of items) {
        const want = active && key === out.focusKey ? 1 : 0;
        it.hover += (want - it.hover) * Math.min(1, dt * 7);
        const grow = it.kind === 'mini' ? 0.0 : it.kind === 'vial' ? 0.7 : 0.3;
        const s = 1 + it.hover * grow;
        it.g.scale.setScalar(s);
        it.g.position.copy(it.base);
        it.g.position.x -= it.hover * (it.kind === 'mini' ? 0.1 : 0.2);
        it.g.rotation.y = -Math.PI / 2 + (it.hover > 0.01 ? Math.sin(performance.now() * 0.0012) * 0.6 * it.hover : 0);
      }
      if (out.miniMixer) out.miniMixer.update(dt);
      const f = out.focusKey && items.get(out.focusKey);
      let tp = cam.pos;
      let tl = cam.look;
      if (f) {
        const h = f.kind === 'mini' ? 0.32 : f.kind === 'vial' ? 0.12 : 0.36;
        const d = f.kind === 'mini' ? 1.55 : f.kind === 'vial' ? 0.95 : 1.35;
        const side = f.kind === 'vial' ? 0.2 : 0.34;
        tp = new THREE.Vector3(f.base.x - d, f.base.y + h + 0.04, f.base.z - side);
        tl = new THREE.Vector3(f.base.x - 0.2, f.base.y + h, f.base.z - side);
      }
      const k = Math.min(1, dt * 4);
      out.camPos.lerp(tp, k);
      out.camLook.lerp(tl, k);
    },
    snapCamera() { out.camPos.copy(cam.pos); out.camLook.copy(cam.look); },
  };
  out.solid = { x0: CX - 0.5, x1: CX + 0.5, z0: CZ - 1.25, z1: CZ + 1.25, top: 2.9 };
  out.interact = { id: 'wardrobe', x: CX - 2.0, z: CZ, r: 2.0, label: 'Wardrobe' };
  return out;
}
