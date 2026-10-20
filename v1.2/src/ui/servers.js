import { MAX_PLAYERS } from '../net/net.js';

const NICK_KEY = 'kindling.nick';
const A = ['Ashen', 'Grave', 'Hollow', 'Ember', 'Crooked', 'Lantern', 'Midnight', 'Rusty', 'Pale', 'Charred', 'Wicked', 'Candle'];
const B = ['Crow', 'Twig', 'Keeper', 'Moth', 'Raven', 'Pumpkin', 'Wisp', 'Bone', 'Owl', 'Spark', 'Cinder', 'Root'];
const $ = (id) => document.getElementById(id);

export function randomNick() {
  return `${A[Math.floor(Math.random() * A.length)]} ${B[Math.floor(Math.random() * B.length)]}`.slice(0, 14);
}

export class ServersUI {
  constructor({ getNet, look, onStart, onSolo, onBack }) {
    this.getNet = getNet;
    this.look = look;
    this.onStart = onStart;
    this.onSolo = onSolo;
    this.onBack = onBack;
    this.el = $('servers');
    this.list = $('sv-list');
    this.status = $('sv-status');
    this.busy = false;
    this.net = null;
    let nick = '';
    try { nick = localStorage.getItem(NICK_KEY) || ''; } catch (e) { /* blocked */ }
    $('sv-nick').value = nick || randomNick();
    $('sv-nick').addEventListener('change', () => this.saveNick());
    $('sv-dice').onclick = () => { $('sv-nick').value = randomNick(); this.saveNick(); };
    $('sv-quick').onclick = () => this.go(() => this.net.quick(this.me()), false);
    $('sv-create').onclick = () => { const pv = $('sv-private').checked; this.go(() => this.net.create(pv, this.me()), pv); };
    $('sv-join').onclick = () => this.joinCode();
    $('sv-code').addEventListener('keydown', (e) => { if (e.code === 'Enter') this.joinCode(); e.stopPropagation(); });
    $('sv-nick').addEventListener('keydown', (e) => e.stopPropagation());
    $('sv-solo').onclick = () => { this.close(); this.onSolo(); };
    $('sv-back').onclick = () => { this.close(); this.onBack(); };
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sid]');
      if (b) this.go(() => this.net.join(b.dataset.sid, this.me()), false);
    });
  }

  saveNick() {
    const v = this.nick();
    $('sv-nick').value = v;
    try { localStorage.setItem(NICK_KEY, v); } catch (e) { /* blocked */ }
  }

  nick() {
    const v = $('sv-nick').value.replace(/\s+/g, ' ').trim().slice(0, 14);
    return v || randomNick();
  }

  me() {
    this.saveNick();
    return { n: this.nick(), lk: this.look() };
  }

  setStatus(text, err = false) {
    this.status.textContent = text;
    this.status.classList.toggle('err', err);
  }

  enableOnline(on) {
    for (const id of ['sv-quick', 'sv-create', 'sv-join', 'sv-code']) $(id).disabled = !on;
  }

  async open() {
    this.el.classList.remove('hidden');
    this.list.innerHTML = '<div class="sv-empty">Looking for lit graveyards...</div>';
    this.setStatus('');
    this.enableOnline(false);
    try {
      this.net = await this.getNet();
      this.net.cb.index = (idx) => this.render(idx);
      this.net.watchIndex(true);
      this.enableOnline(true);
    } catch (e) {
      this.list.innerHTML = '<div class="sv-empty">Online play is unavailable right now.</div>';
      this.setStatus('You can still play solo.', true);
    }
  }

  close() {
    this.el.classList.add('hidden');
    if (this.net) this.net.watchIndex(false);
  }

  joinCode() {
    const code = $('sv-code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { this.setStatus('A server code has 4 letters.', true); return; }
    this.go(() => this.net.join(code, this.me()), false);
  }

  async go(fn, priv) {
    if (this.busy || !this.net) return;
    this.busy = true;
    this.enableOnline(false);
    this.setStatus('Walking up the hill...');
    try {
      const sid = await fn();
      this.close();
      this.setStatus('');
      this.onStart(sid, priv || (this.net.index.get(sid) || {}).pv || false);
    } catch (e) {
      this.setStatus(e && e.message ? e.message : 'Could not join.', true);
      this.enableOnline(true);
    } finally {
      this.busy = false;
    }
  }

  render(idx) {
    const now = this.net.now();
    const rows = [...idx.entries()].filter(([, v]) => !v.pv && v.c > 0 && v.u > now - 25000);
    rows.sort((a, b) => (b[1].p === 'hill') - (a[1].p === 'hill') || b[1].c - a[1].c);
    if (!rows.length) {
      this.list.innerHTML = '<div class="sv-empty">No open graveyards. Start one with New server.</div>';
      return;
    }
    this.list.innerHTML = rows.map(([sid, v]) => {
      const full = v.c >= MAX_PLAYERS;
      const st = v.p === 'hill' ? 'On the hill' : v.p === 'over' ? 'Fire went out' : `Night ${v.r}`;
      return `<div class="sv-item ${full ? 'full' : ''}"><b>${sid}</b><span>${esc(v.n)}</span><span class="nk">${esc(v.nk || '')}</span><span class="st ${v.p === 'night' ? 'night' : ''}">${st}</span>${full ? '<span class="st">Full</span>' : `<button class="btn small" data-sid="${sid}">Join ${v.c}/${MAX_PLAYERS}</button>`}</div>`;
    }).join('');
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
