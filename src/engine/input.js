export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.fire = false;
    this.aim = false;
    this.locked = false;
    this.enabled = false;
    this.sensitivity = 1;
    this.onLockChange = () => {};
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.aim = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { if (e.target === this.target) this.lock(); return; }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.aim = false; });
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) { this.fire = false; this.aim = false; }
      this.onLockChange(this.locked);
    });
  }

  lock() {
    const p = this.target.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => this.target.requestPointerLock());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  consume() {
    const d = { dx: this.mouseDX * this.sensitivity, dy: this.mouseDY * this.sensitivity };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() { this.pressed.clear(); }
}
