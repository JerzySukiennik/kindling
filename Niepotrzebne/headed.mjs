import { createRequire } from 'module';
const require = createRequire('/Users/jurek/Downloads/Claude/Projects/SatisFarm/node_modules/');
const { chromium } = require('playwright-core');

const outDir = process.argv[2] || '/tmp';
const secs = +(process.argv[3] || 60);
const exe = process.env.EXE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: exe, headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on('console', (m) => logs.push(`[${(Date.now() / 1000).toFixed(1)}][${m.type()}] ${m.text()}`.slice(0, 300)));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('crash', () => logs.push('[PAGE CRASH]'));
await page.addInitScript(() => {
  window.__gl = { lost: 0, restored: 0, events: [] };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = orig.call(this, type, attrs);
    if (ctx && /webgl/.test(type) && !this.__hooked) {
      this.__hooked = true;
      this.addEventListener('webglcontextlost', (e) => { window.__gl.lost++; window.__gl.events.push(['lost', performance.now() | 0, e.statusMessage || '']); console.error('WEBGL CONTEXT LOST at', performance.now() | 0); });
      this.addEventListener('webglcontextrestored', () => { window.__gl.restored++; window.__gl.events.push(['restored', performance.now() | 0]); console.warn('WEBGL CONTEXT RESTORED'); });
    }
    return ctx;
  };
});
const t0 = Date.now();
await page.goto('http://localhost:8613/');
await page.waitForFunction(() => window.kindling || document.getElementById('load-text').textContent.startsWith('Failed'), null, { timeout: 180000, polling: 500 });
console.log('boot s', ((Date.now() - t0) / 1000).toFixed(1));
console.log('gpu', await page.evaluate(() => { const g = window.kindling.R.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }));
await page.evaluate(async () => { const k = window.kindling; k.game.bot = true; await k.startGame(); });
const fpsM = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); let worst = 0; let last = t0; const f = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++; if (t - t0 < 2000) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worst: Math.round(worst) }); }; requestAnimationFrame(f); }));
for (let i = 0; i < secs / 5; i++) {
  await page.waitForTimeout(3000);
  const f = await fpsM();
  const s = await page.evaluate(() => { const k = window.kindling; const g = k.R.renderer.getContext(); return { phase: k.game.phase, round: k.game.round, alive: k.monsters.aliveCount, lost: window.__gl.lost, isLost: g.isContextLost(), preset: k.R.preset.name, calls: k.R.renderer.info.render.calls }; });
  console.log(`t=${(i + 1) * 5}s`, JSON.stringify({ ...f, ...s }));
  await page.screenshot({ path: `${outDir}/headed_${String(i).padStart(2, '0')}.jpg`, quality: 70 });
}
console.log('GL', JSON.stringify(await page.evaluate(() => window.__gl)));
console.log('LOGS:\n' + logs.filter((l) => !/deprecated parameters/.test(l)).slice(-25).join('\n'));
await browser.close();
