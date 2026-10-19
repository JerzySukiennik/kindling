import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOBBY, groundHeight } from './layout.js';
import { triplanarMaterial } from './stone.js';
import { mulberry32 } from './noise.js';
import { U } from './globals.js';
import { createWardrobe } from './wardrobe.js';

const Y = () => LOBBY.y;

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

function strip(list) {
  return mergeGeometries(list.map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    return g.index ? g.toNonIndexed() : g;
  }));
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { tex: t, canvas: c };
}

export const PARKOUR = [
  [17.5, 32.0, 0.45], [19.5, 33.8, 0.85], [21.6, 35.2, 1.25], [23.6, 36.9, 1.05], [24.4, 39.3, 1.55],
  [22.6, 41.0, 1.95], [20.4, 42.2, 1.75], [18.5, 43.9, 2.15], [18.0, 46.4, 2.55], [19.9, 48.2, 2.35],
  [22.1, 49.6, 2.8], [24.0, 51.4, 3.2], [23.0, 53.8, 3.0], [21.0, 55.4, 3.45], [19.6, 57.6, 3.85],
];

export const RANGE = { shooter: { x: -20.5, z: 32.5 }, dummies: [[-22.6, 44.5, 'walker'], [-18.6, 48.6, 'twig'], [-21.8, 53.8, 'brute'], [-18.9, 59.0, 'stilt']] };
export const MERCHANT = { x: -11.4, z: 45.0 };

