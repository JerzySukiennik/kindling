import * as THREE from 'three';

export const FOG_COLOR = new THREE.Color().setRGB(0.036, 0.043, 0.06, THREE.SRGBColorSpace);
export const MOON_DIR = new THREE.Vector3(-0.28, 0.36, -0.89).normalize();

const SkyShader = {
  uniforms: {
    uMoonDir: { value: MOON_DIR.clone() },
    uTime: { value: 0 },
    uHorizon: { value: new THREE.Color(0x121823) },
    uZenith: { value: new THREE.Color(0x03050a) },
    uFog: { value: FOG_COLOR.clone() },
    uGlow: { value: 0 },
    uLightning: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uMoonDir, uHorizon, uZenith, uFog;
    uniform float uTime, uGlow, uLightning;
    varying vec3 vDir;
    float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return s;
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
      float md = dot(d, uMoonDir);
      col += vec3(0.16, 0.2, 0.28) * pow(max(md, 0.0), 10.0) * 0.32;
      col += vec3(0.25, 0.3, 0.38) * pow(max(md, 0.0), 120.0) * 0.6;
      vec3 sd = floor(d * 420.0);
      float st = hash(sd);
      float star = step(0.9984, st) * smoothstep(0.05, 0.35, h) * (0.6 + 0.4 * sin(uTime * (2.0 + st * 7.0) + st * 50.0));
      col += vec3(0.8, 0.85, 1.0) * star * 0.45;
      float moonR = 0.9993;
      if (md > moonR - 0.0004) {
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 mx = normalize(cross(up, uMoonDir));
        vec3 my = cross(uMoonDir, mx);
        vec2 mp = vec2(dot(d, mx), dot(d, my)) / sqrt(1.0 - moonR * moonR);
        float r = length(mp);
        float disc = 1.0 - smoothstep(0.96, 1.0, r);
        float limb = sqrt(max(0.0, 1.0 - r * r));
        float maria = fbm(mp * 2.2 + 3.0);
        float crat = fbm(mp * 7.0);
        vec3 mc = vec3(1.0, 0.97, 0.9) * (0.62 + 0.38 * smoothstep(0.35, 0.65, maria)) * (0.85 + 0.15 * crat) * (0.55 + 0.45 * limb);
        col = mix(col, mc * 5.5, disc);
      }
      vec2 cp = d.xz / max(h + 0.12, 0.05) * 0.55;
      cp += vec2(uTime * 0.006, uTime * 0.0025);
      float c = fbm(cp * 1.4);
      float c2 = fbm(cp * 3.1 + 5.0);
      float cover = smoothstep(0.42, 0.78, c * 0.75 + c2 * 0.35);
      float lit = pow(max(md, 0.0), 6.0);
      vec3 cloudCol = mix(vec3(0.02, 0.024, 0.034), vec3(0.2, 0.23, 0.29), lit * 0.9) + vec3(0.6, 0.66, 0.78) * pow(max(md, 0.0), 60.0) * (1.0 - smoothstep(0.55, 0.9, c * 0.75 + c2 * 0.35)) * 1.2;
      cloudCol += vec3(0.5, 0.22, 0.06) * uGlow * smoothstep(0.3, -0.2, d.z) * (1.0 - h) * 0.25;
      cloudCol += vec3(0.55, 0.62, 0.8) * uLightning * (0.4 + 0.6 * fbm(cp * 2.0 + uTime));
      col = mix(col, cloudCol, cover * smoothstep(-0.02, 0.18, h) * 0.92);
      col += vec3(0.12, 0.14, 0.2) * uLightning * smoothstep(-0.05, 0.3, h);
      col = mix(col, uFog, 1.0 - smoothstep(-0.05, 0.16, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createSky(scene, renderer, assets) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
    vertexShader: SkyShader.vertexShader,
    fragmentShader: SkyShader.fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  mat.uniforms.uFog.value.copy(FOG_COLOR);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(assets.hdr).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.32;
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0165);
  scene.background = FOG_COLOR.clone();

  const hemi = new THREE.HemisphereLight(0x5a6c8c, 0x16120e, 0.42);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xaebfe0, 1.35);
  moon.position.copy(MOON_DIR).multiplyScalar(120).add(new THREE.Vector3(0, 0, -24));
  moon.target.position.set(0, 0, -24);
  moon.castShadow = true;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.mapSize.set(2048, 2048);
  scene.add(moon);
  scene.add(moon.target);
  fitShadow(moon, new THREE.Box3(new THREE.Vector3(-25, -2, -68), new THREE.Vector3(25, 7, 16)));

  return {
    dome, mat, moon, hemi,
    update(t, glow, lightning = 0) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uGlow.value = glow;
      mat.uniforms.uLightning.value = lightning;
      moon.intensity = 1.35 + lightning * 5;
      hemi.intensity = 0.42 + lightning * 1.6;
    },
    setShadowSize(s) {
      moon.shadow.mapSize.set(s, s);
      if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
    },
  };
}

function fitShadow(light, box) {
  const cam = light.shadow.camera;
  const m = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0));
  const inv = m.clone().invert();
  const pts = [];
  for (let i = 0; i < 8; i++) {
    pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  }
  const lb = new THREE.Box3();
  for (const p of pts) lb.expandByPoint(p.clone().sub(light.position).applyMatrix4(inv));
  cam.left = lb.min.x;
  cam.right = lb.max.x;
  cam.bottom = lb.min.y;
  cam.top = lb.max.y;
  cam.near = Math.max(0.5, -lb.max.z - 5);
  cam.far = -lb.min.z + 5;
  cam.updateProjectionMatrix();
}
