const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), round: $('hud-round'), status: $('hud-status'), msg: $('hud-msg'), sub: $('hud-sub'),
      candy: $('candy-count'), candyBox: $('hud-candy'), heat: $('heat-arc'), cross: $('crosshair'),
      ghost: $('hud-ghost'), click: $('hud-click'), popups: $('popups'), debug: $('hud-debug'),
      prompt: $('hud-prompt'), timer: $('hud-timer'), abilities: $('hud-abilities'),
    };
    this.msgTimer = 0;
    this.lastCandy = -1;
    this.lastHeat = -1;
    this.lastStatus = '';
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setRound(text) { this.el.round.textContent = text; }

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

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.querySelector('span').textContent = text;
  }

  timer(text) {
    if (text === this.lastTimer) return;
    this.lastTimer = text;
    this.el.timer.classList.toggle('hidden', !text);
    if (text) this.el.timer.textContent = text;
  }

  abilities(list) {
    const key = list.map((a) => a.key + a.state + Math.round(a.cd * 20)).join('|');
    if (key === this.lastAb) return;
    this.lastAb = key;
    this.el.abilities.innerHTML = list.map((a) => `<div class="ab ${a.state}"><kbd>${a.key}</kbd><b>${a.name}</b><div class="cd" style="height:${Math.round(a.cd * 100)}%"></div></div>`).join('');
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
