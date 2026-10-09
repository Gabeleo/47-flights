import * as THREE from 'three';
import { Builder } from '../geometry';
import type { PropSpawn } from '../props';
import { mulberry32, type Rand } from '../textures';
import type { Glow } from './lightPool';
import { streetMaterials, type StreetMats } from './materials';
import type { Rect, Walk } from './plan';

/**
 * What every part of the street is built into: one Builder, one set of materials, and one random sequence.
 * Everything draws from `r` in turn, so the parts must keep running in the same order or the street changes.
 */
export type StreetCtx = ReturnType<typeof streetContext>;

export function streetContext() {
  const b = new Builder();
  const M: StreetMats = streetMaterials();
  const r: Rand = mulberry32(3601);
  const props: PropSpawn[] = [];
  const glows: Glow[] = [];
  /** Raised sidewalk rectangles, for clipping light pools to. */
  const sidewalks: Rect[] = [];
  /** Everything there is to stand on above the road: sidewalks, and the station's stairs and floors. */
  const walks: Walk[] = [];
  /** Glowing billboards round lamp heads, globes and signals. */
  const hazes: THREE.Sprite[] = [];

  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (a: number, c: number) => a + r() * (c - a);
  /** Spawn a prop at local (x, z), resting on a surface at height y. */
  const prop = (kind: string, x: number, y: number, z: number, ry = r() * Math.PI * 2) => {
    const p = b.pose(x, z, ry);
    props.push({ kind, x: p.x, y, z: p.z, yaw: p.yaw });
  };
  const haze = (mat: THREE.SpriteMaterial | THREE.Material, size: number, x: number, y: number, z: number) => {
    const p = b.pose(x, z);
    const s = new THREE.Sprite(mat as THREE.SpriteMaterial);
    s.position.set(p.x, y, p.z);
    s.scale.setScalar(size);
    hazes.push(s);
  };
  /** Material for a soft additive glow round a light. */
  const hazeMat = (color: number, opacity: number) =>
    new THREE.SpriteMaterial({ map: M.tex.pool, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  /** A light source at local (x, z), height y. */
  const glow = (x: number, y: number, z: number, color: number, intensity: number, distance: number) => {
    const p = b.pose(x, z);
    glows.push({ pos: new THREE.Vector3(p.x, y, p.z), color, intensity, distance });
  };

  /** Plane showing cell `cell` of a texture split into `cells` across. */
  function atlas(mat: THREE.Material, cell: number, cells: number, w: number, h: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / cells);
    b.add(g, mat, x, y, z, ry);
  }

  /** Flat plane on the ground over [x0, z0, x1, z1] at height y. */
  function flat(mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number) {
    b.plane(mat, x1 - x0, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, { rx: -Math.PI / 2 });
  }

  return { b, M, r, props, glows, sidewalks, walks, hazes, pick, between, prop, haze, hazeMat, glow, atlas, flat };
}
