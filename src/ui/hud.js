const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), round: $('hud-round'), status: $('hud-status'), msg: $('hud-msg'), sub: $('hud-sub'),
      candy: $('candy-count'), candyBox: $('hud-candy'), heat: $('heat-arc'), cross: $('crosshair'),
      ghost: $('hud-ghost'), click: $('hud-click'), popups: $('popups'), debug: $('hud-debug'),
    };
    this.msgTimer = 0;
    this.lastCandy = -1;
    this.lastHeat = -1;
    this.lastStatus = '';
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setRound(n) { this.el.round.textContent = `Round ${n}`; }

  setStatus(s) {
    if (s === this.lastStatus) return;
    this.lastStatus = s;
    this.el.status.textContent = s;
  }

  message(text, sub = '', dur = 2.6) {
    this.el.msg.textContent = text;
    this.el.sub.textContent = sub;
    this.el.msg.classList.add('show');
    this.el.sub.classList.toggle('show', !!sub);
    this.msgTimer = dur;
  }

  setCandy(n) {
    if (n === this.lastCandy) return;
    const bump = this.lastCandy >= 0 && n > this.lastCandy;
    this.lastCandy = n;
    this.el.candy.textContent = n;
    if (bump) {
      this.el.candyBox.classList.remove('bump');
      void this.el.candyBox.offsetWidth;
      this.el.candyBox.classList.add('bump');
    }
  }

  setHeat(v, overheat) {
    const q = Math.round(v * 100);
    if (q === this.lastHeat && !overheat) return;
    this.lastHeat = q;
    this.el.heat.style.strokeDashoffset = String(138.2 * (1 - v));
    this.el.cross.classList.toggle('hot', v > 0.65 && !overheat);
    this.el.cross.classList.toggle('overheat', overheat);
  }

  crosshair(on) { this.el.cross.style.display = on ? '' : 'none'; }
  ghost(on) {
    this.el.ghost.classList.toggle('hidden', !on);
  }
  clickPrompt(on) { this.el.click.classList.toggle('hidden', !on); }

  popup(x, y, text, candy = false) {
    const d = document.createElement('div');
    d.className = 'popup';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.innerHTML = candy ? `<svg class="cc"><use href="#candy"/></svg>${text}` : text;
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 1150);
  }

  debug(text) {
    this.el.debug.classList.toggle('hidden', !text);
    if (text) this.el.debug.textContent = text;
  }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) {
        this.el.msg.classList.remove('show');
        this.el.sub.classList.remove('show');
      }
    }
  }
}
