import * as THREE from 'three';

export function triplanarMaterial(assets, set, scale, opts = {}) {
  const t = assets.tex[set];
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    roughness: 1,
    metalness: opts.metalness ?? 0,
    envMapIntensity: opts.envMapIntensity ?? 1,
  });
  const uniforms = {
    tTpD: { value: t.diff },
    tTpN: { value: t.nor },
    tTpA: { value: t.arm },
    uTpScale: { value: 1 / scale },
    uMossUp: { value: opts.mossUp ?? 0 },
    tEngrave: { value: opts.engrave || null },
    uInscr: { value: opts.inscr || new THREE.Vector4(0, 0, 1, 1) },
    uDarkGrooves: { value: opts.darkGrooves ?? 0.5 },
  };
  const engrave = !!opts.engrave;
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTpPos;
        varying vec3 vTpNrm;
        varying vec3 vTpLocal;
        varying vec3 vTpLocalN;
        ${engrave ? 'attribute float aCell;\nvarying float vCell;' : ''}
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tpW = vec4(transformed, 1.0);
        vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpW = instanceMatrix * tpW;
          tpN = mat3(instanceMatrix) * tpN;
        #endif
        #ifdef USE_BATCHING
          tpW = batchingMatrix * tpW;
          tpN = mat3(batchingMatrix) * tpN;
        #endif
        tpW = modelMatrix * tpW;
        vTpPos = tpW.xyz;
        vTpNrm = normalize(mat3(modelMatrix) * tpN);
        vTpLocal = position;
        vTpLocalN = objectNormal;
        ${engrave ? 'vCell = aCell;' : ''}
      `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tTpD, tTpN, tTpA, tEngrave;
        uniform float uTpScale, uMossUp, uDarkGrooves;
        uniform vec4 uInscr;
        varying vec3 vTpPos;
        varying vec3 vTpNrm;
        varying vec3 vTpLocal;
        varying vec3 vTpLocalN;
        ${engrave ? 'varying float vCell;' : ''}
        vec3 tpW3;
        vec3 tpBlend(vec3 n) { vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z); }
        vec4 tpSample(sampler2D t) {
          vec3 p = vTpPos * uTpScale;
          return texture2D(t, p.zy) * tpW3.x + texture2D(t, p.xz) * tpW3.y + texture2D(t, p.xy) * tpW3.z;
        }
        float engraveH(vec2 uv) {
          ${engrave ? `
          float cell = floor(vCell + 0.5);
          vec2 c = vec2(mod(cell, 4.0), floor(cell / 4.0));
          vec2 u = (clamp(uv, 0.0, 1.0) + c) / 4.0;
          return texture2D(tEngrave, u).r;` : 'return 0.0;'}
        }
      `)
      .replace('#include <map_fragment>', `
        tpW3 = tpBlend(normalize(vTpNrm));
        vec4 tpC = tpSample(tTpD);
        vec3 alb = tpC.rgb;
        float moss = smoothstep(0.55, 0.95, normalize(vTpNrm).y) * uMossUp;
        alb = mix(alb, alb * vec3(0.55, 0.75, 0.42), moss);
        float eng = 0.0;
        vec2 euv = vec2(0.0);
        ${engrave ? `
        if (vTpLocalN.z > 0.6) {
          euv = (vTpLocal.xy - uInscr.xy) / uInscr.zw;
          if (euv.x > 0.0 && euv.x < 1.0 && euv.y > 0.0 && euv.y < 1.0) eng = engraveH(euv);
        }
        alb *= 1.0 - eng * uDarkGrooves;` : ''}
        diffuseColor.rgb *= alb;
      `)
      .replace('#include <roughnessmap_fragment>', `
        vec4 tpA = tpSample(tTpA);
        float roughnessFactor = clamp(tpA.g + eng * 0.1, 0.25, 1.0);
      `)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = metalness * tpA.b;`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 wn = normalize(vTpNrm);
          if (!gl_FrontFacing) wn = -wn;
          vec3 p = vTpPos * uTpScale;
          vec3 nx = texture2D(tTpN, p.zy).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(tTpN, p.xz).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(tTpN, p.xy).xyz * 2.0 - 1.0;
          nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
          ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
          nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
          vec3 wPert = normalize(nx.zyx * tpW3.x + ny.xzy * tpW3.y + nz.xyz * tpW3.z);
          ${engrave ? `
          if (vTpLocalN.z > 0.6 && euv.x > 0.0 && euv.x < 1.0 && euv.y > 0.0 && euv.y < 1.0) {
            float e = 1.0 / 256.0;
            float hx = engraveH(euv + vec2(e, 0.0)) - engraveH(euv - vec2(e, 0.0));
            float hy = engraveH(euv + vec2(0.0, e)) - engraveH(euv - vec2(0.0, e));
            vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), wn) + vec3(1e-4));
            vec3 by = normalize(cross(wn, tx));
            wPert = normalize(wPert + (tx * hx + by * hy) * 1.6);
          }` : ''}
          normal = normalize((viewMatrix * vec4(wPert, 0.0)).xyz);
        }
      `)
      .replace('#include <aomap_fragment>', `
        float ambientOcclusion = mix(1.0, tpA.r, 0.8) * (1.0 - eng * 0.35);
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        reflectedLight.indirectSpecular *= ambientOcclusion;
      `);
  };
  mat.customProgramCacheKey = () => 'tp-' + (engrave ? 'e' : 'n');
  return mat;
}
