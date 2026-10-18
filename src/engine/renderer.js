import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PRESETS = {
  low: { name: 'low', pr: 0.7, shadow: 1024, msaa: 0, bloom: true, density: 0.4, fireShadow: false },
  medium: { name: 'medium', pr: 0.85, shadow: 2048, msaa: 2, bloom: true, density: 0.6, fireShadow: false },
  high: { name: 'high', pr: 1.0, shadow: 2048, msaa: 2, bloom: true, density: 0.8, fireShadow: false },
  ultra: { name: 'ultra', pr: 1.25, shadow: 4096, msaa: 4, bloom: true, density: 1.0, fireShadow: true },
};

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float fixf(float x) {
      uint b = floatBitsToUint(x);
      if ((b & 0x7f800000u) == 0x7f800000u) return (b & 0x007fffffu) == 0u ? (x > 0.0 ? 48.0 : 0.0) : 0.0;
      return clamp(x, 0.0, 48.0);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(fixf(c.r), fixf(c.g), fixf(c.b), 1.0);
    }
  `,
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 0.9 },
    uGhost: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.022 },
    uCA: { value: 0.0025 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0.75, 0.85, 1.0) },
    uShake: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGhost, uVignette, uGrain, uCA, uFlash;
    uniform vec2 uRes, uShake;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv + uShake;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * (0.4 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      col *= uExposure;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.86, 0.98, 1.12), col, smoothstep(0.0, 0.35, lum));
      col += vec3(0.004, 0.006, 0.011) * (1.0 - smoothstep(0.0, 0.05, lum));
      col = aces(col * 1.05);
      col = mix(col, col * vec3(1.04, 1.0, 0.94), smoothstep(0.35, 0.9, lum));
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(g) * vec3(0.82, 0.95, 1.2), uGhost * 0.85);
      col *= 1.0 - uVignette * smoothstep(0.08, 0.62, r2 * 1.5);
      col += uFlashColor * uFlash * (0.6 + 0.4 * lum);
      col = toSRGB(col);
      float n = hash(floor(vUv * uRes) + fract(uTime * 7.13) * 91.7) - 0.5;
      col += n * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.preset = PRESETS.high;
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.shake = new THREE.Vector2();
    this.onPreset = [];
  }

  build(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.rebuild();
    window.addEventListener('resize', () => this.resize());
  }

  rebuild() {
    const p = this.preset;
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: p.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.sanitize = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitize);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.42, 0.92);
    this.bloom.enabled = p.bloom;
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.resize();
  }

  setPreset(name) {
    const p = PRESETS[name] || PRESETS.high;
    const changed = p !== this.preset;
    this.preset = p;
    if (changed && this.scene) {
      this.rebuild();
      for (const f of this.onPreset) f(p);
    }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.final.uniforms.uRes.value.set(w * pr, h * pr);
    }
  }

  render(time) {
    this.renderer.info.reset();
    const u = this.final.uniforms;
    u.uTime.value = time;
    u.uShake.value.copy(this.shake);
    this.composer.render();
  }
}
