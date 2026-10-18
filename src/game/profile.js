const KEY = 'kindling.profile';

export const CATALOG = {
  upgrades: [
    { id: 'power', name: 'Power', desc: 'Burns through sticks faster.', max: 5, prices: [40, 90, 160, 250, 360] },
    { id: 'cooling', name: 'Cooling', desc: 'Overheats slower and recovers faster.', max: 5, prices: [30, 70, 130, 200, 290] },
    { id: 'focus', name: 'Focus', desc: 'Wider beam, easier to hit thin twigs.', max: 3, prices: [60, 140, 260] },
  ],
  weapons: [
    { id: 'torch', name: 'Torch', desc: 'One steady beam. Reliable.', price: 0 },
    { id: 'splitter', name: 'Splitter', desc: 'Three beams in a fan. Each one is weaker.', price: 320 },
    { id: 'arc', name: 'Arc', desc: 'The beam jumps to a second stick nearby.', price: 480 },
    { id: 'reaper', name: 'Reaper', desc: 'Short range, brutal heat. Thick beam.', price: 650 },
  ],
  beams: [
    { id: 'toxic', name: 'Toxic', color: [0.55, 1.0, 0.3], price: 0 },
    { id: 'ember', name: 'Ember', color: [1.0, 0.5, 0.12], price: 80 },
    { id: 'ghost', name: 'Ghost', color: [0.45, 0.82, 1.0], price: 100 },
    { id: 'hex', name: 'Hex', color: [0.72, 0.38, 1.0], price: 120 },
    { id: 'gold', name: 'Gold', color: [1.0, 0.82, 0.32], price: 200 },
  ],
  bodies: [
    { id: 'keeper', name: 'Grave Keeper', desc: 'Hood, gas mask, long coat.', price: 0 },
  ],
  costumes: [
    { id: 'none', name: 'Nothing', desc: 'Just your own head.', price: 0 },
    { id: 'witch', name: 'Witch Hat', desc: 'A tall crooked hat.', price: 120 },
    { id: 'pumpkin', name: 'Pumpkin Head', desc: 'A carved pumpkin with a candle inside.', price: 160 },
    { id: 'plague', name: 'Plague Doctor', desc: 'Beak mask and wide brim hat.', price: 220 },
    { id: 'bone', name: 'Skull', desc: 'A skull mask. Pale coat on the Grave Keeper.', price: 260 },
  ],
  abilities: [
    { id: 'double', name: 'Double Jump', desc: 'Jump again in mid-air. Space twice.', price: 220 },
    { id: 'slow', name: 'Slow Time', desc: 'Q: the monsters crawl for 5 seconds. 30 s cooldown.', price: 380, key: 'Q' },
    { id: 'spikes', name: 'Spike Trap', desc: 'F: iron spikes burst from the ground where you aim and cut their legs. Once per round.', price: 420, key: 'F' },
  ],
};

const DEFAULT = () => ({
  v: 1,
  candy: 0,
  upgrades: { power: 0, cooling: 0, focus: 0 },
  owned: { weapons: ['torch'], beams: ['toxic'], costumes: ['none'], bodies: ['keeper'], abilities: [] },
  equipped: { weapon: 'torch', beam: 'toxic', costume: 'none', body: 'keeper' },
  stats: { bestRound: 0, mostSticks: 0, totalSticks: 0, totalKills: 0, games: 0, parkourBest: 0 },
  history: [],
});

export class Profile {
  constructor() {
    this.data = DEFAULT();
    this.listeners = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = Object.assign(DEFAULT(), JSON.parse(raw));
      else {
        const oldCandy = JSON.parse(localStorage.getItem('kindling.candy') || '0');
        const oldBest = JSON.parse(localStorage.getItem('kindling.best') || '0');
        this.data.candy = +oldCandy || 0;
        this.data.stats.bestRound = +oldBest || 0;
      }
    } catch (e) { /* storage unavailable */ }
    for (const k of Object.keys(DEFAULT().owned)) if (!this.data.owned[k]) this.data.owned[k] = DEFAULT().owned[k];
    for (const k of Object.keys(DEFAULT().upgrades)) if (this.data.upgrades[k] === undefined) this.data.upgrades[k] = 0;
    const eq = this.data.equipped;
    if (!eq.body) eq.body = eq.costume === 'jurek' ? 'jurek' : 'keeper';
    if (eq.costume === 'keeper' || eq.costume === 'jurek') eq.costume = 'none';
    if (!this.data.owned.costumes.includes('none')) this.data.owned.costumes.push('none');
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    for (const f of this.listeners) f(this);
  }

  get candy() { return this.data.candy; }

  addCandy(n) {
    this.data.candy += n;
    this.save();
  }

  level(id) { return this.data.upgrades[id] || 0; }
  has(cat, id) { return this.data.owned[cat].includes(id); }
  equipped(slot) { return this.data.equipped[slot]; }

  priceOf(cat, id) {
    if (cat === 'upgrades') {
      const u = CATALOG.upgrades.find((x) => x.id === id);
      const l = this.level(id);
      return l >= u.max ? null : u.prices[l];
    }
    const item = CATALOG[cat].find((x) => x.id === id);
    return this.has(cat, id) ? null : item.price;
  }

  buy(cat, id) {
    const price = this.priceOf(cat, id);
    if (price === null || price > this.data.candy) return false;
    this.data.candy -= price;
    if (cat === 'upgrades') this.data.upgrades[id] = this.level(id) + 1;
    else this.data.owned[cat].push(id);
    if (cat === 'weapons') this.data.equipped.weapon = id;
    if (cat === 'beams') this.data.equipped.beam = id;
    if (cat === 'costumes') this.data.equipped.costume = id;
    this.save();
    return true;
  }

  equip(cat, id) {
    if (cat === 'bodies') { this.data.equipped.body = id; this.save(); return true; }
    if (!this.has(cat, id)) return false;
    const slot = { weapons: 'weapon', beams: 'beam', costumes: 'costume', bodies: 'body' }[cat];
    if (!slot) return false;
    this.data.equipped[slot] = id;
    this.save();
    return true;
  }

  beamColor() {
    const b = CATALOG.beams.find((x) => x.id === this.data.equipped.beam) || CATALOG.beams[0];
    return b.color;
  }

  recordGame(round, sticks, kills) {
    const s = this.data.stats;
    s.games++;
    s.bestRound = Math.max(s.bestRound, round);
    s.mostSticks = Math.max(s.mostSticks, sticks);
    s.totalSticks += sticks;
    s.totalKills += kills;
    this.data.history.unshift({ round, sticks, kills, t: Date.now() });
    this.data.history = this.data.history.slice(0, 8);
    this.save();
  }

  recordParkour(sec) {
    const s = this.data.stats;
    if (!s.parkourBest || sec < s.parkourBest) s.parkourBest = +sec.toFixed(2);
    this.save();
  }
}
