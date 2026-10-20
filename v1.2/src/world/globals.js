import * as THREE from 'three';

export const U = {
  time: { value: 0 },
  wind: { value: new THREE.Vector2(0.8, 0.35) },
  pushers: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -1000, 0, 0)) },
  fire: { value: 0 },
  firePos: { value: new THREE.Vector3(0, 0, 17) },
};
