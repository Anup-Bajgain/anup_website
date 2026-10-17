import * as THREE from './vendor/three/three.module.js';
import { STLLoader } from './vendor/three/STLLoader.js';
import { mergeVertices } from './vendor/three/BufferGeometryUtils.js';

// Share the parsed STL and materials between the hero and navigation scene.
let template;
export async function loadAirliner() {
  if (!template) template = buildAirliner().catch(error => { template=null; throw error; });
  const loaded = await template;
  return {aircraft: loaded.aircraft.clone(true), manifest: loaded.manifest};
}
async function buildAirliner() {
  const materials = {
    airframe: new THREE.MeshStandardMaterial({color: 0xdce3e9, metalness: .38, roughness: .33, side: THREE.DoubleSide}),
    rim: new THREE.MeshStandardMaterial({color: 0xa4b5c2, metalness: .65, roughness: .25, side: THREE.DoubleSide}),
    intake: new THREE.MeshStandardMaterial({color: 0x111c27, metalness: .25, roughness: .65, side: THREE.DoubleSide}),
    fan: new THREE.MeshStandardMaterial({color: 0x627789, metalness: .65, roughness: .38, side: THREE.DoubleSide}),
    glass: new THREE.MeshStandardMaterial({color: 0x102c43, metalness: .55, roughness: .17, side: THREE.DoubleSide})
  };
  const modelURL = new URL('../models/airliner/airliner.stl', import.meta.url);
  const manifestURL = new URL('../models/airliner/materials.json', import.meta.url);
  const [raw, response] = await Promise.all([new STLLoader().loadAsync(modelURL.href), fetch(manifestURL)]);
  if (!response.ok) throw new Error(`Material manifest: ${response.status}`);
  const manifest = await response.json();
  // STL is the source of every aircraft surface. Split material ranges before
  // welding normals so the windshield and engine details retain crisp borders.
  const aircraft = new THREE.Group();
  for (const group of manifest.groups) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(raw.attributes.position.array.slice(group.start * 3, (group.start + group.count) * 3), 3));
    const smooth = mergeVertices(geometry, 1e-4);
    smooth.computeVertexNormals(); geometry.dispose();
    aircraft.add(new THREE.Mesh(smooth, materials[group.material]));
  }
  raw.dispose();
  return {aircraft, manifest};
}
