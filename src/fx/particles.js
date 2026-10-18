import * as THREE from 'three';

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) {
    for (let i = 0; i < 128; i++) {
      const dx = (i - 64) / 64;
      const dy = (j - 64) / 64;
      const r = Math.sqrt(dx * dx + dy * dy);
      let n = 0;
      let a = 0.5;
      let f = 3;
      for (let o = 0; o < 4; o++) {
        n += a * (Math.sin(i * f * 0.05 + Math.cos(j * f * 0.043) * 2.3) * 0.5 + 0.5);
        a *= 0.5;
        f *= 2.1;
      }
      const v = Math.max(0, 1 - r) ** 1.6 * (0.55 + 0.45 * n);
      const o = (j * 128 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.min(255, v * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class PointPool {
  constructor(scene, n, additive, tex) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.base = new Float32Array(n * 4);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('psize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uScale: { value: 600 }, tMap: { value: tex } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec4 pcolor;
        attribute float psize;
        uniform float uScale;
        varying vec4 vC;
        varying float vFog;
        void main() {
          vC = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vFog = exp(-pow(0.0125 * length(mv.xyz), 2.0));
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tMap;
        varying vec4 vC;
        varying float vFog;
        void main() {
          vec2 uv = gl_PointCoord;
          ${tex ? 'float a = texture2D(tMap, uv).a;' : 'float d = length(uv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a;'}
          gl_FragColor = vec4(vC.rgb * ${additive ? 'vFog' : '1.0'}, vC.a * a * ${additive ? '1.0' : 'vFog'});
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  emit(p, v, color, alpha, size, life, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 4] = color.r; this.base[i * 4 + 1] = color.g; this.base[i * 4 + 2] = color.b; this.base[i * 4 + 3] = alpha;
    this.size0[i] = size;
    this.life[i] = life;
    this.max[i] = life;
    this.grow[i] = opts.grow ?? 0;
    this.drag[i] = opts.drag ?? 0.5;
    this.grav[i] = opts.grav ?? 0;
    this.kind[i] = opts.flicker ? 1 : 0;
  }

  update(dt, t) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      let fade = k < 0.3 ? k / 0.3 : 1;
      const age = 1 - k;
      if (age < 0.08) fade *= age / 0.08;
      if (this.kind[i] === 1) fade *= 0.6 + 0.4 * Math.sin(t * 20 + i * 1.7);
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * fade;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * age);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    this.add = new PointPool(scene, 2600, true, null);
    this.alpha = new PointPool(scene, 1200, false, blobTexture());
  }

  setScale(h, fov) {
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    this.add.uniforms.uScale.value = s;
    this.alpha.uniforms.uScale.value = s;
  }

  sparks(pos, dir, n = 6, color = null, speed = 4) {
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      if (dir) _v.addScaledVector(dir, speed * 0.6);
      _c.setRGB(8, 3.2 + Math.random() * 2, 0.6);
      if (color) _c.copy(color);
      this.add.emit(pos, _v, _c, 1, 0.025 + Math.random() * 0.02, 0.25 + Math.random() * 0.45, { grav: 9, drag: 1.2 });
    }
  }

  embers(pos, n = 1, spread = 0.2, rise = 1.2) {
    for (let i = 0; i < n; i++) {
      _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * spread * 0.5, pos.z + (Math.random() - 0.5) * spread);
      _v.set((Math.random() - 0.5) * 0.6, rise * (0.5 + Math.random()), (Math.random() - 0.5) * 0.6);
      _c.setRGB(6, 1.8 + Math.random() * 1.4, 0.25);
      this.add.emit(_p, _v, _c, 1, 0.018 + Math.random() * 0.025, 1.2 + Math.random() * 2.2, { grav: -0.3, drag: 0.6, flicker: true });
    }
  }

  smoke(pos, n = 1, spread = 0.1, dark = 0.5, size = 0.35, rise = 0.6) {
    for (let i = 0; i < n; i++) {
      _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y, pos.z + (Math.random() - 0.5) * spread);
      _v.set((Math.random() - 0.5) * 0.3, rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.3);
      const g = 0.06 + (1 - dark) * 0.12;
      _c.setRGB(g, g * 0.97, g * 0.95);
      this.alpha.emit(_p, _v, _c, 0.45, size * (0.7 + Math.random() * 0.6), 1.6 + Math.random() * 2, { grow: 2.2, drag: 0.4, grav: -0.15 });
    }
  }

  dust(pos, n = 4, spread = 0.6, size = 0.6) {
    for (let i = 0; i < n; i++) {
      _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * spread);
      _v.set((Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2);
      _c.setRGB(0.16, 0.14, 0.12);
      this.alpha.emit(_p, _v, _c, 0.5, size * (0.6 + Math.random() * 0.8), 1.2 + Math.random(), { grow: 1.8, drag: 1.4, grav: 0.2 });
    }
  }

  update(dt, t) {
    this.add.update(dt, t);
    this.alpha.update(dt, t);
  }
}
