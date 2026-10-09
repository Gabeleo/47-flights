import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** World-space size of one texture repeat; a single number means square tiles. */
export type Tile = number | [number, number];

/**
 * Solid box turned by `yaw` about its centre (x, z), solid from y0 to y1; becomes a fixed collider in the physics world.
 * Ground colliders (a raised sidewalk, say) hold props up but don't block the player, who walks up onto them.
 */
export type Collider = { x: number; z: number; hw: number; hd: number; yaw: number; y0: number; y1: number; ground?: boolean };

/** Axis-aligned rectangle on the floor plan: x0, z0, x1, z1. */
export type Rect = [number, number, number, number];

/** Default top of a collider registered without a height: floor to ceiling. */
const FULL_HEIGHT = 2.8;

const tileSize = (t: Tile): [number, number] => (typeof t === 'number' ? [t, t] : t);

/** A box's faces, in BoxGeometry's order. */
const BOX_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
export type BoxFace = (typeof BOX_FACES)[number];

/** BoxGeometry whose UVs repeat by world size. Face order is +x, -x, +y, -y, +z, -z (4 verts each). */
export function boxGeo(w: number, h: number, d: number, tile?: Tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile !== undefined) {
    const [tu, tv] = tileSize(tile);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++)
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / tu, (uv.getY(k) * dims[f][1]) / tv);
      }
  }
  return g;
}

/**
 * Vertical prism over a footprint outline of (x, z) points, from y = 0 to h. Side UVs run along
 * the outline, so textures stay even around curves; normals are smoothed where the outline bends gently.
 */
