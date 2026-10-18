import * as THREE from 'three';
import { LAMPS, FRONT_CANDLES, groundHeight, GRAVES, CRYPT, STATUE, ZONE_ROCKS } from './layout.js';
import { mulberry32 } from './noise.js';
import { U } from './globals.js';

function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(1, 36, 22);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const phi = Math.atan2(v.z, v.x);
    const rib = Math.pow(Math.abs(Math.cos(phi * 5)), 0.45);
    const r = Math.hypot(v.x, v.z);
    const k = 0.93 + 0.07 * rib;
    v.x *= k;
    v.z *= k;
    v.y *= 0.74;
    v.y -= Math.sign(v.y) * 0.16 * Math.exp(-r * r * 9);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createProps(scene, assets) {
  const out = { lights: [], flickers: [] };
  const rand = mulberry32(616);

  const lampPart = assets.models.street_lamp[0];
  const lb = lampPart.geometry.boundingBox;
  lampPart.material.color.setRGB(0.5, 0.48, 0.46);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 3.6, 1.4) });
  const bulbGeo = new THREE.SphereGeometry(0.07, 12, 8);
  for (const l of LAMPS) {
    const lamp = new THREE.Mesh(lampPart.geometry, lampPart.material);
    lamp.position.set(l.x, groundHeight(l.x, l.z) - 0.05, l.z);
    lamp.rotation.y = l.rot;
    lamp.castShadow = true;
    lamp.receiveShadow = true;
    scene.add(lamp);
    const head = new THREE.Vector3((lb.max.x + lb.min.x) / 2, lb.max.y - 0.5, (lb.max.z + lb.min.z) / 2);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.copy(head);
    lamp.add(bulb);
    if (l.z < 5) {
      const light = new THREE.PointLight(0xffa860, 11, 22, 2);
      light.position.copy(head);
      lamp.add(light);
      out.lights.push(light);
      out.flickers.push({ light, base: 11, seed: rand() * 100 });
    }
  }

  const candleGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  candleGeo.translate(0, 0.5, 0);
  const candleMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.55, metalness: 0 });
  const flameGeo = new THREE.SphereGeometry(1, 8, 6);
  flameGeo.translate(0, 0.6, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 2.4, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  flameMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fid = float(gl_InstanceID);
        float fl = 0.85 + 0.15 * sin(uTime * 13.0 + fid * 3.1) + 0.1 * sin(uTime * 23.0 + fid);
        transformed.y *= fl;
        transformed.x += sin(uTime * 7.0 + fid * 2.0 + transformed.y * 2.0) * 0.12 * transformed.y;
      `);
  };
  flameMat.customProgramCacheKey = () => 'flame';
  const candles = [];
  const addCluster = (x, z, n) => {
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const r = k === 0 ? 0 : 0.07 + rand() * 0.07;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      candles.push({ x: cx, z: cz, h: 0.08 + rand() * 0.18, r: 0.022 + rand() * 0.016, y: groundHeight(cx, cz) - 0.01 });
    }
  };
  for (const c of FRONT_CANDLES) addCluster(c.x, c.z, 3);
  for (let i = 0; i < 40; i++) {
    const g = GRAVES[Math.floor(rand() * GRAVES.length)];
    if (Math.abs(g.z) > 40 || g.tilt > 0.3) continue;
    addCluster(g.x + (rand() - 0.5) * 0.4, g.z + 0.35, 1 + Math.floor(rand() * 3));
  }
  const cim = new THREE.InstancedMesh(candleGeo, candleMat, candles.length);
  const fim = new THREE.InstancedMesh(flameGeo, flameMat, candles.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  candles.forEach((c, i) => {
    cim.setMatrixAt(i, m.compose(p.set(c.x, c.y, c.z), q.identity(), s.set(c.r, c.h, c.r)));
    fim.setMatrixAt(i, m.compose(p.set(c.x, c.y + c.h, c.z), q.identity(), s.set(0.011, 0.03, 0.011)));
  });
  cim.castShadow = false;
  cim.receiveShadow = true;
  cim.computeBoundingSphere();
  fim.computeBoundingSphere();
  scene.add(cim, fim);

  const pg = pumpkinGeometry();
  const pmat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.22, 0.03), roughness: 0.5, metalness: 0 });
  pmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPl;\nvarying float vPid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPl = normalize(position);\nvPid = float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vPl;
        varying float vPid;
        float carve(vec2 q) {
          vec2 e = vec2(abs(q.x) - 0.33, q.y - 0.2);
          float eye = step(0.0, 0.13 - abs(e.x) * 1.15 - e.y) * step(-0.07, e.y);
          float nose = step(0.0, 0.07 - abs(q.x) * 1.3 - (q.y - 0.02)) * step(-0.04, q.y - 0.02);
          float my = q.y + 0.24;
          float mouth = step(abs(q.x), 0.56) * step(-0.12 + q.x * q.x * 0.35, my) * step(my, 0.09 + q.x * q.x * 0.5);
          float tooth = step(abs(fract(q.x * 3.2 + 0.5) - 0.5), 0.12) * step(my, -0.02) * step(-0.12 + q.x * q.x * 0.35, my);
          float tooth2 = step(abs(fract(q.x * 3.2) - 0.5), 0.1) * step(0.03 + q.x * q.x * 0.5, my);
          return max(max(eye, nose), mouth * (1.0 - tooth) * (1.0 - tooth2));
        }
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 q = vec2(atan(vPl.x, vPl.z), vPl.y);
        float hole = vPl.z > 0.0 ? carve(q) : 0.0;
        float fl = 0.8 + 0.2 * sin(uTime * 11.0 + vPid * 1.7) + 0.08 * sin(uTime * 29.0 + vPid);
        totalEmissiveRadiance += vec3(4.0, 1.6, 0.35) * hole * fl;
        diffuseColor.rgb *= 1.0 - hole * 0.9;
      `);
  };
  pmat.customProgramCacheKey = () => 'pumpkin';
  const spots = [];
  for (const l of LAMPS) spots.push({ x: l.x + (l.x > 0 ? -0.6 : 0.6), z: l.z + 0.5, s: 0.22, face: 0 });
  spots.push({ x: CRYPT.x + 3.2, z: CRYPT.z + 1.2, s: 0.26, face: Math.PI / 2 });
  spots.push({ x: CRYPT.x + 3.1, z: CRYPT.z - 1.3, s: 0.2, face: Math.PI / 2 });
  spots.push({ x: STATUE.x - 1.1, z: STATUE.z + 0.6, s: 0.24, face: -0.9 });
  for (const zr of ZONE_ROCKS.slice(0, 4)) spots.push({ x: zr.x + (zr.x > 0 ? -0.9 : 0.9), z: zr.z + 0.4, s: 0.18 + rand() * 0.08, face: 0 });
  for (let i = 0; i < 10; i++) {
    const g = GRAVES[Math.floor(rand() * GRAVES.length)];
    spots.push({ x: g.x + 0.45, z: g.z + 0.55, s: 0.15 + rand() * 0.1, face: (rand() - 0.5) * 0.8 });
  }
  const pim = new THREE.InstancedMesh(pg, pmat, spots.length);
  const e = new THREE.Euler();
  spots.forEach((sp, i) => {
    const y = groundHeight(sp.x, sp.z) + sp.s * 0.66;
    pim.setMatrixAt(i, m.compose(p.set(sp.x, y, sp.z), q.setFromEuler(e.set(0, sp.face + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.15)), s.setScalar(sp.s)));
  });
  pim.castShadow = true;
  pim.receiveShadow = true;
  pim.computeBoundingSphere();
  scene.add(pim);
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.32, 6, 2);
  stemGeo.translate(0, 0.86, 0);
  const sp2 = stemGeo.attributes.position;
  for (let i = 0; i < sp2.count; i++) {
    const y = sp2.getY(i);
    sp2.setX(i, sp2.getX(i) + Math.pow(Math.max(0, y - 0.7), 2) * 1.6);
  }
  stemGeo.computeVertexNormals();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 0.9 });
  const sim = new THREE.InstancedMesh(stemGeo, stemMat, spots.length);
  for (let i = 0; i < spots.length; i++) {
    pim.getMatrixAt(i, m);
    sim.setMatrixAt(i, m);
  }
  sim.computeBoundingSphere();
  scene.add(sim);

  const lan = assets.models.lantern[0];
  lan.material.color.setRGB(0.6, 0.55, 0.5);
  const lanSpots = [{ x: -11.5, z: 11.0 }, { x: 11.2, z: 11.3 }, { x: CRYPT.x + 3.4, z: CRYPT.z }, { x: -12.6, z: 0.6 }, { x: 12.8, z: 0.4 }];
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.0, 0.6) });
  const glassGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8);
  for (const ls of lanSpots) {
    const l = new THREE.Mesh(lan.geometry, lan.material);
    l.scale.setScalar(1.25);
    l.position.set(ls.x, groundHeight(ls.x, ls.z) - 0.01, ls.z);
    l.rotation.y = rand() * 6;
    l.castShadow = true;
    scene.add(l);
    const g = new THREE.Mesh(glassGeo, glassMat);
    g.position.set(0, 0.11, 0);
    l.add(g);
  }

  out.update = (t) => {
    for (const f of out.flickers) {
      f.light.intensity = f.base * (0.88 + 0.08 * Math.sin(t * 9 + f.seed) + 0.05 * Math.sin(t * 23 + f.seed * 2));
    }
  };
  return out;
}
