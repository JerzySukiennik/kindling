import * as THREE from 'three';
import { TERRAIN, groundHeight, splatAt } from './layout.js';
import { smoothstep } from './noise.js';

function buildGeometry() {
  const geo = new THREE.BufferGeometry();
  const xs = [];
  const zs = [];
  const pushAxis = (arr, a, b, regions) => {
    let v = a;
    while (v < b) {
      arr.push(v);
      let step = regions[regions.length - 1][2];
      for (const [r0, r1, s] of regions) if (v >= r0 && v < r1) { step = s; break; }
      v += step;
    }
    arr.push(b);
  };
  pushAxis(xs, TERRAIN.x0, TERRAIN.x1, [[-26, 26, 0.33], [-50, 50, 0.9], [-1e9, 1e9, 3]]);
  pushAxis(zs, TERRAIN.z0, TERRAIN.z1, [[-66, 24, 0.33], [-120, 40, 0.9], [-1e9, 1e9, 3]]);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const splat = new Float32Array(nx * nz * 4);
  let i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = xs[ix];
      const z = zs[iz];
      pos[i * 3] = x;
      pos[i * 3 + 1] = groundHeight(x, z);
      pos[i * 3 + 2] = z;
      const s = splatAt(x, z);
      splat[i * 4] = s.trampled;
      splat[i * 4 + 1] = s.mud;
      splat[i * 4 + 2] = s.burnt;
      splat[i * 4 + 3] = s.corn;
      i++;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export function createTerrain(assets) {
  const geo = buildGeometry();
  const T = assets.tex;
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
  const uniforms = {
    tLeavesD: { value: T.forest_leaves_04.diff }, tLeavesN: { value: T.forest_leaves_04.nor }, tLeavesA: { value: T.forest_leaves_04.arm },
    tDirtD: { value: T.forest_ground_04.diff }, tDirtN: { value: T.forest_ground_04.nor }, tDirtA: { value: T.forest_ground_04.arm },
    tMudD: { value: T.mud_forest.diff }, tMudN: { value: T.mud_forest.nor }, tMudA: { value: T.mud_forest.arm },
    tBurnD: { value: T.burned_ground_01.diff }, tBurnN: { value: T.burned_ground_01.nor }, tBurnA: { value: T.burned_ground_01.arm },
    uScorch: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splat;
        varying vec4 vSplat;
        varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tLeavesD, tLeavesN, tLeavesA, tDirtD, tDirtN, tDirtA, tMudD, tMudN, tMudA, tBurnD, tBurnN, tBurnA;
        uniform float uScorch;
        varying vec4 vSplat;
        varying vec3 vWPos;
        vec4 gW;
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
        }
        vec4 tri(sampler2D t, vec2 uv) {
          vec2 uv2 = vec2(uv.y, -uv.x) * 0.61 + 0.37;
          float m = smoothstep(0.35, 0.65, vnoise(uv * 0.21));
          return mix(texture2D(t, uv), texture2D(t, uv2), m);
        }
        vec3 triN(sampler2D t, vec2 uv) {
          vec2 uv2 = vec2(uv.y, -uv.x) * 0.61 + 0.37;
          float m = smoothstep(0.35, 0.65, vnoise(uv * 0.21));
          vec3 a = texture2D(t, uv).xyz * 2.0 - 1.0;
          vec3 b = texture2D(t, uv2).xyz * 2.0 - 1.0;
          b.xy = vec2(-b.y, b.x);
          return mix(a, b, m);
        }
        void computeWeights() {
          float n = vnoise(vWPos.xz * 0.9) * 0.5 + vnoise(vWPos.xz * 3.1) * 0.25;
          float tr = smoothstep(0.25, 0.75, vSplat.x + (n - 0.37) * 0.8);
          float mu = smoothstep(0.3, 0.7, vSplat.y + (n - 0.37) * 0.6) * (1.0 - tr * 0.6);
          float bu = smoothstep(0.2, 0.6, vSplat.z + (n - 0.37) * 0.5);
          gW = vec4(tr, mu, bu, vSplat.w);
        }
        `)
      .replace('#include <map_fragment>', `
        computeWeights();
        vec2 uvL = vWPos.xz / 3.2;
        vec2 uvD = vWPos.xz / 2.6;
        vec2 uvM = vWPos.xz / 3.6;
        vec2 uvB = vWPos.xz / 2.4;
        vec2 gx = dFdx(vWPos.xz);
        vec2 gy = dFdy(vWPos.xz);
        float cL = (1.0 - gW.y) * (1.0 - gW.x) * (1.0 - gW.z);
        float cM = gW.y * (1.0 - gW.x) * (1.0 - gW.z);
        float cD = gW.x * (1.0 - gW.z);
        float cB = gW.z;
        float mixR = smoothstep(0.35, 0.65, vnoise(vWPos.xz * 0.07));
        vec3 albedo = vec3(0.0);
        vec4 arm = vec4(0.0);
        vec3 tn = vec3(0.0);
        #define LAYER(C, TD, TA, TN, UV, SC, TINT) if (C > 0.01) { \
          vec2 dx = gx / SC, dy = gy / SC; \
          vec2 uv2 = vec2(UV.y, -UV.x) * 0.61 + 0.37; \
          vec3 c1 = textureGrad(TD, UV, dx, dy).rgb; \
          vec3 c2 = textureGrad(TD, uv2, vec2(dx.y, -dx.x) * 0.61, vec2(dy.y, -dy.x) * 0.61).rgb; \
          albedo += mix(c1, c2, mixR) * TINT * C; \
          arm += textureGrad(TA, UV, dx, dy) * C; \
          tn += (textureGrad(TN, UV, dx, dy).xyz * 2.0 - 1.0) * C; }
        LAYER(cL, tLeavesD, tLeavesA, tLeavesN, uvL, 3.2, vec3(1.0))
        LAYER(cM, tMudD, tMudA, tMudN, uvM, 3.6, vec3(0.85, 0.85, 0.9))
        LAYER(cD, tDirtD, tDirtA, tDirtN, uvD, 2.6, vec3(1.0))
        LAYER(cB, tBurnD, tBurnA, tBurnN, uvB, 2.4, vec3(0.75))
        albedo *= mix(0.78, 1.05, vnoise(vWPos.xz * 0.08));
        albedo = mix(albedo, albedo * vec3(0.95, 0.9, 0.75), gW.w * 0.6);
        float pitDark = smoothstep(0.0, -1.2, vWPos.y) * gW.z;
        albedo *= 1.0 - pitDark * 0.35 - uScorch * gW.z * 0.4;
        diffuseColor.rgb *= albedo;
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = clamp(arm.g * mix(1.0, 0.75, gW.y), 0.3, 1.0);
      `)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = 0.0;`)
      .replace('#include <normal_fragment_maps>', `
        tn.xy *= 1.35;
        tn = normalize(tn + vec3(0.0, 0.0, 1e-4));
        vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        vec3 wt = normalize(cross(wn, vec3(0.0, 0.0, 1.0)));
        vec3 wb = cross(wt, wn);
        vec3 wPert = normalize(wt * tn.x + wb * tn.y + wn * tn.z);
        normal = normalize((viewMatrix * vec4(wPert, 0.0)).xyz);
      `)
      .replace('#include <aomap_fragment>', `
        float ambientOcclusion = mix(1.0, arm.r, 0.85);
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        reflectedLight.indirectSpecular *= ambientOcclusion;
      `);
  };
  mat.customProgramCacheKey = () => 'kindling-terrain';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}

export function terrainColliderData(x0, x1, z0, z1, step) {
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  const verts = new Float32Array(nx * nz * 3);
  let i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      verts[i++] = x;
      verts[i++] = groundHeight(x, z);
      verts[i++] = z;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  return { verts, idx };
}

export { smoothstep };
