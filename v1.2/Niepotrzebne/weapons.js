(async () => {
  const k = window.kindling; const out = [];
  k.game.bot = true; await k.startGame(); k.sim(0.5);
  k.profile.data.candy = 9000;
  for (const [c, id] of [['weapons','splitter'],['weapons','arc'],['weapons','reaper'],['abilities','double'],['abilities','slow'],['abilities','spikes'],['beams','hex'],['costumes','plague']]) out.push(c + ':' + id + '=' + k.profile.buy(c, id));
  for (let i = 0; i < 5; i++) { k.profile.buy('upgrades','power'); k.profile.buy('upgrades','cooling'); }
  for (let i = 0; i < 3; i++) k.profile.buy('upgrades','focus');
  k.applyLook(); k.game.applyLoadout();
  k.game.startNight(); k.sim(1);
  k.game.introSync = null; k.game.timer = 0; k.sim(6);
  for (const w of ['splitter', 'arc', 'reaper', 'torch']) {
    k.profile.equip('weapons', w);
    const c0 = k.game.stats.cuts;
    k.sim(5);
    out.push(w + ' cuts+' + (k.game.stats.cuts - c0) + ' phase ' + k.game.phase);
  }
  k.input.pressed.add('KeyQ'); k.input.pressed.add('KeyF'); k.tick(1/60);
  out.push('slowT ' + k.game.slowT.toFixed(1) + ' spikes ' + !!k.game.spikes + ' double ' + k.player.canDouble);
  k.sim(4);
  out.push('after ' + k.game.phase + ' alive ' + k.player.alive + ' candy ' + k.profile.candy + ' costume ' + k.profile.equipped('costume'));
  k.tick(1/60);
  return out.join('\n');
})()
