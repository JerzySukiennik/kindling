import { createRequire } from 'module';
const require = createRequire('/Users/jurek/Downloads/Claude/Projects/SatisFarm/node_modules/');
const { chromium } = require('playwright-core');

const N = +(process.env.CLIENTS || 2);
const SHOTS = process.env.SHOTS || '';
const url = 'http://localhost:8613/?realm=test';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const clients = [];
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 640), height: +(process.env.H || 400) } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  clients.push({ ctx, page, logs, name: ['Alfa', 'Bravo', 'Charlie', 'Delta'][i] });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (c, fn, arg) => c.page.evaluate(fn, arg);
const info = (c) => ev(c, () => {
  const k = window.kindling;
  const mp = k.game.mp;
  return {
    phase: k.game.phase, round: k.game.round, host: mp ? mp.isHost : null, code: mp ? mp.code : null,
    remotes: mp ? [...mp.remotes.values()].map((r) => `${r.nick}:${r.seen ? (r.ghost ? 'ghost' : 'ok') : 'unseen'}`).join(' ') : '',
    alive: k.game.player.alive, mons: k.monsters.aliveCount, puppets: mp ? [...mp.byNid.values()].filter((m) => m.alive).length : 0,
    barrier: k.barrier.state + '@' + k.barrier.z.toFixed(1), me: k.player.pos.toArray().map((v) => +v.toFixed(1)).join('/'),
    rpos: mp ? [...mp.remotes.values()].map((r) => r.pos.toArray().map((v) => +v.toFixed(1)).join('/') + (r.char.root.visible ? 'V' : 'H')).join(' ') : '', candy: k.profile.candy, kills: k.game.stats.kills, cuts: k.game.stats.cuts,
  };
});

for (const c of clients) {
  await c.page.goto(url);
  await c.page.waitForFunction(() => window.kindling, null, { timeout: 180000, polling: 500 });
  await ev(c, () => { window.kindling.applyPreset('low'); window.kindling.profile.save = () => {}; });
}
console.log('booted', N);

const A = clients[0];
await A.page.click('#btn-play');
await A.page.waitForFunction(() => !document.getElementById('sv-quick').disabled, null, { timeout: 30000 });
await A.page.fill('#sv-nick', A.name);
await A.page.click('#sv-create');
await A.page.waitForFunction(() => window.kindling.game.mp && window.kindling.game.phase === 'lobby', null, { timeout: 30000 });
const code = await ev(A, () => window.kindling.game.mp.code);
console.log('server', code);

const LATE = +(process.env.LATE || 0);
const joinNow = LATE ? clients.slice(1, -1) : clients.slice(1);
const late = LATE ? clients[clients.length - 1] : null;
async function join(c) {
  await c.page.click('#btn-play');
  await c.page.waitForFunction(() => !document.getElementById('sv-quick').disabled, null, { timeout: 30000 });
  await c.page.fill('#sv-nick', c.name);
  await wait(1500);
  const listed = await c.page.evaluate(() => document.getElementById('sv-list').textContent);
  if (SHOTS) await c.page.screenshot({ path: `${SHOTS}/mp_list_${c.name}.png` });
  console.log(c.name, 'list:', listed.slice(0, 120));
  if (process.env.QUICK) await c.page.click('#sv-quick');
  else { await c.page.fill('#sv-code', code); await c.page.click('#sv-join'); }
  await c.page.waitForFunction(() => window.kindling.game.mp && window.kindling.game.mp.code, null, { timeout: 30000 });
}
for (const c of joinNow) await join(c);
await wait(2500);
for (const c of clients) console.log(c.name, JSON.stringify(await info(c)));
if (SHOTS) for (const c of clients) await c.page.screenshot({ path: `${SHOTS}/mp_lobby_${c.name}.png` });

if (process.env.ONLYLOBBY) { await browser.close(); process.exit(0); }
for (const c of [A, ...joinNow]) await ev(c, () => { const k = window.kindling; k.game.bot = true; k.game.bellRung = true; k.game.mp.setReady(true); });
await c_wait_phase('intermission', 20000, LATE ? clients.slice(0, -1) : clients);
if (late) { await wait(12000); await join(late).catch(async () => { await wait(1500); }); console.log('late joined'); await ev(late, () => { window.kindling.game.bot = true; }); }
console.log('night started');
for (let t = 0; t < 14; t++) {
  await wait(5000);
  const rows = [];
  for (const c of clients) rows.push(`${c.name} ${JSON.stringify(await info(c))}`);
  console.log(`t=${(t + 1) * 5}s\n  ` + rows.join('\n  '));
  if (SHOTS && (t === 4 || t === 5)) for (const c of clients) await c.page.screenshot({ path: `${SHOTS}/mp_night${t}_${c.name}.png` });
  const r = await ev(A, () => window.kindling.game.round);
  if (r >= 3) break;
}

if (process.env.MIGRATE) {
  console.log('--- host leaves');
  await A.ctx.close();
  clients.shift();
  for (let t = 0; t < 4; t++) {
    await wait(4000);
    for (const c of clients) console.log(`  ${c.name} ${JSON.stringify(await info(c))}`);
  }
}

console.log('--- everyone dies');
for (const c of clients) await ev(c, () => { const k = window.kindling; k.game.killPlayer(k.player, 'test'); });
await wait(4000);
for (const c of clients) console.log(c.name, JSON.stringify(await info(c)));
await wait(8000);
for (const c of clients) console.log(c.name, 'after', JSON.stringify(await info(c)));
if (SHOTS) {
  await wait(1500);
  await ev(A, () => { const k = window.kindling; k.reelHook = () => { k.camera.position.set(5.2, 4.5, 47.4); k.camera.lookAt(5.2, 4.35, 50.6); }; });
  await wait(1200);
  await A.page.screenshot({ path: `${SHOTS}/mp_board.png` });
  await ev(A, () => { window.kindling.reelHook = null; });
}
if (process.env.AGAIN) {
  for (const c of clients) await ev(c, () => { const k = window.kindling; k.game.bellRung = true; k.game.mp.setReady(true); });
  await c_wait_phase('intermission', 20000);
  for (const c of clients) console.log(c.name, 'night2', JSON.stringify(await info(c)));
}
for (const c of clients) if (c.logs.length) console.log(c.name, 'LOGS\n  ' + c.logs.slice(0, 12).join('\n  '));
const code2 = await ev(clients[0], () => window.kindling.game.mp && window.kindling.game.mp.code);
for (const c of clients) await ev(c, () => window.kindling.toMenu()).catch(() => {});
await wait(2500);
console.log('after leave', JSON.stringify(await ev(clients[0], async (sid) => {
  const n = window.kindling.netRef ? window.kindling.netRef() : null;
  if (!n) return 'no net';
  const F = n.fb;
  const a = await F.get(F.ref(n.db, `kindlingTest/servers/${sid}`));
  const b = await F.get(F.ref(n.db, `kindlingTest/index/${sid}`));
  return { server: a.exists(), index: b.exists() };
}, code2)));
await browser.close();

async function c_wait_phase(ph, ms, list = clients) {
  for (const c of list) await c.page.waitForFunction((ph) => window.kindling.game.phase === ph, ph, { timeout: ms, polling: 200 });
}
