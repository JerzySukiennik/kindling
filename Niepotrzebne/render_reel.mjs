import { createRequire } from 'module';
import fs from 'fs';
import { execFileSync } from 'child_process';
const require = createRequire('/Users/jurek/Downloads/Claude/Projects/SatisFarm/node_modules/');
const { chromium } = require('playwright-core');
const name = process.argv[2];
const root = '/Users/jurek/Downloads/Claude/Projects/Kindling';
const dir = `${root}/Niepotrzebne/reel_frames/${name}`;
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:8613/?reel=${name}`);
await page.waitForFunction(() => window.reelReady, null, { timeout: 180000, polling: 500 });
const info = await page.evaluate(() => window.reelInfo);
const t0 = Date.now();
for (let i = 0; i < info.frames; i++) {
  const url = await page.evaluate((i) => window.frame(i, 0.93), i);
  fs.writeFileSync(`${dir}/f_${String(i).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  if (i % 150 === 0) console.log(name, i, '/', info.frames, Math.round((Date.now() - t0) / 1000) + 's');
}
await browser.close();
const out = `${root}/Reels`;
const base = `Kindling_${name[0].toUpperCase()}${name.slice(1)}_reel`;
const fadeOut = info.dur - 2.6;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(info.fps), '-i', `${dir}/f_%04d.jpg`, '-ss', String(info.offset), '-t', String(info.dur), '-i', `${root}/${info.song}`,
  '-filter:a', `afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOut}:d=2.6`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${out}/${base}.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(info.fps), '-i', `${dir}/f_%04d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/${base}_silent.mp4`]);
console.log('done', name, Math.round((Date.now() - t0) / 1000) + 's');
