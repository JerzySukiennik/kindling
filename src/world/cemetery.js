import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRAVES, groundHeight, FENCE_X, GATE, CRYPT, STATUE } from './layout.js';
import { mulberry32 } from './noise.js';
import { triplanarMaterial } from './stone.js';

const FIRST = ['ELIAS', 'MARTHA', 'EZEKIEL', 'AGNES', 'TOBIAS', 'HELENA', 'SILAS', 'CLARA', 'JONAH', 'EDITH', 'AMOS', 'ROSA', 'WALTER', 'IDA', 'CASPAR', 'LENA'];
const LAST = ['MORROW', 'HOLLOWAY', 'ASHGROVE', 'BLACKWOOD', 'THORNE', 'CROWLEY', 'VANE', 'GRIMSBY', 'MARSH', 'KETTLE', 'WREN', 'HALE', 'FENWICK', 'DUSK'];

function strip(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

function extrude(shape, depth, bevel = 0.012) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function merge(list) {
  return mergeGeometries(list.map(strip));
}

function graveGeometries() {
  const G = {};
  const plinth = () => box(0.8, 0.14, 0.32, 0, 0.07, 0);
  {
    const s = new THREE.Shape();
    s.moveTo(-0.31, 0); s.lineTo(0.31, 0); s.lineTo(0.31, 0.62); s.absarc(0, 0.62, 0.31, 0, Math.PI, false); s.lineTo(-0.31, 0);
    const g = extrude(s, 0.12); g.translate(0, 0.13, 0);
    G.round = { geo: merge([g, plinth()]), inscr: new THREE.Vector4(-0.25, 0.3, 0.5, 0.58) };
  }
  {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.7); s.lineTo(0.34, 0.74); s.lineTo(0.3, 0.78);
    s.quadraticCurveTo(0.29, 1.02, 0, 1.18); s.quadraticCurveTo(-0.29, 1.02, -0.3, 0.78);
    s.lineTo(-0.34, 0.74); s.lineTo(-0.3, 0.7); s.lineTo(-0.3, 0);
    const g = extrude(s, 0.13); g.translate(0, 0.13, 0);
    G.gothic = { geo: merge([g, plinth()]), inscr: new THREE.Vector4(-0.24, 0.28, 0.48, 0.58) };
  }
  {
    const s = new THREE.Shape();
    const w = 0.075, cw = 0.3, cy0 = 0.72, cy1 = 0.87, H = 1.15;
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, cy0); s.lineTo(cw, cy0); s.lineTo(cw, cy1); s.lineTo(w, cy1);
    s.lineTo(w, H); s.lineTo(-w, H); s.lineTo(-w, cy1); s.lineTo(-cw, cy1); s.lineTo(-cw, cy0); s.lineTo(-w, cy0); s.lineTo(-w, 0);
    const g = extrude(s, 0.11, 0.01); g.translate(0, 0.3, 0);
    G.cross = { geo: merge([g, box(0.5, 0.18, 0.36, 0, 0.09, 0), box(0.34, 0.13, 0.26, 0, 0.245, 0)]), inscr: new THREE.Vector4(-0.22, 0.01, 0.44, 0.17) };
  }
  {
    const shaft = new THREE.CylinderGeometry(0.115, 0.17, 1.5, 4, 1);
    shaft.rotateY(Math.PI / 4); shaft.translate(0, 0.42 + 0.75, 0);
    const tip = new THREE.ConeGeometry(0.115, 0.22, 4);
    tip.rotateY(Math.PI / 4); tip.translate(0, 0.42 + 1.5 + 0.11, 0);
    G.obelisk = { geo: merge([shaft, tip, box(0.52, 0.22, 0.52, 0, 0.11, 0), box(0.4, 0.2, 0.4, 0, 0.32, 0)]), inscr: new THREE.Vector4(-0.19, 0.02, 0.38, 0.38) };
  }
  {
    const s = new THREE.Shape();
    s.moveTo(-0.42, 0); s.lineTo(0.42, 0); s.lineTo(0.42, 0.42); s.lineTo(0.34, 0.52); s.lineTo(-0.34, 0.52); s.lineTo(-0.42, 0.42); s.lineTo(-0.42, 0);
    const g = extrude(s, 0.15); g.translate(0, 0.08, 0);
    G.slab = { geo: merge([g, box(0.96, 0.1, 0.34, 0, 0.05, 0)]), inscr: new THREE.Vector4(-0.34, 0.1, 0.68, 0.42) };
  }
  {
    const s = new THREE.Shape();
    s.moveTo(-0.31, 0); s.lineTo(0.31, 0); s.lineTo(0.31, 0.46); s.lineTo(0.21, 0.53); s.lineTo(0.13, 0.42); s.lineTo(0.03, 0.6);
    s.lineTo(-0.07, 0.48); s.lineTo(-0.18, 0.56); s.lineTo(-0.31, 0.5); s.lineTo(-0.31, 0);
    const g = extrude(s, 0.12); g.translate(0, 0.13, 0);
    G.broken = { geo: merge([g, plinth()]), inscr: new THREE.Vector4(-0.25, 0.3, 0.5, 0.58) };
  }
  for (const k of Object.keys(G)) G[k].geo.computeBoundingSphere();
  return G;
}

