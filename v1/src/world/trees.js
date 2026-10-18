import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { groundHeight } from './layout.js';

function tube(points, radii, radial, uvScale, flare = null) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const n = points.length;
  let along = 0;
  const frames = [];
  let prevSide = null;
  for (let i = 0; i < n; i++) {
    const t = points[Math.min(i + 1, n - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
    let side;
    if (prevSide) {
      side = prevSide.clone().sub(t.clone().multiplyScalar(prevSide.dot(t))).normalize();
    } else {
      const ref = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      side = new THREE.Vector3().crossVectors(t, ref).normalize();
    }
    prevSide = side;
    const up = new THREE.Vector3().crossVectors(side, t).normalize();
    frames.push({ t, side, up });
  }
  for (let i = 0; i < n; i++) {
    if (i > 0) along += points[i].distanceTo(points[i - 1]);
    const { side, up } = frames[i];
    const r = radii[i];
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      let rr = r;
      if (flare && i < flare.rings) {
        const f = 1 - i / flare.rings;
        rr *= 1 + flare.amt * f * f * Math.max(0, Math.cos(a * flare.lobes + flare.phase)) ** 3;
      }
      rr *= 1 + 0.06 * Math.sin(a * 3 + i * 1.7);
      const d = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      const p = points[i].clone().addScaledVector(d, rr);
      pos.push(p.x, p.y, p.z);
      nrm.push(d.x, d.y, d.z);
      const circ = Math.max(1, Math.round((2 * Math.PI * r) / 0.45));
      uv.push((k / radial) * circ, along * uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function treeGeometry(seed, scale = 1) {
  const rand = mulberry32(seed);
  const parts = [];
  const lean = new THREE.Vector3((rand() - 0.5) * 0.25, 1, (rand() - 0.5) * 0.25).normalize();
  const branch = (start, dir, len, r0, depth, isTrunk) => {
    const segs = isTrunk ? 9 : Math.max(3, 7 - depth);
    const pts = [start.clone()];
    const radii = [r0];
    const d = dir.clone();
    const p = start.clone();
    const gnarl = isTrunk ? 0.22 : 0.38 + depth * 0.08;
    for (let i = 1; i <= segs; i++) {
      const jitter = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.6, rand() - 0.5).multiplyScalar(gnarl);
      d.add(jitter);
      if (!isTrunk) d.y += depth > 1 ? -0.04 : 0.05;
      d.normalize();
      p.addScaledVector(d, len / segs);
      pts.push(p.clone());
      const t = i / segs;
      radii.push(r0 * (1 - t * (isTrunk ? 0.72 : 0.82)) + 0.004);
    }
    const radial = isTrunk ? 9 : depth === 1 ? 6 : depth === 2 ? 5 : 3;
    parts.push(tube(pts, radii, radial, 0.5, isTrunk ? { rings: 3, amt: 1.1, lobes: 4, phase: rand() * 6 } : null));
    if (depth >= 4) return;
    const kids = isTrunk ? 4 + Math.floor(rand() * 3) : depth === 1 ? 3 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
    for (let k = 0; k < kids; k++) {
      const t = isTrunk ? 0.42 + (k / kids) * 0.5 + rand() * 0.06 : 0.3 + rand() * 0.65;
      const fi = t * segs;
      const i0 = Math.floor(fi);
      const i1 = Math.min(segs, i0 + 1);
      const sp = pts[i0].clone().lerp(pts[i1], fi - i0);
      const sr = radii[i0] * (1 - (fi - i0)) + radii[i1] * (fi - i0);
      const az = rand() * Math.PI * 2;
      const tilt = (isTrunk ? 0.75 : 0.6) + rand() * 0.6;
      const nd = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
      nd.lerp(d, 0.25).normalize();
      if (depth >= 2) nd.y -= 0.25;
      nd.normalize();
      const nl = len * (isTrunk ? 0.5 + rand() * 0.25 : 0.55 + rand() * 0.25);
      branch(sp, nd, nl, sr * (0.55 + rand() * 0.15), depth + 1, false);
    }
  };
  const H = (6 + rand() * 4) * scale;
  branch(new THREE.Vector3(0, -0.4, 0), lean, H, 0.32 * scale + rand() * 0.08, 0, true);
  for (let k = 0; k < 4; k++) {
    const az = (k / 4) * Math.PI * 2 + rand();
    const d = new THREE.Vector3(Math.cos(az), -0.18, Math.sin(az)).normalize();
    const pts = [];
    const radii = [];
    const p = new THREE.Vector3(Math.cos(az) * 0.15, 0.25, Math.sin(az) * 0.15);
    for (let i = 0; i < 5; i++) {
      pts.push(p.clone());
      radii.push(0.16 * scale * (1 - i / 5) + 0.02);
      p.addScaledVector(d, 0.35 * scale);
      p.y -= 0.06 * i;
    }
    parts.push(tube(pts, radii, 5, 0.5));
  }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

export function createTrees(scene, assets, list) {
  const bark = assets.tex.bark_willow;
  const mat = new THREE.MeshStandardMaterial({
    map: bark.diff, normalMap: bark.nor, roughnessMap: bark.arm, aoMap: bark.arm,
    roughness: 1, metalness: 0, color: new THREE.Color(0.62, 0.6, 0.6),
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  const variants = [];
  for (let i = 0; i < 7; i++) variants.push(treeGeometry(1000 + i * 77, 1));
  const meshes = [];
  const cells = new Map();
  const o = new THREE.Object3D();
  for (const t of list) {
    o.position.set(t.x, groundHeight(t.x, t.z) - 0.1, t.z);
    o.rotation.set(0, (t.seed % 628) / 100, 0);
    o.scale.setScalar(t.s);
    o.updateMatrix();
    const key = (t.x < -30 ? 'L' : t.x > 30 ? 'R' : 'M') + Math.floor(t.z / 40);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(variants[t.seed % variants.length].clone().applyMatrix4(o.matrix));
  }
  for (const list2 of cells.values()) {
    const m = new THREE.Mesh(mergeGeometries(list2), mat);
    m.geometry.computeBoundingSphere();
    m.name = 'tree';
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}
