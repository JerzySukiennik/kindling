import * as THREE from 'three';
import { Renderer, PRESETS } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { createTerrain } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createScatter } from './world/scatter.js';
import { createCornfield } from './world/cornfield.js';
import { createCemetery } from './world/cemetery.js';
import { createTrees } from './world/trees.js';
import { createProps } from './world/props.js';
import { TREES, groundHeight, PIT } from './world/layout.js';
import { U } from './world/globals.js';
import { Sticks } from './game/sticks.js';
import { Physics } from './game/physics.js';
import { Debris } from './game/debris.js';
import { MonsterManager } from './game/monster.js';
import { Barrier } from './game/barrier.js';
import { Bonfire } from './game/bonfire.js';
import { Player } from './game/player.js';
import { Game } from './game/game.js';
import { Particles } from './fx/particles.js';
import { LaserFX } from './fx/laser.js';
import { HUD } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'kindling.settings';
const settings = Object.assign({ quality: 'auto', music: 0.55, sfx: 0.85, sens: 1 }, (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
})());
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* blocked */ } };

function setLoad(p, text) {
  $('load-bar').style.width = Math.round(p * 100) + '%';
  if (text) $('load-text').textContent = text;
}

async function boot() {
  const R = new Renderer($('view'));
  R.renderer.domElement.addEventListener('webglcontextlost', () => {
    $('gl-lost').classList.remove('hidden');
    setTimeout(() => { if (R.renderer.getContext().isContextLost()) location.reload(); }, 3500);
  });
  R.renderer.domElement.addEventListener('webglcontextrestored', () => {
    $('gl-lost').classList.add('hidden');
    R.rebuild();
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 1000);
  camera.position.set(0, 2.2, 10);
  R.build(scene, camera);
  const assets = new Assets(R.renderer);
  assets.onProgress = (p) => setLoad(p * 0.75);
  const [, physics] = await Promise.all([assets.load(), Physics.create()]);
  setLoad(0.78, 'Digging graves');
  await new Promise((r) => setTimeout(r, 0));
  const sky = createSky(scene, R.renderer, assets);
  scene.add(createTerrain(assets));
  setLoad(0.83, 'Scattering stones');
  await new Promise((r) => setTimeout(r, 0));
  const scatter = createScatter(scene, assets);
  const corn = createCornfield(scene);
  setLoad(0.88, 'Carving names');
  const cem = await createCemetery(scene, assets);
  createTrees(scene, assets, TREES);
  const props = createProps(scene, assets);
  scene.traverse((o) => {
    if (o.material && o.material.transmission > 0) { o.material.transmission = 0; o.material.needsUpdate = true; }
  });
  for (const c of [...scatter.colliders, ...cem.colliders]) {
    if (Math.abs(c.x) < 24 && c.z > -64 && c.z < 24) physics.addStatic(c);
  }
  setLoad(0.92, 'Waking the sticks');
  const sticks = new Sticks(scene, assets);
  const debris = new Debris(physics, sticks);
  const monsters = new MonsterManager(scene, sticks, debris);
  const barrier = new Barrier(scene, assets, physics);
  const particles = new Particles(scene);
  const bonfire = new Bonfire(scene, sticks, particles);
  const player = new Player(scene, camera, scatter.obstacles);
  const laserFX = new LaserFX(scene);
  const hud = new HUD();
  const audio = new Audio();
  const input = new Input(R.renderer.domElement);
  input.sensitivity = settings.sens;
  const game = new Game({ scene, camera, renderer: R, sticks, debris, monsters, barrier, bonfire, player, laserFX, particles, audio, hud, physics, props });

  const applyPreset = (name) => {
    const real = name === 'auto' ? (applyPreset.auto || 'medium') : name;
    R.setPreset(real);
    const p = PRESETS[real];
    scatter.setDensity(p.density);
    corn.setDensity(p.density);
    sky.setShadowSize(p.shadow);
    bonfire.setShadows(p.fireShadow);
    particles.setScale(R.renderer.domElement.height, camera.fov);
  };
  applyPreset(settings.quality);
  window.addEventListener('resize', () => particles.setScale(R.renderer.domElement.height, camera.fov));
  audio.setVolumes(settings.music, settings.sfx);
  audio.setupMusic().then(() => { $('music-name').textContent = audio.musicName; audio.analyzeIntro(); });

  setLoad(0.96, 'Lighting the fire');
  await new Promise((r) => setTimeout(r, 0));
  let mode = 'menu';
  let paused = false;
  const menuMonsters = () => {
    monsters.clear();
    for (let i = 0; i < 4; i++) {
      const m = monsters.spawn(i === 2 ? 'brute' : i === 3 ? 'stilt' : 'walker', -12 + i * 8 + Math.random() * 3, -48 + Math.random() * 14, 100 + i * 31);
      m.heading = (Math.random() - 0.5) * 0.6;
    }
  };
  menuMonsters();
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const ghostProbe = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), player.char.ghostMat);
  ghostProbe.position.set(0, -50, 0);
  scene.add(ghostProbe);
  try { await R.renderer.compileAsync(scene, camera); } catch (e) { R.renderer.compile(scene, camera); }
  scene.remove(ghostProbe);
  for (const o of hidden) o.visible = false;
  R.render(0);

  const menuTick = (dt, t) => {
    const a = t * 0.045;
    camera.position.set(Math.sin(a) * 7, 2.3 + Math.sin(t * 0.13) * 0.4, 12 + Math.cos(a) * 2);
    camera.lookAt(Math.sin(a * 0.7) * 3, 1.4, -34);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    monsters.update(dt, game.time, []);
    for (const m of monsters.monsters) {
      m.speedNow = Math.min(m.speedNow, 0.55);
      if (m.pos.z > -14) { m.pos.z = -56; m.pos.x = (Math.random() - 0.5) * 30; m.initFeet(); }
    }
    player.char.root.visible = true;
    player.pos.set(1.5, groundHeight(1.5, 4), 4);
    player.yaw = 0.1;
    player.char.update(dt, player);
    game.time += dt;
    debris.update(dt, game.time);
    laserFX.update(dt, game.time, false, player.muzzle || camera.position, camera.position, false);
  };

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const refreshMenu = () => {
    $('menu-candy').textContent = game.bank;
    $('menu-best').textContent = game.best ? `Best: round ${game.best}` : '';
  };
  refreshMenu();

  const startGame = async () => {
    await audio.init();
    audio.resume();
    if (!audio.music) await audio.setupMusic();
    const introHit = await audio.analyzeIntro();
    await audio.playMusic();
    audio.restartMusic();
    show('menu', false);
    show('gameover', false);
    show('pause', false);
    hud.show(true);
    hud.ghost(false);
    R.final.uniforms.uGhost.value = 0;
    mode = 'play';
    paused = false;
    monsters.clear();
    game.newGame(introHit);
    input.enabled = true;
    input.lock();
    autoQ.reset();
  };

  input.onLockChange = (locked) => {
    hud.clickPrompt(!locked && mode === 'play' && !paused && !game.bot);
    if (!locked && mode === 'play' && game.phase !== 'gameover' && !game.bot) {
      paused = true;
      show('pause', true);
    }
  };

  game.events.gameover = () => {
    mode = 'over';
    input.enabled = false;
    input.unlock();
    hud.show(false);
    $('go-round').textContent = Math.max(0, game.round - 1);
    $('go-sticks').textContent = game.stats.sticks;
    $('go-candy').textContent = game.candy;
    show('gameover', true);
  };

  let settingsFrom = 'menu';
  const openSettings = (from) => {
    settingsFrom = from;
    $('set-quality').value = settings.quality;
    $('set-music').value = settings.music;
    $('set-sfx').value = settings.sfx;
    $('set-sens').value = settings.sens;
    $('music-name').textContent = audio.musicName;
    show(from, false);
    show('settings', true);
  };
  $('btn-play').onclick = startGame;
  $('btn-again').onclick = startGame;
  $('btn-settings').onclick = () => openSettings('menu');
  $('btn-pause-settings').onclick = () => openSettings('pause');
  $('btn-settings-back').onclick = () => { show('settings', false); show(settingsFrom, true); };
  $('btn-resume').onclick = () => { show('pause', false); paused = false; input.lock(); };
  const toMenu = () => {
    mode = 'menu';
    paused = false;
    input.enabled = false;
    input.unlock();
    hud.show(false);
    show('pause', false);
    show('gameover', false);
    show('menu', true);
    debris.clearAll();
    game.phase = 'menu';
    barrier.reset();
    props.restoreCandles();
    laserFX.update(0, 0, false, camera.position, camera.position, false);
    audio.updateLaser(false, false, 0);
    R.final.uniforms.uGhost.value = 0;
    player.setGhost(false);
    menuMonsters();
    refreshMenu();
  };
  $('btn-quit').onclick = toMenu;
  $('btn-go-menu').onclick = toMenu;
  $('set-quality').onchange = (e) => { settings.quality = e.target.value; saveSettings(); applyPreset(settings.quality); };
  $('set-music').oninput = (e) => { settings.music = +e.target.value; audio.setVolumes(settings.music, settings.sfx); saveSettings(); };
  $('set-sfx').oninput = (e) => { settings.sfx = +e.target.value; audio.setVolumes(settings.music, settings.sfx); saveSettings(); };
  $('set-sens').oninput = (e) => { settings.sens = +e.target.value; input.sensitivity = settings.sens; saveSettings(); };
  $('btn-music').onclick = () => $('music-file').click();
  $('music-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await audio.init();
    await audio.setUserTrack(f);
    $('music-name').textContent = audio.musicName;
  };
  $('btn-music-clear').onclick = async () => {
    await audio.setUserTrack(null);
    $('music-name').textContent = audio.musicName;
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { showDebug = !showDebug; hud.debug(''); }
  });

  const autoQ = {
    t: 0, frames: 0, done: false,
    reset() { this.t = 0; this.frames = 0; this.done = settings.quality !== 'auto'; },
    tick(dt) {
      if (this.done || mode !== 'play' || paused) return;
      this.t += dt;
      this.frames++;
      if (this.t > 2 && this.t < 9) return;
      if (this.t <= 2) { this.frames = 0; return; }
      const fps = this.frames / (this.t - 2);
      this.done = true;
      const order = ['ultra', 'high', 'medium', 'low'];
      let cur = order.indexOf(applyPreset.auto || 'medium');
      if (fps < 50 && cur < order.length - 1) cur++;
      if (fps < 34 && cur < order.length - 1) cur++;
      applyPreset.auto = order[cur];
      applyPreset('auto');
    },
  };
  autoQ.reset();

  let showDebug = false;
  let skipRender = false;
  let fpsAcc = 0;
  let fpsN = 0;
  let fpsShow = 0;
  const firePos = new THREE.Vector3(0, 0, (PIT.z0 + PIT.z1) / 2);
  const tick = (dt) => {
    if (window.kindling && window.kindling.frozen) return;
    if (paused) dt = 0;
    U.time.value += dt;
    const mouse = input.consume();
    if (dt > 0) physics.step(dt);
    if (mode === 'menu') menuTick(dt, U.time.value);
    else if (dt > 0 || mode === 'over') game.update(dt, input, mouse);
    sticks.flush(game.time);
    particles.update(dt, U.time.value);
    bonfire.update(dt, U.time.value);
    props.update(U.time.value);
    sky.update(U.time.value, U.fire.value, game.lightningLevel || 0);
    R.final.uniforms.uFlash.value = (game.lightningLevel || 0) * 0.22;
    hud.update(dt);
    if (audio.ready) {
      audio.setListener(camera);
      audio.updateAmbience(dt, bonfire.shown, camera.position.distanceTo(firePos));
    }
    if (camera.fov !== tick.lastFov) { tick.lastFov = camera.fov; particles.setScale(R.renderer.domElement.height, camera.fov); }
    R.shake.set(0, 0);
    if (!skipRender) R.render(U.time.value);
    input.endFrame();
    autoQ.tick(dt);
    if (showDebug) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.5) { fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
      const info = R.renderer.info;
      hud.debug(`fps ${fpsShow.toFixed(0)}  preset ${R.preset.name}\ncalls ${info.render.calls}  tris ${(info.render.triangles / 1e6).toFixed(2)}M\nmonsters ${monsters.aliveCount}  chunks ${debris.chunks.length}  sticks ${sticks.high - sticks.free.length}\nphase ${game.phase}  fire ${bonfire.shown.toFixed(2)}`);
    }
  };

  let last = performance.now();
  const frame = () => {
    requestAnimationFrame(frame);
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    tick(dt);
  };
  requestAnimationFrame(frame);

  window.kindling = {
    THREE, game, R, scene, camera, sticks, debris, monsters, barrier, bonfire, player, physics, audio, input, hud, settings,
    tick, startGame, toMenu, applyPreset,
    run(seconds, dt = 1 / 60) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) tick(dt); },
    sim(seconds, dt = 1 / 30) { skipRender = true; try { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) tick(dt); } finally { skipRender = false; } },
  };
  setLoad(1, 'Ready');
  show('loading', false);
  show('menu', true);
}

boot().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Failed to start: ' + e.message;
});
