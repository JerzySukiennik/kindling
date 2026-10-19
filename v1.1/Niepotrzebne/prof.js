(async () => {
  const k = window.kindling;
  const g = k.R.renderer.getContext();
  const run = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) k.tick(1 / 60); g.finish(); return (performance.now() - t0) / n; };
  const ms = () => { run(6); return +Math.min(run(12), run(12)).toFixed(1); };
  const byName = (n) => { const out = []; k.scene.traverse((o) => { if (o.name === n) out.push(o); }); return out; };
  const out = {};
  out.base = ms();
  for (const n of ['grass', 'corn', 'pebbles', 'rocks', 'tree', 'grave', 'terrain', 'branches']) {
    const objs = byName(n); objs.forEach((o) => (o.visible = false));
    out['no_' + n] = ms();
    objs.forEach((o) => (o.visible = true));
  }
  out.base2 = ms();
  k.R.bloom.enabled = false; out.noBloom = ms(); k.R.bloom.enabled = true;
  const moon = []; k.scene.traverse((o) => { if (o.isDirectionalLight) moon.push(o); });
  k.R.renderer.shadowMap.autoUpdate = false; out.shadowFrozen = ms(); k.R.renderer.shadowMap.autoUpdate = true;
  const p0 = k.R.preset; k.R.preset = { ...p0, pr: 0.5 }; k.R.resize(); out.halfRes = ms(); k.R.preset = p0; k.R.resize();
  out.base3 = ms();
  const t0 = performance.now(); for (let i = 0; i < 30; i++) k.tick(1 / 60); out.cpuOnlyNoFinish = +((performance.now() - t0) / 30).toFixed(1);
  return JSON.stringify(out);
})()