export function prismGeo(outline: [number, number][], h: number, tile: Tile = 1) {
  const [tu, tv] = tileSize(tile);
  let pts = outline;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    area += x0 * z1 - x1 * z0;
  }
  // Walls below are wound for this orientation of the outline.
  if (area > 0) pts = [...pts].reverse();
  const n = pts.length;

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };

  const caps = THREE.ShapeUtils.triangulateShape(
    pts.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  for (const [y, ny] of [[h, 1], [0, -1]]) {
    const base = pos.length / 3;
    for (const [x, z] of pts) vert(x, y, z, 0, ny, 0, x / tu, z / tv);
    for (const [a, b, c] of caps) {
      const [ax, az] = pts[a];
      const up = (pts[b][0] - ax) * (pts[c][1] - az) - (pts[b][1] - az) * (pts[c][0] - ax) < 0;
      if (up === ny > 0) index.push(base + a, base + b, base + c);
      else index.push(base + a, base + c, base + b);
    }
  }

  const edgeNormal = (i: number): [number, number] => {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    return [-(z1 - z0) / len, (x1 - x0) / len];
  };
  /** Normal at the start of edge i: blended with the previous edge unless the corner is sharp. */
  const cornerNormal = (i: number, own: [number, number]): [number, number] => {
    const prev = edgeNormal((i + n - 1) % n);
    if (prev[0] * own[0] + prev[1] * own[1] < 0.75) return own;
    const len = Math.hypot(prev[0] + own[0], prev[1] + own[1]);
    return [(prev[0] + own[0]) / len, (prev[1] + own[1]) / len];
  };
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[j];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const own = edgeNormal(i);
    const n0 = cornerNormal(i, own);
    const next = edgeNormal(j);
    const n1 = own[0] * next[0] + own[1] * next[1] < 0.75 ? own : cornerNormal(j, next);
    const a = vert(x0, 0, z0, n0[0], 0, n0[1], s / tu, 0);
    const b = vert(x1, 0, z1, n1[0], 0, n1[1], (s + len) / tu, 0);
    const c = vert(x1, h, z1, n1[0], 0, n1[1], (s + len) / tu, h / tv);
    const d = vert(x0, h, z0, n0[0], 0, n0[1], s / tu, h / tv);
    index.push(a, b, c, a, c, d);
    s += len;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

export function mergeToMesh(geos: THREE.BufferGeometry[], mat: THREE.Material) {
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error('mergeGeometries failed');
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * One area of a floor or ceiling (see Builder.surface): `mat` over `rect`, its texture repeating every
 * `tile` and anchored so that u = 0 at x = ox and v = 0 at z = oz (v running toward -z), so the cells it's
 * cut into line up their pattern. No material leaves the area open.
 */
export type SurfaceArea = { mat: THREE.Material | null; rect: Rect; tile: Tile; origin?: [number, number] };

/** Box from a to c (x, y, z) of section w x h, for knee braces, stair stringers and lamp arms. */
export function strut(b: Builder, mat: THREE.Material, a: number[], c: number[], w: number, h: number) {
  const [dx, dy, dz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const flat = Math.hypot(dx, dz);
  b.add(boxGeo(w, h, Math.hypot(flat, dy)), mat, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, flat));
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/**
 * Collects static geometry into one merged mesh per material. Has a transform stack so
 * furniture can be authored in local space; `y` arguments are the bottom of boxes and
 * cylinders, and the centre of planes.
 */
export class Builder {
  readonly colliders: Collider[] = [];
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack = [new THREE.Matrix4()];

  private get top() {
    return this.stack[this.stack.length - 1];
  }

  push(x: number, z: number, ry = 0) {
    this.stack.push(this.top.clone().multiply(_m.makeRotationY(ry).setPosition(x, 0, z)));
  }

  pop() {
    this.stack.pop();
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) {
    _m.makeRotationFromEuler(_e.set(rx, ry, 0, 'YXZ')).setPosition(x, y, z);
    geo.applyMatrix4(_m2.multiplyMatrices(this.top, _m));
    let list = this.batches.get(mat);
    if (!list) this.batches.set(mat, (list = []));
    list.push(geo);
  }

  box(
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    o: {
      ry?: number;
      tile?: Tile;
      solid?: boolean;
      /** Faces finished in something other than `mat`, each with its own tiling. */
      faces?: Partial<Record<BoxFace, { mat: THREE.Material; tile?: Tile }>>;
    } = {},
  ) {
    const geo = boxGeo(w, h, d, o.tile);
    if (o.faces) {
      // Each face is two triangles, six indices, in BOX_FACES order.
      const index = Array.from(geo.index!.array);
      const plain: number[] = [];
      BOX_FACES.forEach((f, i) => {
        const tris = index.slice(i * 6, i * 6 + 6);
        const face = o.faces![f];
        if (!face) return plain.push(...tris);
        const g = boxGeo(w, h, d, face.tile ?? o.tile);
        g.setIndex(tris);
        this.add(g, face.mat, x, y + h / 2, z, o.ry);
      });
      geo.setIndex(plain);
    }
    this.add(geo, mat, x, y + h / 2, z, o.ry);
    if (o.solid) this.collide(x, z, w, d, o.ry, y, y + h);
  }

  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 8) {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y + h / 2, z);
  }

  sphere(mat: THREE.Material, r: number, x: number, y: number, z: number, sy = 1) {
    const g = new THREE.SphereGeometry(r, 7, 5);
    g.scale(1, sy, 1);
    this.add(g, mat, x, y, z);
  }

  plane(
    mat: THREE.Material,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    o: { ry?: number; rx?: number; tile?: Tile } = {},
  ) {
    const g = new THREE.PlaneGeometry(w, h);
    if (o.tile !== undefined) {
      const [tu, tv] = tileSize(o.tile);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tu, (uv.getY(i) * h) / tv);
    }
    this.add(g, mat, x, y, z, o.ry, o.rx);
  }

  /** Vertical prism over a footprint outline in the current local frame, standing from y to y + h. */
  prism(mat: THREE.Material, outline: [number, number][], y: number, h: number, tile?: Tile) {
    this.add(prismGeo(outline, h, tile), mat, 0, y, 0);
  }

  /** World position and yaw of a point authored in the current local frame. */
  pose(x: number, z: number, ry = 0) {
    _v.set(x, 0, z).applyMatrix4(this.top);
    const e = this.top.elements;
    return { x: _v.x, z: _v.z, yaw: Math.atan2(e[8], e[10]) + ry };
  }

  /** Register a w x d footprint (rotated by ry around its centre), solid from y0 to y1. */
  collide(x: number, z: number, w: number, d: number, ry = 0, y0 = 0, y1 = FULL_HEIGHT, ground = false) {
    const p = this.pose(x, z, ry);
    this.colliders.push({ x: p.x, z: p.z, hw: w / 2, hd: d / 2, yaw: p.yaw, y0, y1, ...(ground && { ground }) });
  }

  /** One merged geometry per material; empties the builder. */
  geometries() {
    const out = new Map<THREE.Material, THREE.BufferGeometry>();
    for (const [mat, geos] of this.batches) {
      const merged = mergeGeometries(geos);
      if (!merged) throw new Error('mergeGeometries failed');
      for (const g of geos) g.dispose();
      out.set(mat, merged);
    }
    this.batches.clear();
    return out;
  }

  /**
   * A horizontal surface over `areas`, laid as one conforming grid. Vertex snapping is why: it shifts depth
   * by centimetres at grazing angles, so a rug even a few millimetres up fights the carpet under it; and it
   * moves each vertex on its own, so where one piece's corner sits partway along another's edge (a
   * T-junction), or a floor's edge stops at the foot of a wall, a crack opens onto the void. So the surface
   * is cut along every area's edges into cells that meet only corner to corner, and each cell takes the last
   * area laid over it; an area with no material leaves its cells open (a stairwell).
   */
  surface(areas: SurfaceArea[], y = 0, facing: 'up' | 'down' = 'up') {
    const cuts = (k: 0 | 1) => {
      const v = areas.flatMap((a) => [a.rect[k], a.rect[k + 2]]).sort((a, c) => a - c);
      return v.filter((x, i) => i === 0 || x - v[i - 1] > 1e-6);
    };
    const [xs, zs] = [cuts(0), cuts(1)];
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < zs.length; j++) {
        const [x0, z0, x1, z1] = [xs[i], zs[j], xs[i + 1], zs[j + 1]];
        const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
        for (let k = areas.length - 1; k >= 0; k--) {
          const { mat, rect, tile, origin = [0, 0] } = areas[k];
          if (!(cx > rect[0] && cx < rect[2] && cz > rect[1] && cz < rect[3])) continue;
          if (mat) {
            const [tu, tv] = tileSize(tile);
            const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
            g.rotateX(facing === 'up' ? -Math.PI / 2 : Math.PI / 2);
            const pos = g.attributes.position;
            const uv = g.attributes.uv as THREE.BufferAttribute;
            for (let n = 0; n < uv.count; n++)
              uv.setXY(n, (cx + pos.getX(n) - origin[0]) / tu, (origin[1] - (cz + pos.getZ(n))) / tv);
            this.add(g, mat, cx, y, cz);
          }
          break;
        }
      }
  }

  build() {
    const group = new THREE.Group();
    for (const [mat, geo] of this.geometries()) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}
