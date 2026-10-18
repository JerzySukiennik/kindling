import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const MODELS = ['rocks_grey', 'rocks_tan', 'pebbles', 'branches', 'fire_pit', 'iron_gate', 'statue', 'log_thin', 'log_big', 'stump', 'lantern', 'street_lamp'];
const TEXSETS = ['forest_leaves_04', 'forest_ground_04', 'mud_forest', 'bark_willow_02', 'bark_willow', 'mossy_rock', 'mossy_stone_wall', 'rusty_metal_04', 'burned_ground_01'];

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.models = {};
    this.tex = {};
    this.hdr = null;
    this.total = 0;
    this.done = 0;
    this.onProgress = () => {};
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
  }

  tick() {
    this.done++;
    this.onProgress(this.done / this.total);
  }

  async load() {
    const gltf = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const jobs = [];
    this.total = MODELS.length + TEXSETS.length * 3 + 1;
    for (const name of MODELS) {
      jobs.push(gltf.loadAsync(`assets/models/${name}.glb`).then((g) => {
        const parts = [];
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.geometry.computeBoundingBox();
            o.geometry.computeBoundingSphere();
            const m = o.material;
            if (m.transmission > 0) { m.transmission = 0; m.thickness = 0; m.transmissionMap = null; m.needsUpdate = true; }
            if (m.map) m.map.anisotropy = Math.min(8, this.maxAniso);
            if (m.normalMap) m.normalMap.anisotropy = Math.min(8, this.maxAniso);
            parts.push({ name: o.name, geometry: o.geometry, material: m });
          }
        });
        parts.sort((a, b) => (parseInt(a.name.split('_').pop()) || 0) - (parseInt(b.name.split('_').pop()) || 0));
        this.models[name] = parts;
        this.tick();
      }));
    }
    for (const set of TEXSETS) {
      this.tex[set] = {};
      for (const kind of ['diff', 'nor', 'arm']) {
        jobs.push(texLoader.loadAsync(`assets/textures/${set}/${kind}.jpg`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(8, this.maxAniso);
          t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          this.tex[set][kind] = t;
          this.tick();
        }));
      }
    }
    jobs.push(new HDRLoader().loadAsync('assets/hdri/night_1k.hdr').then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      this.hdr = t;
      this.tick();
    }));
    await Promise.all(jobs);
  }

  pbr(set, repeat = 1, extra = {}) {
    const t = this.tex[set];
    const clone = (tex) => {
      if (repeat === 1) return tex;
      const c = tex.clone();
      c.repeat.set(repeat, repeat);
      c.needsUpdate = true;
      return c;
    };
    return new THREE.MeshStandardMaterial({
      map: clone(t.diff),
      normalMap: clone(t.nor),
      roughnessMap: clone(t.arm),
      metalnessMap: clone(t.arm),
      aoMap: clone(t.arm),
      roughness: 1,
      metalness: extra.metalness ?? 0,
      ...extra,
    });
  }
}