export function createLobby(scene, assets, cem, bonfire) {
  const y0 = Y();
  const out = { interactables: [], solids: [], obstacles: [], flames: null, lights: [] };
  const stone = cem.stoneMat;
  const wood = triplanarMaterial(assets, 'rough_wood', 1.4, { color: new THREE.Color(0.62, 0.56, 0.5) });
  const planks = triplanarMaterial(assets, 'wood_planks_dirt', 2.2, { color: new THREE.Color(0.7, 0.64, 0.58) });
  const darkWood = triplanarMaterial(assets, 'wood_planks_grey', 2.0, { color: new THREE.Color(0.32, 0.27, 0.24) });
  const iron = cem.iron;
  const add = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    return m;
  };
  const solid = (x0, x1, z0, z1, top) => out.solids.push({ x0, x1, z0, z1, top });

  {
    const parts = [];
    parts.push(box(54, 0.75, 0.55, 0, y0 + 0.3, 28.55));
    for (let x = -26; x <= 26.01; x += 6.5) parts.push(box(0.8, 1.25, 0.8, x, y0 + 0.55, 28.55), box(0.95, 0.14, 0.95, x, y0 + 1.22, 28.55));
    for (const s of [-1, 1]) parts.push(box(0.55, 0.9, 35, s * 27.2, y0 + 0.4, 46));
    add(strip(parts), stone);
  }

  {
    const parts = [];
    parts.push(box(9.2, 5.6, 8.6, 0, y0 + 2.8, 59.2));
    const roof = new THREE.Shape();
    roof.moveTo(-5.2, 0); roof.lineTo(5.2, 0); roof.lineTo(0, 3.6); roof.lineTo(-5.2, 0);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 9.4, bevelEnabled: false });
    rg.translate(0, 0, -4.7);
    rg.translate(0, y0 + 5.6, 59.2);
    parts.push(rg);
    parts.push(box(3.4, 10.5, 3.4, 0, y0 + 5.25, 54.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.5, 2.4, 0.5, sx * 1.45, y0 + 11.7, 54.2 + sz * 1.45));
    parts.push(box(3.8, 0.4, 3.8, 0, y0 + 10.7, 54.2), box(3.8, 0.4, 3.8, 0, y0 + 13.0, 54.2));
    const spire = new THREE.ConeGeometry(2.6, 4.5, 4);
    spire.rotateY(Math.PI / 4);
    spire.translate(0, y0 + 15.4, 54.2);
    parts.push(spire);
    parts.push(box(10, 0.4, 9.6, 0, y0 + 0.2, 59.2));
    add(strip(parts), stone);
    const doorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.25) });
    const door = new THREE.Mesh(box(1.5, 2.6, 0.1, 0, y0 + 1.3, 52.47), doorMat);
    scene.add(door);
    add(box(1.9, 0.25, 0.3, 0, y0 + 2.7, 52.45), darkWood);
    const glass = canvasTex(128, 256, (x, w, h) => {
      const rnd = mulberry32(3);
      for (let j = 0; j < h; j += 16) for (let i = 0; i < w; i += 16) {
        const pal = ['#7a2c10', '#a35a14', '#3c5a2a', '#2a3a6a', '#7a6a1a', '#5a1a3a'];
        x.fillStyle = pal[Math.floor(rnd() * pal.length)];
        x.fillRect(i, j, 16, 16);
      }
      x.strokeStyle = '#111';
      x.lineWidth = 3;
      for (let j = 0; j <= h; j += 16) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
      for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    });
    const winMat = new THREE.MeshBasicMaterial({ map: glass.tex, color: new THREE.Color(2.2, 2.2, 2.2) });
    for (const s of [-1, 1]) for (const z of [57, 61]) {
      const wnd = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), winMat);
      wnd.position.set(s * 4.62, y0 + 3.0, z);
      wnd.rotation.y = s * Math.PI / 2;
      scene.add(wnd);
    }
    const bell = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.95], [0.12, 0.95], [0.3, 0.85], [0.38, 0.5], [0.46, 0.2], [0.62, 0.0], [0.6, -0.05], [0.0, -0.05]].map(([r, h]) => new THREE.Vector2(r, h)), 24),
      new THREE.MeshStandardMaterial({ color: 0x6b5330, metalness: 0.95, roughness: 0.35 }));
    bell.geometry.translate(0, -0.95, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0, y0 + 12.6, 54.2);
    pivot.add(bell);
    scene.add(pivot);
    out.bell = pivot;
    solid(-4.7, 4.7, 54.8, 63.6, 20);
    solid(-1.75, 1.75, 52.45, 55.95, 20);
    out.interactables.push({ id: 'bell', x: 0, z: 51.6, r: 2.3, label: 'Ring the bell to begin the night' });
  }

  {
    const cx = -10.6;
    const cz = 45;
    const parts = [];
    for (const dz of [-2.2, 2.2]) for (const dx of [-1.2, 1.2]) parts.push(box(0.16, 2.9, 0.16, cx + dx, y0 + 1.45, cz + dz));
    parts.push(box(2.6, 0.12, 4.8, cx, y0 + 2.95, cz));
    add(strip(parts), wood);
    add(box(1.1, 1.1, 4.4, cx + 0.95, y0 + 0.55, cz), planks);
    add(box(0.1, 2.6, 4.4, cx - 1.25, y0 + 1.3, cz), planks);
    add(box(0.5, 0.06, 4.2, cx - 0.95, y0 + 1.5, cz), wood);
    add(box(0.5, 0.06, 4.2, cx - 0.95, y0 + 2.1, cz), wood);
    const awn = canvasTex(256, 64, (x, w, h) => {
      for (let i = 0; i < w; i += 32) { x.fillStyle = (i / 32) % 2 ? '#1a1410' : '#b8560f'; x.fillRect(i, 0, 32, h); }
      x.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 1, h);
    });
    awn.tex.wrapS = THREE.RepeatWrapping;
    awn.tex.repeat.set(2.2, 1);
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.6, 8, 2), new THREE.MeshStandardMaterial({ map: awn.tex, roughness: 0.85, side: THREE.DoubleSide }));
    awning.position.set(cx + 1.75, y0 + 2.75, cz);
    awning.rotation.set(-Math.PI / 2 + 0.5, Math.PI / 2, 0, 'YXZ');
    awning.castShadow = true;
    scene.add(awning);
    const sign = canvasTex(512, 128, (x, w, h) => {
      x.fillStyle = '#2a1d14';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#6b4a2a';
      x.lineWidth = 8;
      x.strokeRect(6, 6, w - 12, h - 12);
      x.fillStyle = '#f0c27a';
      x.font = '58px "IM Fell English SC", Georgia, serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('Candy & Curses', w / 2, h / 2 + 4);
    });
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.8, emissive: new THREE.Color(0.25, 0.16, 0.08), emissiveMap: sign.tex }));
    signM.position.set(cx + 1.32, y0 + 3.45, cz);
    signM.rotation.y = Math.PI / 2;
    scene.add(signM);
    solid(cx - 1.4, cx + 1.55, cz - 2.45, cz + 2.45, 3.2);
    out.interactables.push({ id: 'shop', x: cx + 2.6, z: cz, r: 2.2, label: 'Shop' });
    out.candyBowls = [[cx + 0.95, y0 + 1.12, cz - 1.4], [cx + 0.95, y0 + 1.12, cz + 0.2], [cx - 0.95, y0 + 1.56, cz + 1.4], [cx - 0.95, y0 + 2.16, cz - 0.8]];
    const bowlGeo = new THREE.CylinderGeometry(0.28, 0.18, 0.14, 16, 1, true);
    for (const [bx, by, bz] of out.candyBowls) add(bowlGeo.clone().translate(bx, by + 0.07, bz), darkWood, false);
  }

  out.wardrobe = createWardrobe(scene, darkWood, planks);
  out.solids.push(out.wardrobe.solid);
  out.interactables.push(out.wardrobe.interact);

  {
    const bx = 5.2;
    const bz = 50.6;
    add(strip([box(0.16, 3.0, 0.16, bx - 1.5, y0 + 1.5, bz), box(0.16, 3.0, 0.16, bx + 1.5, y0 + 1.5, bz), box(3.6, 0.14, 0.5, bx, y0 + 3.05, bz - 0.05, 0.3)]), wood);
    out.boardCanvas = canvasTex(1024, 640, () => {});
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.82), new THREE.MeshStandardMaterial({ map: out.boardCanvas.tex, roughness: 0.85, emissive: new THREE.Color(0.32, 0.27, 0.22), emissiveMap: out.boardCanvas.tex }));
    board.position.set(bx, y0 + 1.75, bz - 0.09);
    board.rotation.y = Math.PI;
    scene.add(board);
    add(box(3.0, 1.95, 0.08, bx, y0 + 1.75, bz), darkWood);
    out.obstacles.push({ x: bx - 1.5, z: bz, r: 0.2 }, { x: bx + 1.5, z: bz, r: 0.2 }, { x: bx, z: bz, r: 0.6 });
  }

  {
    const parts = [];
    for (let z = 34; z < 62; z += 2) {
      parts.push(box(0.12, 1.15, 0.12, -14.9, y0 + 0.57, z));
      if (z < 60) for (const h of [0.45, 0.95]) parts.push(box(0.06, 0.12, 2.0, -14.9, y0 + h, z + 1));
    }
    parts.push(box(2.4, 0.12, 1.6, RANGE.shooter.x, y0 + 0.06, RANGE.shooter.z));
    add(strip(parts), wood);
    solid(-15.05, -14.75, 34, 61, 1.15);
    const sign = canvasTex(256, 96, (x, w, h) => {
      x.fillStyle = '#1e1712';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#e8d6b0';
      x.font = '54px "IM Fell English SC", Georgia, serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('Range', w / 2, h / 2 + 4);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: sign.tex, emissive: new THREE.Color(0.22, 0.2, 0.18), emissiveMap: sign.tex }));
    sm.position.set(-14.8, y0 + 1.6, 34.6);
    sm.rotation.y = Math.PI / 2;
    scene.add(sm);
    add(box(0.12, 1.4, 0.12, -14.85, y0 + 0.7, 34.6), wood);
  }

  {
    const parts = [];
    PARKOUR.forEach(([x, z, top], i) => {
      const h = top;
      parts.push(box(0.9, h - 0.12, 0.9, x, y0 + (h - 0.12) / 2, z, 0, i * 0.37, 0));
      parts.push(box(1.0, 0.12, 1.0, x, y0 + h - 0.06, z, 0, i * 0.37, 0));
      solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5, h);
    });
    add(strip(parts), stone);
    const wax = [];
    const flames = [];
    for (const i of [0, 3, 5, 8, 11, 13]) {
      const [x, z, top] = PARKOUR[i];
      for (let k = 0; k < 2; k++) {
        const cx = x + (k ? 0.3 : -0.28);
        const cz = z + (k ? -0.28 : 0.3);
        const ch = 0.12 + k * 0.08;
        wax.push(new THREE.CylinderGeometry(0.03, 0.03, ch, 8).translate(cx, y0 + top + ch / 2, cz));
        flames.push(new THREE.SphereGeometry(1, 6, 5).scale(0.012, 0.032, 0.012).translate(cx, y0 + top + ch + 0.03, cz));
      }
    }
    add(strip(wax), new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.55 }), false);
    const fm = new THREE.Mesh(strip(flames), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.6, 0.7) }));
    scene.add(fm);
    const [gx, gz, gt] = PARKOUR[PARKOUR.length - 1];
    const pg = new THREE.SphereGeometry(0.3, 24, 16);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pp, i);
      const a = Math.atan2(v.z, v.x);
      const k = 0.93 + 0.07 * Math.pow(Math.abs(Math.cos(a * 5)), 0.45);
      pp.setXYZ(i, v.x * k, v.y * 0.76, v.z * k);
    }
    pg.computeVertexNormals();
    const gold = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0xd9a63c, metalness: 1, roughness: 0.28, emissive: 0x6a4210, emissiveIntensity: 0.6 }));
    gold.position.set(gx, y0 + gt + 0.3, gz);
    gold.castShadow = true;
    scene.add(gold);
    out.goldPumpkin = gold;
  }

  {
    const fp = assets.models.fire_pit[0];
    const pit = new THREE.Mesh(fp.geometry, fp.material);
    pit.scale.setScalar(1.7);
    pit.position.set(0, y0 - 0.05, 40.5);
    pit.castShadow = pit.receiveShadow = true;
    scene.add(pit);
    out.obstacles.push({ x: 0, z: 40.5, r: 1.35 });
    const fl = new THREE.InstancedMesh(bonfire.flames.geometry, bonfire.flames.material, 7);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.35;
      m.makeScale(0.9 - r * 0.6, 1.5 - r * 1.2, 1).setPosition(Math.cos(a) * r, y0 + 0.05, 40.5 + Math.sin(a) * r);
      fl.setMatrixAt(i, m);
    }
    fl.frustumCulled = false;
    fl.renderOrder = 8;
    scene.add(fl);
    out.flames = fl;
    const light = new THREE.PointLight(0xff8a3a, 14, 26, 1.6);
    light.position.set(0, y0 + 1.4, 40.5);
    scene.add(light);
    out.lights.push(light);
    out.fireLight = light;
    const logs = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.07, 0.08, 1.0, 7);
      g.rotateZ(Math.PI / 2 - 0.5);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.18, y0 + 0.22, 40.5 + Math.sin(a) * 0.18);
      logs.push(g);
    }
    add(strip(logs), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, emissive: 0x401204, emissiveIntensity: 0.8 }), false);
    const benchParts = [];
    for (const [bx, bz, ry] of [[-3.2, 38.5, 0.9], [3.2, 38.6, -0.9], [-2.6, 43.6, 2.3], [2.8, 43.4, -2.3]]) {
      benchParts.push(box(1.8, 0.1, 0.42, bx, y0 + 0.45, bz, 0, ry, 0));
      for (const s of [-0.7, 0.7]) benchParts.push(box(0.1, 0.45, 0.38, bx + Math.cos(ry) * s, y0 + 0.22, bz - Math.sin(ry) * s, 0, ry, 0));
      out.obstacles.push({ x: bx, z: bz, r: 0.75 });
    }
    add(strip(benchParts), wood);
  }

  {
    const lan = assets.models.lantern[0];
    const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.0, 0.6) });
    for (const [x, z] of [[-8.4, 42.3], [-8.4, 47.7], [8.2, 42.6], [-2.2, 51.8], [2.2, 51.8], [-13.6, 31], [13.6, 31], [15.2, 33]]) {
      const l = new THREE.Mesh(lan.geometry, lan.material);
      l.scale.setScalar(1.3);
      l.position.set(x, y0 - 0.01, z);
      l.castShadow = true;
      scene.add(l);
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), glassMat);
      g.position.set(0, 0.11, 0);
      l.add(g);
    }
  }

  out.drawBoard = (profile) => {
    const c = out.boardCanvas.canvas;
    const x = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    x.fillStyle = '#1b1612';
    x.fillRect(0, 0, w, h);
    const grd = x.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
    grd.addColorStop(0, 'rgba(90,70,50,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = grd;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#5c4632';
    x.lineWidth = 10;
    x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = '#f1dcb2';
    x.textAlign = 'center';
    x.font = '72px "IM Fell English SC", Georgia, serif';
    x.fillText('Hall of Ashes', w / 2, 100);
    const s = profile.data.stats;
    if (out.online) {
      const fit = (t, max) => { let v = String(t); while (x.measureText(v).width > max && v.length > 2) v = v.slice(0, -2) + '…'; return v; };
      const col = (title, rows, x0, x1) => {
        x.textAlign = 'center';
        x.fillStyle = '#c9b48e';
        x.font = '34px "IM Fell English SC", Georgia, serif';
        x.fillText(title, (x0 + x1) / 2, 160);
        x.font = '28px "IM Fell English SC", Georgia, serif';
        rows.slice(0, 6).forEach(([a, b], i) => {
          const yy = 214 + i * 56;
          x.textAlign = 'left';
          x.fillStyle = '#f1dcb2';
          x.fillText(fit(a, x1 - x0 - 120), x0, yy);
          x.textAlign = 'right';
          x.fillStyle = '#ffd08a';
          x.fillText(b, x1, yy);
          x.fillStyle = 'rgba(241,220,178,0.12)';
          x.fillRect(x0, yy + 14, x1 - x0, 2);
        });
        if (!rows.length) { x.textAlign = 'center'; x.fillStyle = '#8a7a60'; x.fillText('No one yet', (x0 + x1) / 2, 214); }
      };
      col('Best nights', out.online.teams.map((t) => [t.n, `Round ${t.r}`]), 70, 492);
      col('Best keepers', out.online.players.map((p) => [p.n, `R${p.r} · ${p.s}`]), 532, 954);
      x.textAlign = 'center';
      x.fillStyle = '#8a7a60';
      x.font = '26px "IM Fell English SC", Georgia, serif';
      x.fillText(`Your best: ${s.bestRound ? 'round ' + s.bestRound : 'no nights yet'}${s.parkourBest ? ` · parkour ${s.parkourBest.toFixed(2)} s` : ''}`, w / 2, h - 44);
      out.boardCanvas.tex.needsUpdate = true;
      return;
    }
    const rows = [
      ['Best night', s.bestRound ? `Round ${s.bestRound}` : '-'],
      ['Most sticks in one night', s.mostSticks || '-'],
      ['Sticks burned, all time', s.totalSticks || '-'],
      ['Monsters cut down', s.totalKills || '-'],
      ['Nights played', s.games || '-'],
      ['Parkour record', s.parkourBest ? `${s.parkourBest.toFixed(2)} s` : '-'],
    ];
    x.font = '38px "IM Fell English SC", Georgia, serif';
    rows.forEach(([k, v], i) => {
      const yy = 180 + i * 62;
      x.textAlign = 'left';
      x.fillStyle = '#c9b48e';
      x.fillText(k, 90, yy);
      x.textAlign = 'right';
      x.fillStyle = '#ffd08a';
      x.fillText(String(v), w - 90, yy);
      x.fillStyle = 'rgba(241,220,178,0.12)';
      x.fillRect(90, yy + 16, w - 180, 2);
    });
    out.boardCanvas.tex.needsUpdate = true;
  };

  out.update = (dt, t, wardrobeOpen = false) => {
    out.wardrobe.update(dt, wardrobeOpen);
    if (out.goldPumpkin) out.goldPumpkin.rotation.y = t * 0.8;
    if (out.bell) {
      out.bellSwing = Math.max(0, (out.bellSwing || 0) - dt * 0.35);
      out.bell.rotation.x = Math.sin(t * 4.5) * out.bellSwing;
    }
    if (out.fireLight) out.fireLight.intensity = 14 * (0.85 + 0.1 * Math.sin(t * 8.1) + 0.06 * Math.sin(t * 19.3));
  };
  out.ringBell = () => { out.bellSwing = 0.45; };
  return out;
}
