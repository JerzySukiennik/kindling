import * as THREE from 'three';
import { PIT, groundHeight } from '../world/layout.js';
import { U } from '../world/globals.js';
import { mulberry32 } from '../world/noise.js';

const MAX_FLAMES = 110;
const MAX_PILE = 240;

export class Bonfire {
  constructor(scene, sticks, particles) {
    this.sticks = sticks;
    this.fx = particles;
    this.burned = 0;
    this.level = 0.2;
    this.shown = 0.2;
    this.rand = mulberry32(55);
    const g = new THREE.PlaneGeometry(1, 1, 1, 6);
    g.translate(0, 0.5, 0);
    const seeds = new Float32Array(MAX_FLAMES);
    for (let i = 0; i < MAX_FLAMES; i++) seeds[i] = this.rand();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.uniforms = { uTime: U.time, uLevel: { value: 0.2 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vFog;
        void main() {
          vUv = uv;
          vSeed = aSeed;
          vec3 ip = instanceMatrix[3].xyz;
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 toCam = cameraPosition - ip;
          toCam.y = 0.0;
          toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float sway = sin(uTime * 2.3 + aSeed * 20.0) * 0.12 * position.y * position.y;
          vec3 p = ip + right * (position.x * sx + sway * sx) + vec3(0.0, position.y * sy, 0.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFog = exp(-pow(0.0125 * length(mv.xyz), 2.0));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vFog;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.07; a *= 0.5; } return s; }
        void main() {
          vec2 uv = vUv;
          float t = uTime * (1.1 + vSeed * 0.6);
          float n1 = fbm(vec2(uv.x * 2.6 + vSeed * 17.0, uv.y * 1.8 - t * 1.4));
          float n2 = fbm(vec2(uv.x * 5.5 - vSeed * 9.0, uv.y * 3.6 - t * 2.6));
          float x = (uv.x - 0.5) * 2.0 + (n1 - 0.5) * 1.1 * (0.25 + uv.y);
          float width = mix(0.85, 0.08, pow(uv.y, 0.75));
          float shape = 1.0 - smoothstep(width * 0.25, width, abs(x));
          float top = 1.0 - smoothstep(0.35, 0.95, uv.y + (n2 - 0.5) * 0.55);
          float f = shape * top * smoothstep(0.0, 0.1, uv.y) * (0.55 + 0.75 * n2);
          f = smoothstep(0.12, 0.9, f);
          f *= (1.0 - smoothstep(0.7, 1.0, abs(uv.x - 0.5) * 2.0)) * (1.0 - smoothstep(0.82, 1.0, uv.y));
          if (f < 0.004) discard;
          vec3 c = mix(vec3(0.3, 0.03, 0.005), vec3(1.0, 0.27, 0.035), smoothstep(0.05, 0.45, f));
          c = mix(c, vec3(1.3, 0.6, 0.14), smoothstep(0.6, 0.95, f) * (1.0 - uv.y * 0.7));
          gl_FragColor = vec4(c * f * vFog, f);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flames = new THREE.InstancedMesh(g, mat, MAX_FLAMES);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 8;
    scene.add(this.flames);
    this.flameSpots = [];
    for (let i = 0; i < MAX_FLAMES; i++) {
      const r = Math.pow(this.rand(), 0.8);
      const x = (this.rand() - 0.5) * 2 * (PIT.x1 - 2.5) * Math.min(1, r * 1.3);
      const z = (PIT.z0 + PIT.z1) / 2 + (this.rand() - 0.5) * (PIT.z1 - PIT.z0 - 2.4);
      this.flameSpots.push({ x, z, y: groundHeight(x, z), w: 0.6 + this.rand() * 0.7, h: 0.8 + this.rand() * 0.9, order: Math.abs(x) / PIT.x1 + this.rand() * 0.25 });
    }
    this.flameSpots.sort((a, b) => a.order - b.order);
    this.lights = [0].map((x) => {
      const l = new THREE.PointLight(0xff7a2a, 0, 52, 1.5);
      l.position.set(x, groundHeight(x, 17) + 1.6, 17);
      scene.add(l);
      return l;
    });
    this.spot = new THREE.SpotLight(0xff8a3a, 0, 70, 0.9, 0.6, 1.4);
    this.spot.position.set(0, 2.4, 17.6);
    this.spot.target.position.set(0, 0, -12);
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.normalBias = 0.04;
    this.spot.shadow.camera.near = 1;
    this.spot.shadow.camera.far = 40;
    this.spot.shadow.camera.layers.set(1);
    scene.add(this.spot, this.spot.target);
    this.pile = [];
    this.addPile(14);
    this.emberAcc = 0;
    this.smokeAcc = 0;
  }

  setShadows(on) {
    this.spot.castShadow = on;
  }

  addPile(n) {
    const sk = this.sticks;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let k = 0; k < n && this.pile.length < MAX_PILE; k++) {
      const idx = sk.alloc();
      if (idx < 0) return;
      const spread = Math.min(1, 0.25 + this.pile.length / 160);
      const x = (this.rand() - 0.5) * 2 * (PIT.x1 - 3) * spread;
      const z = (PIT.z0 + PIT.z1) / 2 + (this.rand() - 0.5) * (PIT.z1 - PIT.z0 - 3.2);
      const len = 0.6 + this.rand() * 1.4;
      const ang = this.rand() * Math.PI;
      const tilt = 0.15 + this.rand() * 0.6;
      const lift = Math.min(1.2, this.pile.length / 200) * this.rand();
      a.set(x - Math.cos(ang) * len / 2, groundHeight(x, z) + 0.05 + lift, z - Math.sin(ang) * len / 2);
      b.set(x + Math.cos(ang) * len / 2, a.y + Math.sin(tilt) * len, z + Math.sin(ang) * len / 2);
      const r = 0.03 + this.rand() * 0.06;
      sk.setShape(idx, r, len, 0.7, this.rand());
      sk.setEnds(idx, 2, 1, -1, -1);
      sk.setBurn(idx, 0.5, 0);
      sk.setFire(idx, 0.85 + this.rand() * 0.15);
      sk.placeAB(idx, a, b, this.rand() * 6);
      this.pile.push(idx);
    }
  }

  feed(sticks) {
    this.burned += sticks;
    this.level = Math.min(1.7, 0.2 + Math.log10(1 + this.burned / 120) * 0.75);
    this.addPile(Math.ceil(sticks * 0.35));
  }

  reset() {
    for (const i of this.pile) this.sticks.release(i);
    this.pile.length = 0;
    this.burned = 0;
    this.level = 0.2;
    this.addPile(14);
  }

  update(dt, t) {
    this.shown += (this.level - this.shown) * Math.min(1, dt * 0.6);
    const L = this.shown;
    U.fire.value = L;
    const count = Math.min(MAX_FLAMES, Math.floor(8 + L * 60));
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const s = this.flameSpots[i];
      const grow = 1 - i / count * 0.55;
      const h = s.h * (0.7 + L * 1.6) * grow * (0.85 + 0.15 * Math.sin(t * 3 + i));
      const w = s.w * (1.0 + L * 0.7);
      m.makeScale(w, h, 1).setPosition(s.x, s.y - 0.1, s.z);
      this.flames.setMatrixAt(i, m);
    }
    this.flames.count = count;
    this.flames.instanceMatrix.needsUpdate = true;
    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 17.1 + 1.3);
    for (const l of this.lights) l.intensity = (8 + L * 32) * flick;
    this.spot.intensity = (14 + L * 55) * flick;
    this.emberAcc += dt * (6 + L * 40);
    while (this.emberAcc > 1) {
      this.emberAcc -= 1;
      const s = this.flameSpots[Math.floor(Math.random() * count)];
      this.fx.embers(new THREE.Vector3(s.x, s.y + 0.4 + L * 0.8, s.z), 1, 1.2, 1.4 + L * 1.6);
    }
    this.smokeAcc += dt * (2 + L * 6);
    while (this.smokeAcc > 1) {
      this.smokeAcc -= 1;
      const s = this.flameSpots[Math.floor(Math.random() * count)];
      this.fx.smoke(new THREE.Vector3(s.x, s.y + 1.2 + L * 2.2, s.z), 1, 1.0, 0.85, 0.9 + L, 0.8 + L * 0.6);
    }
  }
}
