import * as THREE from 'three';

const RINGS = [0, 0.012, 0.035, 0.08, 0.16, 0.3, 0.5, 0.7, 0.84, 0.92, 0.965, 0.988, 1];
const RADIAL = 7;

function stickGeometry() {
  const pos = [];
  const nrm = [];
  const uv = [];
  const part = [];
  const idx = [];
  for (let i = 0; i < RINGS.length; i++) {
    const y = RINGS[i];
    for (let k = 0; k <= RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2;
      pos.push(Math.cos(a), y, Math.sin(a));
      nrm.push(Math.cos(a), 0, Math.sin(a));
      uv.push(k / RADIAL, y);
      part.push(0);
    }
  }
  for (let i = 0; i < RINGS.length - 1; i++) {
    for (let k = 0; k < RADIAL; k++) {
      const a = i * (RADIAL + 1) + k;
      const b = a + RADIAL + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  for (const cap of [-1, 1]) {
    const y = cap < 0 ? 0 : 1;
    const c = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, cap, 0);
    uv.push(0.5, 0.5);
    part.push(cap * 2);
    for (let k = 0; k <= RADIAL; k++) {
      const a = (k / RADIAL) * Math.PI * 2;
      pos.push(Math.cos(a), y, Math.sin(a));
      nrm.push(0, cap, 0);
      uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      part.push(cap);
    }
    for (let k = 0; k < RADIAL; k++) {
      if (cap < 0) idx.push(c, c + 1 + k, c + 2 + k);
      else idx.push(c, c + 2 + k, c + 1 + k);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

const VERT_DECL = /* glsl */`
  attribute float aPart;
  attribute vec4 aDim;
  attribute vec4 aEnds;
  attribute vec4 aBurn;
  uniform float uNow;
  varying vec3 vSt;
  varying vec4 vEndsV;
  varying vec4 vBurnV;
  varying vec4 vDimV;
  float stickRadius(float y, out float slope) {
    float L = aDim.y;
    float r0 = aDim.x;
    float r = r0 * mix(1.0, aDim.z, y);
    slope = (aDim.z - 1.0) * r0 / L;
    float dA = y * L;
    float dB = (1.0 - y) * L;
    float tipA = min(0.35 * L, 5.0 * r0);
    float tipB = min(0.35 * L, 5.0 * r0);
    if (aEnds.x > 0.5 && aEnds.x < 1.5) { float k = clamp(dA / tipA, 0.0, 1.0); r *= mix(0.12, 1.0, sqrt(k)); }
    if (aEnds.y > 0.5 && aEnds.y < 1.5) { float k = clamp(dB / tipB, 0.0, 1.0); r *= mix(0.12, 1.0, sqrt(k)); }
    if (aEnds.x < 0.5) { float k = clamp(dA / (r0 * 0.8), 0.0, 1.0); r *= mix(0.55, 1.0, sqrt(k)); }
    if (aEnds.y < 0.5) { float k = clamp(dB / (r0 * 0.8), 0.0, 1.0); r *= mix(0.55, 1.0, sqrt(k)); }
    return r;
  }
  vec3 stickOffset(float y) {
    float L = aDim.y;
    float a = aDim.w * 6.2831;
    vec2 bd = vec2(cos(a), sin(a));
    float bend = sin(3.14159 * y) * L * 0.035 * (0.4 + fract(aDim.w * 7.31));
    float wob = sin(y * L * 4.0 + aDim.w * 40.0) * aDim.x * 0.35;
    return vec3(bd.x * (bend + wob), 0.0, bd.y * (bend + wob));
  }
`;

const VERT_BODY = /* glsl */`
  float yy = position.y;
  float slope;
  float rr = stickRadius(yy, slope);
  float ends = (aPart < -0.5) ? aEnds.x : ((aPart > 0.5) ? aEnds.y : -1.0);
  float capK = abs(aPart) > 1.5 ? 0.0 : 1.0;
  vec3 off = stickOffset(yy);
  transformed = vec3(position.x * rr * capK, yy * aDim.y, position.z * rr * capK) + off;
  vSt = vec3(uv, aPart);
  vEndsV = aEnds;
  vBurnV = aBurn;
  vDimV = aDim;
`;

const NORMAL_BODY = /* glsl */`
  {
    float sl;
    float r1 = stickRadius(clamp(position.y + 0.01, 0.0, 1.0), sl);
    float r0b = stickRadius(clamp(position.y - 0.01, 0.0, 1.0), sl);
    float dr = (r1 - r0b) / (0.02 * aDim.y);
    if (abs(aPart) < 0.5) objectNormal = normalize(vec3(normal.x, -dr, normal.z));
  }
`;

export class Sticks {
  constructor(scene, assets, capacity = 9000) {
    this.capacity = capacity;
    const geo = stickGeometry();
    this.dim = new Float32Array(capacity * 4);
    this.ends = new Float32Array(capacity * 4);
    this.burn = new Float32Array(capacity * 4);
    this.aDim = new THREE.InstancedBufferAttribute(this.dim, 4).setUsage(THREE.DynamicDrawUsage);
    this.aEnds = new THREE.InstancedBufferAttribute(this.ends, 4).setUsage(THREE.DynamicDrawUsage);
    this.aBurn = new THREE.InstancedBufferAttribute(this.burn, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDim', this.aDim);
    geo.setAttribute('aEnds', this.aEnds);
    geo.setAttribute('aBurn', this.aBurn);
    const bark = assets.tex.bark_willow_02;
    this.uniforms = { uNow: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({
      map: bark.diff, normalMap: bark.nor, roughnessMap: bark.arm, aoMap: bark.arm,
      roughness: 1, metalness: 0, color: new THREE.Color(0.58, 0.5, 0.43),
      normalScale: new THREE.Vector2(1.3, 1.3),
    });
    const uniforms = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNow = uniforms.uNow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + NORMAL_BODY)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = vec2(uv.x, uv.y * aDim.y / (6.2831 * aDim.x) * 0.55 + aDim.w * 13.0);
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = vec2(uv.x, uv.y * aDim.y / (6.2831 * aDim.x) * 0.55 + aDim.w * 13.0);
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = vec2(uv.x, uv.y * aDim.y / (6.2831 * aDim.x) * 0.55 + aDim.w * 13.0);
          #endif
          #ifdef USE_AOMAP
            vAoMapUv = vec2(uv.x, uv.y * aDim.y / (6.2831 * aDim.x) * 0.55 + aDim.w * 13.0);
          #endif
        `);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNow;
          varying vec3 vSt;
          varying vec4 vEndsV;
          varying vec4 vBurnV;
          varying vec4 vDimV;
          float sHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
          float sNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
          }
          float emberHeat(float cutT) {
            if (cutT < 0.0) return 0.0;
            float age = uNow - cutT;
            if (age < 0.0) return 0.0;
            return clamp(1.0 - age / 7.0, 0.0, 1.0) * mix(1.0, 0.75, smoothstep(0.0, 1.5, age)) * (1.0 + 0.6 * exp(-age * 3.0));
          }
          vec3 emberColor(float h) {
            return mix(vec3(0.6, 0.05, 0.0), mix(vec3(4.0, 0.9, 0.1), vec3(9.0, 5.0, 1.6), smoothstep(0.6, 1.0, h)), smoothstep(0.0, 0.6, h));
          }
          vec3 stickEmissive;
          float stickChar;
        `)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float part = vSt.z;
            float y = vSt.y;
            float L = vDimV.y;
            float r0 = vDimV.x;
            stickEmissive = vec3(0.0);
            stickChar = 0.0;
            bool isCapA = part < -0.5;
            bool isCapB = part > 0.5;
            float hA = vEndsV.x > 1.5 ? emberHeat(vEndsV.z) : 0.0;
            float hB = vEndsV.y > 1.5 ? emberHeat(vEndsV.w) : 0.0;
            if ((isCapA && vEndsV.x > 1.5) || (isCapB && vEndsV.y > 1.5)) {
              vec2 c = vSt.xy - 0.5;
              float rad = length(c) * 2.0;
              float ang = atan(c.y, c.x + 1e-4);
              float rings = sin(rad * 34.0 + sNoise(vec2(ang * 3.0, rad * 4.0) + vDimV.w * 9.0) * 3.0) * 0.5 + 0.5;
              vec3 wood = mix(vec3(0.42, 0.3, 0.18), vec3(0.62, 0.48, 0.3), rings);
              wood = mix(wood, vec3(0.16, 0.12, 0.09), smoothstep(0.82, 0.95, rad));
              float h = isCapA ? hA : hB;
              float charred = clamp(0.35 + h, 0.0, 1.0);
              float cells = sNoise(c * 18.0 + vDimV.w * 31.0) * 0.6 + sNoise(c * 41.0) * 0.4;
              wood = mix(wood, vec3(0.05, 0.035, 0.03), charred * smoothstep(0.25, 0.75, cells + rad * 0.3));
              diffuseColor.rgb = wood;
              float glowMask = mix(0.35, 1.0, smoothstep(0.3, 0.85, cells)) * mix(1.0, 0.65, rad);
              float flick = 0.85 + 0.15 * sin(uNow * 17.0 + vDimV.w * 50.0 + cells * 6.0);
              stickEmissive = emberColor(h) * glowMask * h * flick;
            } else {
              float dA = y * L / max(r0, 0.004);
              float dB = (1.0 - y) * L / max(r0, 0.004);
              float n = sNoise(vec2(vSt.x * 9.0, y * L * 22.0) + vDimV.w * 17.0);
              float charA = vEndsV.x > 1.5 ? 1.0 - smoothstep(0.0, 1.8 + n, dA) : 0.0;
              float charB = vEndsV.y > 1.5 ? 1.0 - smoothstep(0.0, 1.8 + n, dB) : 0.0;
              stickChar = max(charA, charB);
              float gA = hA * exp(-dA * (2.6 - n));
              float gB = hB * exp(-dB * (2.6 - n));
              stickEmissive += emberColor(max(hA, hB)) * (gA + gB) * 0.9;
              float bt = vBurnV.x;
              float heat = vBurnV.y;
              if (heat > 0.001) {
                float d = abs(y - bt) * L / max(r0, 0.004);
                float spot = exp(-d * d * 0.9);
                stickEmissive += emberColor(heat) * spot * heat * (1.5 + n);
                stickChar = max(stickChar, spot * smoothstep(0.0, 0.5, heat));
              }
            }
            float fire = vBurnV.w;
            if (fire > 0.001) {
              float n2 = sNoise(vec2(vSt.x * 6.0, y * L * 9.0) + vDimV.w * 7.0 + uNow * 0.3);
              stickChar = max(stickChar, fire);
              stickEmissive += emberColor(0.35 + 0.35 * n2) * fire * smoothstep(0.5, 0.85, n2) * (0.35 + 0.2 * sin(uNow * 3.0 + vDimV.w * 30.0));
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.028, 0.024), stickChar * 0.92);
            diffuseColor.rgb *= mix(0.85, 1.12, fract(vDimV.w * 91.7));
          }
        `)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += stickEmissive;
          {
            float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
            totalEmissiveRadiance += vec3(0.24, 0.27, 0.35) * rim * (1.0 - stickChar * 0.8);
          }
        `)
        .replace('#include <normal_fragment_maps>', `
          if (abs(vSt.z) < 0.5) {
            #include <normal_fragment_maps>
          }
        `);
    };
    mat.customProgramCacheKey = () => 'sticks';

    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      sh.uniforms.uNow = uniforms.uNow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    };
    depth.customProgramCacheKey = () => 'sticks-depth';

    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.customDepthMaterial = depth;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.free = [];
    this.high = 0;
    this.live = new Uint8Array(capacity);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  alloc() {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.high < this.capacity) i = this.high++;
    else return -1;
    this.live[i] = 1;
    this.mesh.count = this.high;
    return i;
  }

  release(i) {
    if (i < 0 || !this.live[i]) return;
    this.live[i] = 0;
    this.mesh.setMatrixAt(i, this._zero);
    this.burn[i * 4 + 1] = 0;
    this.burn[i * 4 + 3] = 0;
    this.free.push(i);
  }

  setShape(i, radius, length, taper, seed) {
    const o = i * 4;
    this.dim[o] = radius;
    this.dim[o + 1] = Math.max(0.005, length);
    this.dim[o + 2] = taper;
    this.dim[o + 3] = seed;
  }

  setLength(i, length) { this.dim[i * 4 + 1] = Math.max(0.005, length); }

  setEnds(i, typeA, typeB, cutA = -1, cutB = -1) {
    const o = i * 4;
    this.ends[o] = typeA;
    this.ends[o + 1] = typeB;
    this.ends[o + 2] = cutA;
    this.ends[o + 3] = cutB;
  }

  setBurn(i, t, heat) {
    this.burn[i * 4] = t;
    this.burn[i * 4 + 1] = heat;
  }

  setFire(i, f) { this.burn[i * 4 + 3] = f; }

  placeAB(i, a, b, twist = 0) {
    const dir = this._tmp || (this._tmp = new THREE.Vector3());
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) dir.set(0, 1, 0); else dir.multiplyScalar(1 / len);
    this._q.setFromUnitVectors(this._up, dir);
    if (twist) {
      const tq = this._tq || (this._tq = new THREE.Quaternion());
      tq.setFromAxisAngle(this._up, twist);
      this._q.multiply(tq);
    }
    this._m.makeRotationFromQuaternion(this._q);
    this._m.setPosition(a);
    this.mesh.setMatrixAt(i, this._m);
    return len;
  }

  setMatrix(i, m) { this.mesh.setMatrixAt(i, m); }

  flush(now) {
    this.uniforms.uNow.value = now;
    const n = this.high;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.aDim, this.aEnds, this.aBurn]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }
}
