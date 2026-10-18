import { CATALOG } from '../game/profile.js';

const TABS = {
  shop: [['upgrades', 'Upgrades'], ['weapons', 'Lasers'], ['abilities', 'Abilities'], ['beams', 'Beams'], ['costumes', 'Costumes']],
  wardrobe: [['costumes', 'Costumes'], ['beams', 'Beams']],
};

const candy = '<svg class="cc"><use href="#candy"/></svg>';

export class ShopUI {
  constructor(profile, onChange) {
    this.profile = profile;
    this.onChange = onChange;
    this.el = document.getElementById('shop');
    this.mode = 'shop';
    this.tab = 'upgrades';
    this.open = false;
    this.onClose = () => {};
    this.extraCostumes = [];
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'close') { this.close(); return; }
      if (act === 'tab') { this.tab = t.dataset.tab; this.render(); return; }
      const cat = t.dataset.cat;
      const id = t.dataset.id;
      if (act === 'buy') {
        if (this.profile.buy(cat, id)) { this.flash(t, true); this.onChange(cat, id, 'buy'); } else this.flash(t, false);
        this.render();
      }
      if (act === 'equip') {
        if (cat === 'costumes' && this.extraCostumes.find((c) => c.id === id)) {
          this.profile.data.equipped.costume = id;
          this.profile.save();
        } else this.profile.equip(cat, id);
        this.onChange(cat, id, 'equip');
        this.render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.close(); }
    });
  }

  flash(el, ok) {
    el.classList.remove('ok', 'no');
    void el.offsetWidth;
    el.classList.add(ok ? 'ok' : 'no');
  }

  show(mode) {
    this.mode = mode;
    this.tab = TABS[mode][0][0];
    this.open = true;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('wardrobe', mode === 'wardrobe');
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.onClose();
  }

  items(cat) {
    const list = [...CATALOG[cat]];
    if (cat === 'costumes') list.push(...this.extraCostumes);
    return list;
  }

  render() {
    const P = this.profile;
    const tabs = TABS[this.mode].map(([id, name]) => `<button class="tab ${id === this.tab ? 'on' : ''}" data-act="tab" data-tab="${id}">${name}</button>`).join('');
    const cat = this.tab;
    const cards = this.items(cat).map((it) => {
      let status = '';
      let btn = '';
      if (cat === 'upgrades') {
        const lvl = P.level(it.id);
        const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        status = `<div class="pips">${pips}</div>`;
        const price = P.priceOf('upgrades', it.id);
        btn = price === null ? '<span class="maxed">Max</span>' : `<button class="buy ${price > P.candy ? 'poor' : ''}" data-act="buy" data-cat="upgrades" data-id="${it.id}">${candy}${price}</button>`;
      } else {
        const owned = it.free || P.has(cat, it.id);
        const slot = { weapons: 'weapon', beams: 'beam', costumes: 'costume' }[cat];
        const on = slot && P.equipped(slot) === it.id;
        if (cat === 'abilities') btn = owned ? '<span class="maxed">Owned</span>' : `<button class="buy ${it.price > P.candy ? 'poor' : ''}" data-act="buy" data-cat="${cat}" data-id="${it.id}">${candy}${it.price}</button>`;
        else if (on) btn = '<span class="maxed">Equipped</span>';
        else if (owned) btn = `<button class="equip" data-act="equip" data-cat="${cat}" data-id="${it.id}">Equip</button>`;
        else btn = `<button class="buy ${it.price > P.candy ? 'poor' : ''}" data-act="buy" data-cat="${cat}" data-id="${it.id}">${candy}${it.price}</button>`;
        if (it.free) status = '<div class="tag free">Free</div>';
      }
      const swatch = it.color ? `<span class="swatch" style="background: rgb(${it.color.map((c) => Math.round(Math.min(1, c) * 255)).join(',')})"></span>` : '';
      return `<div class="card">${swatch}<div class="card-body"><div class="card-name">${it.name}</div><div class="card-desc">${it.desc || ''}</div>${status}</div><div class="card-act">${btn}</div></div>`;
    }).join('');
    const title = this.mode === 'wardrobe' ? 'Wardrobe' : 'Candy & Curses';
    this.el.innerHTML = `
      <div class="shop-box">
        <div class="shop-head"><div class="shop-title">${title}</div><div class="wallet">${candy}<b>${P.candy}</b></div><button class="x" data-act="close">Close</button></div>
        <div class="tabs">${tabs}</div>
        <div class="cards">${cards}</div>
        <div class="shop-foot">E or Esc to close</div>
      </div>`;
  }
}