async function engraveAtlas() {
  try { await document.fonts.load('48px "IM Fell English SC"'); } catch (e) { /* fallback font */ }
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 1024);
  const rand = mulberry32(31);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px) => `${px}px "IM Fell English SC", Georgia, serif`;
  for (let i = 0; i < 16; i++) {
    const cx = (i % 4) * 256 + 128;
    const cy = 1024 - (Math.floor(i / 4) * 256 + 128);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.filter = 'blur(1.2px)';
    const kind = i % 4;
    const name = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const y0 = 1790 + Math.floor(rand() * 110);
    const y1 = y0 + 8 + Math.floor(rand() * 70);
    if (kind === 0 || kind === 2) {
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, -100); ctx.lineTo(0, -40); ctx.moveTo(-22, -80); ctx.lineTo(22, -80); ctx.stroke();
    }
    if (kind === 1) { ctx.font = font(30); ctx.fillText('IN MEMORY OF', 0, -78); }
    if (kind === 3) { ctx.font = font(46); ctx.fillText('R.I.P.', 0, -78); }
    ctx.font = font(36);
    ctx.fillText(name, 0, -14);
    ctx.font = font(40);
    ctx.fillText(last, 0, 30);
    ctx.font = font(28);
    ctx.fillText(`${y0} – ${y1}`, 0, 76);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-60, 104); ctx.lineTo(60, 104); ctx.stroke();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export async function createCemetery(scene, assets) {
  const out = { colliders: [] };
  const engrave = await engraveAtlas();
  const G = graveGeometries();
  const rand = mulberry32(808);
  const byType = {};
  for (const g of GRAVES) (byType[g.type] ||= []).push(g);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const [type, list] of Object.entries(byType)) {
    const def = G[type];
    const mat = triplanarMaterial(assets, 'mossy_rock', 1.1, { mossUp: 0.9, engrave, inscr: def.inscr, color: new THREE.Color(0.86, 0.86, 0.88) });
    const geo = def.geo.clone();
    const cells = new Float32Array(list.length);
    for (let i = 0; i < list.length; i++) cells[i] = Math.floor(rand() * 16);
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((g, i) => {
      p.set(g.x, groundHeight(g.x, g.z) - 0.07, g.z);
      q.setFromEuler(e.set(-g.tilt, g.rot, g.roll, 'YXZ'));
      s.setScalar(g.scale);
      im.setMatrixAt(i, m.compose(p, q, s));
    });
    im.name = 'grave';
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
  }

  const stoneMat = triplanarMaterial(assets, 'mossy_stone_wall', 1.6, { mossUp: 0.7, color: new THREE.Color(0.78, 0.78, 0.8) });
  const ironTex = assets.tex.rusty_metal_04;
  const iron = new THREE.MeshStandardMaterial({ map: ironTex.diff, normalMap: ironTex.nor, roughnessMap: ironTex.arm, metalnessMap: ironTex.arm, color: new THREE.Color(0.32, 0.3, 0.29), metalness: 1, roughness: 1 });

  {
    const bar = merge([new THREE.CylinderGeometry(0.011, 0.011, 1.55, 5, 1).translate(0, 0.775, 0), new THREE.ConeGeometry(0.028, 0.1, 4).translate(0, 1.6, 0)]);
    const bars = [];
    const rails = [];
    const posts = [];
    for (const side of [-1, 1]) {
      const x = side * FENCE_X;
      for (let z = -61.8; z < -2.2; z += 0.135) {
        if (side > 0 && Math.abs(z - GATE.z) < 1.75) continue;
        if (rand() < 0.035) continue;
        const bent = rand() < 0.05 ? (rand() - 0.5) * 0.5 : (rand() - 0.5) * 0.03;
        bars.push({ x, z, bent, h: 0.96 + rand() * 0.06 });
      }
      for (let z = -61.8; z < -2.2; z += 2.7) {
        posts.push({ x, z });
        const z1 = Math.min(z + 2.7, -2.2);
        const inGate = side > 0 && z < GATE.z + 1.75 && z1 > GATE.z - 1.75;
        if (!inGate) rails.push({ x, z0: z, z1 });
      }
    }
    const bim = new THREE.InstancedMesh(bar, iron, bars.length);
    bars.forEach((b, i) => {
      p.set(b.x, groundHeight(b.x, b.z) - 0.05, b.z);
      q.setFromEuler(e.set(b.bent, 0, b.bent * 0.3));
      s.set(1, b.h, 1);
      bim.setMatrixAt(i, m.compose(p, q, s));
    });
    bim.castShadow = true;
    bim.receiveShadow = true;
    bim.computeBoundingSphere();
    scene.add(bim);
    const railGeo = box(0.03, 0.04, 1, 0, 0, 0);
    const rim = new THREE.InstancedMesh(railGeo, iron, rails.length * 2);
    rails.forEach((r, i) => {
      for (let k = 0; k < 2; k++) {
        const zc = (r.z0 + r.z1) / 2;
        p.set(r.x, groundHeight(r.x, zc) + (k ? 1.36 : 0.28), zc);
        q.identity();
        s.set(1, 1, r.z1 - r.z0);
        rim.setMatrixAt(i * 2 + k, m.compose(p, q, s));
      }
    });
    rim.castShadow = true;
    rim.computeBoundingSphere();
    scene.add(rim);
    const postGeo = merge([box(0.075, 1.78, 0.075, 0, 0.89, 0), new THREE.SphereGeometry(0.055, 8, 6).translate(0, 1.82, 0)]);
    const pim = new THREE.InstancedMesh(postGeo, iron, posts.length);
    posts.forEach((pp, i) => {
      p.set(pp.x, groundHeight(pp.x, pp.z) - 0.05, pp.z);
      q.identity();
      s.setScalar(1);
      pim.setMatrixAt(i, m.compose(p, q, s));
    });
    pim.castShadow = true;
    pim.computeBoundingSphere();
    scene.add(pim);
  }

  {
    const pillarGeo = merge([box(0.56, 2.2, 0.56, 0, 1.1, 0), box(0.72, 0.14, 0.72, 0, 2.27, 0), new THREE.SphereGeometry(0.17, 12, 8).translate(0, 2.5, 0)]);
    const pillars = [
      { x: FENCE_X, z: GATE.z - 1.85 }, { x: FENCE_X, z: GATE.z + 1.85 },
      { x: -FENCE_X, z: -2.0 }, { x: FENCE_X, z: -2.0 }, { x: -FENCE_X, z: -62.0 }, { x: FENCE_X, z: -62.0 },
    ];
    const im = new THREE.InstancedMesh(pillarGeo, stoneMat, pillars.length);
    pillars.forEach((pp, i) => {
      p.set(pp.x, groundHeight(pp.x, pp.z) - 0.08, pp.z);
      q.identity();
      s.setScalar(1);
      im.setMatrixAt(i, m.compose(p, q, s));
      out.colliders.push({ x: pp.x, y: p.y + 1.1, z: pp.z, hx: 0.3, hy: 1.2, hz: 0.3, yaw: 0 });
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    const gate = assets.models.iron_gate[0];
    const gm = new THREE.Mesh(gate.geometry, gate.material);
    gate.material.color.setRGB(0.55, 0.52, 0.5);
    const gb = gate.geometry.boundingBox;
    const gw = gb.max.x - gb.min.x;
    const sc = 3.4 / gw;
    gm.scale.setScalar(sc);
    gm.position.set(GATE.x, groundHeight(GATE.x, GATE.z) - 0.05, GATE.z);
    gm.rotation.y = GATE.rot;
    gm.castShadow = true;
    gm.receiveShadow = true;
    scene.add(gm);
  }

  {
    const parts = [];
    parts.push(box(6.6, 0.5, 7.6, 0, 0.25, 0));
    for (let k = 0; k < 3; k++) parts.push(box(3.2 - k * 0.2, 0.16, 0.4, 0, 0.08 + k * 0.16 - 0.24 + 0.16, 3.9 + (2 - k) * 0.38));
    parts.push(box(4.6, 3.4, 5.2, 0, 0.5 + 1.7, -0.6));
    for (const cx of [-1.55, 1.55]) {
      parts.push(new THREE.CylinderGeometry(0.19, 0.22, 2.9, 14).translate(cx, 0.5 + 0.15 + 1.45, 2.65));
      parts.push(box(0.56, 0.15, 0.56, cx, 0.5 + 0.075, 2.65));
      parts.push(box(0.6, 0.2, 0.6, cx, 0.5 + 3.15, 2.65));
    }
    parts.push(box(5.3, 0.32, 7.0, 0, 0.5 + 3.4, 0.1));
    const tri = new THREE.Shape();
    tri.moveTo(-2.8, 0); tri.lineTo(2.8, 0); tri.lineTo(0, 1.25); tri.lineTo(-2.8, 0);
    const roof = new THREE.ExtrudeGeometry(tri, { depth: 7.2, bevelEnabled: false });
    roof.translate(0, 0, -3.5);
    roof.translate(0, 0.5 + 3.56, 0);
    parts.push(roof);
    parts.push(box(0.5, 2.8, 0.3, -1.05, 0.5 + 1.4, 2.0));
    parts.push(box(0.5, 2.8, 0.3, 1.05, 0.5 + 1.4, 2.0));
    parts.push(box(2.6, 0.5, 0.32, 0, 0.5 + 2.95, 2.0));
    const urn = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.16, 0), new THREE.Vector2(0.1, 0.1), new THREE.Vector2(0.22, 0.32), new THREE.Vector2(0.18, 0.5), new THREE.Vector2(0.1, 0.56), new THREE.Vector2(0.14, 0.62), new THREE.Vector2(0.0, 0.66)], 12);
    parts.push(urn.clone().translate(-2.5, 0.5 + 3.56, 3.3), urn.clone().translate(2.5, 0.5 + 3.56, 3.3));
    const cryptGeo = merge(parts);
    const crypt = new THREE.Mesh(cryptGeo, stoneMat);
    const cy = groundHeight(CRYPT.x, CRYPT.z) - 0.2;
    crypt.position.set(CRYPT.x, cy, CRYPT.z);
    crypt.rotation.y = CRYPT.rot;
    crypt.castShadow = true;
    crypt.receiveShadow = true;
    scene.add(crypt);
    const doorGeo = box(0.78, 2.3, 0.08, 0, 0, 0);
    for (const k of [-1, 1]) {
      const leaf = new THREE.Mesh(doorGeo, iron);
      leaf.position.set(k * 0.4, 0.5 + 1.15, 2.08);
      if (k > 0) { leaf.rotation.y = -0.35; leaf.position.x += 0.05; leaf.position.z += 0.13; }
      leaf.castShadow = true;
      crypt.add(leaf);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.25), fog: true }));
    glow.position.set(0, 0.5 + 1.15, 1.95);
    crypt.add(glow);
    out.cryptGlow = glow;
  }

  {
    const st = assets.models.statue[0];
    const ped = new THREE.Mesh(merge([box(1.4, 1.0, 1.4, 0, 0.5, 0), box(1.6, 0.16, 1.6, 0, 1.06, 0), box(1.7, 0.2, 1.7, 0, 0.1, 0)]), stoneMat);
    const py = groundHeight(STATUE.x, STATUE.z) - 0.1;
    ped.position.set(STATUE.x, py, STATUE.z);
    ped.rotation.y = STATUE.rot;
    ped.castShadow = ped.receiveShadow = true;
    scene.add(ped);
    const sm = new THREE.Mesh(st.geometry, st.material);
    st.material.color.setRGB(0.72, 0.72, 0.74);
    sm.scale.setScalar(1.25);
    sm.position.set(0, 1.14, 0);
    sm.castShadow = sm.receiveShadow = true;
    ped.add(sm);
  }

  out.stoneMat = stoneMat;
  out.iron = iron;
  return out;
}
