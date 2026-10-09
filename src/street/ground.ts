import * as THREE from 'three';
import { boxGeo } from '../geometry';
import type { StreetCtx } from './context';
import { AVE_LOT, AVE_ROAD, BLOCKS, CROSS_REACH, CROSSWALK, CURB, STREETS, flatWalk } from './plan';

/** The road, the sidewalks either side of it and down the cross streets, and the paint on the road. */
export function buildGround({ b, M, r, sidewalks, walks, between, flat }: StreetCtx) {
  // One sheet of asphalt under everything; the sidewalks stand on it as slabs, so wherever vertex
  // snapping opens a crack, what shows through is road, never sky.
  {
    // Off round numbers, so a camera placed on a round coordinate never sits exactly on a grid line.
    const [x0, x1, z0, z1] = [-520.37, 619.63, -320.29, 319.71];
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 57, 32);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    b.add(g, M.asphalt, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, -Math.PI / 2);
  }

  /** A sidewalk slab with its concrete flags lined up across slabs and a curb face on every side. */
  function sidewalk(x0: number, z0: number, x1: number, z1: number) {
    const [w, d] = [x1 - x0, z1 - z0];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const h = CURB + 0.1;
    const g = boxGeo(w, h, d, [1.6, 0.25]);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    // Top face (+y, verts 8..11): UVs from world position, so the joints run straight from slab to slab.
    for (let i = 8; i < 12; i++) uv.setXY(i, (cx + pos.getX(i)) / 1.6, -(cz + pos.getZ(i)) / 1.6);
    const top = g.clone();
    top.setIndex(Array.from(g.index!.array).slice(12, 18));
    const sides = g;
    sides.setIndex([...Array.from(g.index!.array).slice(0, 12), ...Array.from(g.index!.array).slice(24, 36)]);
    b.add(top, M.sidewalk, cx, CURB - h / 2, cz);
    b.add(sides, M.curb, cx, CURB - h / 2, cz);
    b.collide(cx, cz, w, d, 0, -1, CURB, true);
    sidewalks.push([x0, z0, x1, z1]);
    walks.push(flatWalk(x0, z0, x1, z1, CURB));
  }

  for (const k of BLOCKS)
    for (const s of [-1, 1]) {
      const [z0, z1] = s < 0 ? [-AVE_LOT, -AVE_ROAD] : [AVE_ROAD, AVE_LOT];
      sidewalk(k.road0, z0, k.road1, z1);
    }
  for (const st of STREETS)
    for (const e of [-1, 1])
      for (const s of [-1, 1]) {
        const [x0, x1] = e < 0 ? [st.x - st.lot, st.x - st.road] : [st.x + st.road, st.x + st.lot];
        const [z0, z1] = s < 0 ? [-CROSS_REACH, -AVE_LOT] : [AVE_LOT, CROSS_REACH];
        sidewalk(x0, z0, x1, z1);
      }

  // Road paint: a double yellow down the avenue, high-visibility crosswalks, stop bars, and the odd
  // manhole and tar patch.
  for (const k of BLOCKS) {
    const x0 = k.west ? k.west.x + k.west.road + CROSSWALK + 1 : k.x0;
    const x1 = k.east ? k.east.x - k.east.road - CROSSWALK - 1 : k.x1;
    for (const z of [-0.12, 0.12]) flat(M.yellow, x0, z - 0.05, x1, z + 0.05, 0.006);
    for (let i = 0; i < 4; i++) {
      const x = between(x0 + 5, x1 - 5);
      const z = between(-5, 5);
      if (r() < 0.5) b.plane(M.manhole, 0.85, 0.85, x, 0.007, z, { rx: -Math.PI / 2 });
      else flat(M.tarPatch, x, z, x + between(1, 4), z + between(0.6, 2), 0.005);
    }
  }
  for (const st of STREETS) {
    // Across the avenue, in line with each of the cross street's sidewalks.
    for (const e of [-1, 1]) {
      const xa = st.x + e * (st.road + 0.4);
      const xb = st.x + e * (st.road + 0.4 + CROSSWALK);
      for (let z = -AVE_ROAD + 0.4; z < AVE_ROAD - 0.3; z += 1.2) flat(M.paint, Math.min(xa, xb), z, Math.max(xa, xb), z + 0.6, 0.006);
    }
    // Across the cross street, in line with the avenue's sidewalks.
    for (const s of [-1, 1]) {
      const za = s * (AVE_ROAD + 0.6);
      const zb = s * (AVE_ROAD + 0.6 + CROSSWALK);
      for (let x = st.x - st.road + 0.3; x < st.x + st.road - 0.3; x += 1.2)
        flat(M.paint, x, Math.min(za, zb), x + 0.6, Math.max(za, zb), 0.006);
    }
    if (st.signal)
      for (const dir of [-1, 1]) {
        const x = st.x - dir * (st.road + CROSSWALK + 0.9);
        flat(M.paint, x - 0.2, dir > 0 ? 0.2 : -AVE_ROAD + 2.2, x + 0.2, dir > 0 ? AVE_ROAD - 2.2 : -0.2, 0.006);
      }
  }
}
