import { createRequire } from 'module';
const require = createRequire('/Users/jurek/Downloads/Claude/Projects/SatisFarm/node_modules/');
const { chromium } = require('playwright-core');

const mode = process.argv[2] || 'menu';
const outDir = process.argv[3] || '/tmp';
const secs = +(process.argv[4] || 20);
const url = process.argv[5] || 'http://localhost:8613/';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.kindling || document.getElementById('load-text').textContent.startsWith('Failed'), null, { timeout: +(process.env.BOOT_MS || 120000), polling: 500 });
} catch (e) {
  console.log('BOOT TIMEOUT at', await page.evaluate(() => document.getElementById('load-text').textContent));
  console.log('LOGS:\n' + logs.slice(0, 40).join('\n'));
  await page.screenshot({ path: `${outDir}/boot_fail.png` });
  await browser.close();
  process.exit(1);
}
console.log('boot ms', Date.now() - t0);
const gl = await page.evaluate(() => {
  const r = window.kindling?.R.renderer;
  if (!r) return document.getElementById('load-text').textContent;
  const g = r.getContext();
  const ext = g.getExtension('WEBGL_debug_renderer_info');
  return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('gpu', gl);
const fps = async (sec) => page.evaluate((sec) => new Promise((res) => {
  let n = 0; const t0 = performance.now(); let worst = 0; let last = t0;
  const f = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++; if (t - t0 < sec * 1000) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1) }); };
  requestAnimationFrame(f);
}), sec);
const info = () => page.evaluate(() => {
  const k = window.kindling; const i = k.R.renderer.info;
  return { phase: k.game.phase, round: k.game.round, alive: k.monsters.aliveCount, chunks: k.debris.chunks.length, sticks: k.sticks.high - k.sticks.free.length, calls: i.render.calls, tris: i.render.triangles, candy: k.game.candy, playerAlive: k.player.alive, fire: +k.bonfire.shown.toFixed(2), preset: k.R.preset.name, cuts: k.game.stats.cuts, kills: k.game.stats.kills };
});
if (mode === 'menu') {
  await page.waitForTimeout(3000);
  console.log('fps', await fps(4));
  console.log(await info());
  await page.screenshot({ path: `${outDir}/menu.png` });
} else if (mode === 'play') {
  await page.evaluate(() => { const k = window.kindling; k.game.bot = true; k.startGame(); });
  for (let i = 0; i < secs / 5; i++) {
    await page.waitForTimeout(5000);
    const inf = await info();
    console.log(`t=${(i + 1) * 5}s`, JSON.stringify(inf));
    await page.screenshot({ path: `${outDir}/play_${String(i).padStart(2, '0')}.png` });
  }
  console.log('fps', await fps(4));
} else if (mode === 'profile') {
  await page.waitForTimeout(3000);
  const res = await page.evaluate(async () => {
    const k = window.kindling;
    const fpsM = (sec) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); }; requestAnimationFrame(f); });
    const byName = (n) => { const out = []; k.scene.traverse((o) => { if (o.name === n) out.push(o); }); return out; };
    const out = {};
    out.base = await fpsM(2.5);
    for (const n of ['grass', 'corn', 'pebbles', 'rocks', 'tree', 'grave', 'terrain', 'branches']) {
      const objs = byName(n); objs.forEach((o) => (o.visible = false));
      out['no_' + n] = await fpsM(2.5);
      objs.forEach((o) => (o.visible = true));
    }
    k.R.renderer.shadowMap.enabled = false; k.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    out.noShadows = await fpsM(2.5);
    k.R.renderer.shadowMap.enabled = true; k.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    k.R.bloom.enabled = false; out.noBloom = await fpsM(2.5); k.R.bloom.enabled = true;
    const hide = ['grass', 'corn', 'pebbles']; const objs = hide.flatMap(byName); objs.forEach((o) => (o.visible = false));
    out.noGrassCornPebbles = await fpsM(2.5);
    objs.forEach((o) => (o.visible = true));
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
} else if (mode === 'sim') {
  await page.evaluate(async () => { const k = window.kindling; k.game.bot = true; await k.startGame(); });
  const step = +(process.env.STEP || 6);
  for (let i = 0; i < secs / step; i++) {
    const inf = await page.evaluate((step) => { const k = window.kindling; k.sim(step); k.tick(1 / 60); k.tick(1 / 60); const i = k.R.renderer.info;
      return { t: +k.game.time.toFixed(1), phase: k.game.phase, round: k.game.round, alive: k.monsters.aliveCount, chunks: k.debris.chunks.length, sticks: k.sticks.high - k.sticks.free.length, candy: k.game.candy, playerAlive: k.player.alive, fire: +k.bonfire.shown.toFixed(2), cuts: k.game.stats.cuts, kills: k.game.stats.kills, burned: k.game.stats.sticks, barrier: k.barrier.state + '@' + k.barrier.z.toFixed(1), calls: i.render.calls, tris: i.render.triangles }; }, step);
    console.log(JSON.stringify(inf));
    await page.screenshot({ path: `${outDir}/sim_${String(i).padStart(2, '0')}.jpg`, quality: 80 });
  }
} else if (mode === 'views') {
  const views = JSON.parse(process.env.VIEWS);
  await page.evaluate(() => { window.kindling.sim(2); document.getElementById('menu').classList.add('hidden'); });
  for (const v of views) {
    await page.evaluate((v) => {
      const k = window.kindling;
      if (v.pre) (new Function('k', v.pre))(k);
      k.frozen = true;
      k.camera.position.set(...v.pos);
      k.camera.fov = v.fov || 55; k.camera.updateProjectionMatrix();
      k.camera.lookAt(...v.look);
      k.R.render(1);
    }, v);
    await page.screenshot({ path: `${outDir}/view_${v.name}.jpg`, quality: 85 });
  }
} else if (mode === 'eval') {
  const code = process.argv[6];
  console.log(await page.evaluate(code));
  await page.screenshot({ path: `${outDir}/eval.png` });
}
console.log('LOGS:\n' + logs.slice(0, 30).join('\n'));
await browser.close();
