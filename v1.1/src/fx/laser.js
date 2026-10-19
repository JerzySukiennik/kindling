import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class LaserFX {
  constructor(scene, color = new THREE.Color(0.55, 1.0, 0.3), opts = {}) {
    this.scene = scene;
    this.color = color.clone();
    const N = 32;
    const t = [];
    const s = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      t.push(i / N, i / N);
      s.push(-1, 1);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = {
      uStart: { value: new THREE.Vector3() },
      uEnd: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uWidth: { value: 0.11 },
      uColor: { value: this.color.clone() },
      uPower: { value: 0 },
    };
    this.beam = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute float aT;
        attribute float aS;
        uniform vec3 uStart, uEnd;
        uniform float uTime, uWidth, uPower;
        varying float vS;
        varying float vT;
        varying float vLen;
        void main() {
          vec3 d = uEnd - uStart;
          float L = length(d);
          vec3 dir = d / max(L, 1e-4);
          vec3 P = uStart + d * aT;
          vec3 toCam = normalize(cameraPosition - P);
          vec3 side = cross(dir, toCam);
          side = length(side) > 1e-5 ? normalize(side) : vec3(0.0, 1.0, 0.0);
          float w = uWidth * (0.9 + 0.12 * sin(aT * L * 9.0 - uTime * 70.0)) * mix(0.55, 1.0, smoothstep(0.0, 0.08, aT * L));
          P += side * aS * w * uPower;
          P += side * sin(aT * L * 3.0 + uTime * 41.0) * 0.004 * aT;
          vS = aS;
          vT = aT;
          vLen = L;
          gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uTime, uPower;
        varying float vS;
        varying float vT;
        varying float vLen;
        void main() {
          float s = abs(vS);
          float core = exp(-s * s * 38.0);
          float glow = exp(-s * s * 4.0);
          float pulse = 0.85 + 0.15 * sin(vT * vLen * 2.0 - uTime * 30.0);
          vec3 c = vec3(1.0, 1.0, 0.92) * core * 9.0 + uColor * glow * 2.6 * pulse;
          float fadeEnd = smoothstep(1.0, 0.985, vT);
          gl_FragColor = vec4(c * uPower * fadeEnd, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 6;
    scene.add(this.beam);
    const tex = glowTexture();
    const mk = (c, sz) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(sz);
      sp.renderOrder = 7;
      scene.add(sp);
      return sp;
    };
    this.muzzle = mk(this.color.clone().multiplyScalar(4), 0.35);
    this.impact = mk(new THREE.Color(6, 3, 1), 0.5);
    this.light = opts.light === false ? null : new THREE.PointLight(0x9cff6a, 0, 7, 2);
    if (this.light) scene.add(this.light);

    this.power = 0;
  }

  setColor(rgb) {
    this.color.setRGB(rgb[0], rgb[1], rgb[2]);
    this.uniforms.uColor.value.copy(this.color);
    this.muzzle.material.color.copy(this.color).multiplyScalar(4);
  }

  update(dt, t, on, start, end, burning) {
    this.power += ((on ? 1 : 0) - this.power) * Math.min(1, dt * (on ? 30 : 14));
    const p = this.power;
    this.uniforms.uStart.value.copy(start);
    this.uniforms.uEnd.value.copy(end);
    this.uniforms.uTime.value = t;
    this.uniforms.uPower.value = p;
    this.beam.visible = p > 0.01;
    this.muzzle.position.copy(start);
    this.muzzle.material.opacity = p;
    this.muzzle.scale.setScalar(0.28 + Math.random() * 0.08);
    this.muzzle.visible = p > 0.01;
    this.impact.position.copy(end);
    this.impact.visible = p > 0.01;
    this.impact.material.color.setRGB(burning ? 7 : 3, burning ? 3.2 : 4.5, burning ? 0.9 : 1.8);
    this.impact.material.opacity = p;
    this.impact.scale.setScalar((burning ? 0.55 : 0.32) * (0.85 + Math.random() * 0.3));
    if (!this.light) return;
    this.light.position.copy(end).addScaledVector(this._dir(start, end), -0.25);
    if (burning) this.light.color.setRGB(1, 0.55, 0.2); else this.light.color.copy(this.color);
    this.light.intensity = p * (burning ? 9 : 4) * (0.85 + Math.random() * 0.3);

  }

  dispose() {
    for (const o of [this.beam, this.muzzle, this.impact, this.light]) if (o) this.scene.remove(o);
  }

  _dir(a, b) {
    return (this._d || (this._d = new THREE.Vector3())).subVectors(b, a).normalize();
  }
}
