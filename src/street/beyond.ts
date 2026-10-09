import * as THREE from 'three';
import { boxGeo, mergeToMesh } from '../geometry';
import { buildingTexture, mulberry32, type BuildingKind } from '../textures';
import { CROSS_REACH, EAST_END, END_REACH, WEST_END } from './plan';

// The rest of Astoria and Long Island City out past the fog line: low blocks all round, and the towers
// of Court Square and Queens Plaza off to the south-west, with Midtown beyond them.
// It has its own random sequence, so nothing here moves the street itself.
export function buildBeyond(group: THREE.Group) {
  const filler: THREE.BufferGeometry[] = [];
  const far = mulberry32(36);
  const box = (geos: THREE.BufferGeometry[], x: number, z: number, w: number, d: number, h: number) => {
    const g = boxGeo(w, h, d, [56, 112]);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const du = far();
    const dv = Math.floor(far() * 32) / 32;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
    g.translate(x, h / 2, z);
    geos.push(g);
  };
  for (let x = -700; x < 800; x += 42)
    for (let z = -700; z < 700; z += 42) {
      const inside = x > WEST_END - END_REACH - 30 && x < EAST_END + END_REACH + 30 && Math.abs(z) < CROSS_REACH + 25;
      if (inside || Math.hypot(x - 40, z) > 760) continue;
      box(filler, x + far() * 10, z + far() * 10, 22 + far() * 14, 22 + far() * 14, 8 + far() * far() * 22);
    }
  const fillerMat = new THREE.MeshLambertMaterial({ map: buildingTexture('prewar', 3602), emissive: 0x111111 });
  group.add(mergeToMesh(filler, fillerMat));

  const towers: Record<BuildingKind, THREE.BufferGeometry[]> = { glass: [], office: [], prewar: [] };
  const tower = (x: number, z: number, w: number, h: number, kind: BuildingKind) => box(towers[kind], x, z, w, w * (0.7 + far() * 0.5), h);
  // Court Square and Queens Plaza, about a mile off.
  for (let i = 0; i < 16; i++) tower(-420 + (far() - 0.5) * 500, 1500 + (far() - 0.5) * 400, 28 + far() * 20, 90 + far() * 150, far() < 0.6 ? 'glass' : 'office');
  tower(-380, 1450, 36, 236, 'glass');
  // Midtown, three miles beyond the river.
  for (let i = 0; i < 40; i++) {
    const t = far();
    tower(-3550 + (far() - 0.5) * 1800, 3300 + (far() - 0.5) * 1400, 40 + far() * 30, 120 + t * t * 300, far() < 0.5 ? 'glass' : 'office');
  }
  for (const kind of ['glass', 'office', 'prewar'] as const) {
    if (!towers[kind].length) continue;
    const mat = new THREE.MeshBasicMaterial({ map: buildingTexture(kind, 3610 + kind.length), color: 0x8a7a8c, fog: false });
    group.add(mergeToMesh(towers[kind], mat));
  }
}
